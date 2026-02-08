"""
Structured streaming utilities for LangChain + OpenRouter.

Provides incremental parsing of partial JSON chunks into BaseModel instances,
similar to Agno's implementation. Handles streaming structured output by:
1. Accumulating content chunks
2. Trying multiple strategies to parse partial JSON (Agno's approach)
3. Merging fields intelligently based on BaseModel schema
4. Validating and returning incremental BaseModel updates
"""
import json
import re
from typing import List, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

from app.utils.logging import get_logger

logger = get_logger("structured_streaming")

T = TypeVar("T", bound=BaseModel)


def try_parse_partial_json(text: str) -> Optional[dict]:
    """
    Try to parse partial JSON, returning what we can.
    
    Uses aggressive strategies to close incomplete JSON structures.
    This handles streaming scenarios where JSON arrives incrementally.
    
    Args:
        text: String that may contain partial JSON
        
    Returns:
        Parsed dict if successful, None otherwise
    """
    if not text or not text.strip():
        return None
    
    # Try parsing as-is first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Count open brackets to determine what needs closing
    open_braces = text.count('{') - text.count('}')
    open_brackets = text.count('[') - text.count(']')
    in_string = False
    last_char = ''
    
    # Check if we're in the middle of a string
    quote_count = 0
    escaped = False
    for c in text:
        if c == '\\' and not escaped:
            escaped = True
            continue
        if c == '"' and not escaped:
            quote_count += 1
        escaped = False
    in_string = quote_count % 2 == 1
    
    # Build closing sequence
    attempts = []
    
    if in_string:
        # Close the string first
        base = text + '"'
        attempts.append(base + ']' * open_brackets + '}' * open_braces)
        attempts.append(base + '}' * open_braces)
        # Maybe we're in a string within an array
        attempts.append(base + '"]' + '}' * max(0, open_braces))
    else:
        # Not in string, just close brackets
        attempts.append(text + ']' * open_brackets + '}' * open_braces)
        attempts.append(text + '}' * open_braces)
    
    # Also try common patterns
    attempts.extend([
        text + '}',
        text + ']}',
        text + '"}',
        text + '"]}',
        text + '"}]}',
        text + '": null}',
        text + '": []}',
        text + '": {}}',
        text + '": ""}',
        text + '": false}',
        text + '": true}',
        text + '": 0}',
        text + ': null}',
        text + 'null}',
    ])
    
    for attempt in attempts:
        try:
            result = json.loads(attempt)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            continue
    
    return None


def _parse_individual_json(
    content: str, output_schema: Type[T]
) -> Optional[T]:
    """
    Parse JSON from content and create a partial model with defaults for missing fields.
    
    Uses Agno's approach: tries to parse partial JSON, fills in defaults for missing required fields.
    
    Args:
        content: String content containing JSON (may be partial)
        output_schema: Pydantic BaseModel class to parse into
        
    Returns:
        BaseModel instance if valid data found, None otherwise
    """
    # Try to parse the JSON (handles partial JSON)
    parsed_dict = try_parse_partial_json(content)
    
    if not parsed_dict or not isinstance(parsed_dict, dict):
        return None
    
    # Get the expected fields from the response model
    model_fields = (
        output_schema.model_fields
        if hasattr(output_schema, "model_fields")
        else {}
    )
    
    # Build data with defaults for missing required fields
    merged_data: dict = {}
    
    for field_name, field_info in model_fields.items():
        if field_name in parsed_dict:
            merged_data[field_name] = parsed_dict[field_name]
        elif field_info.default is not None:
            # Use field default
            merged_data[field_name] = field_info.default
        elif field_info.default_factory is not None:
            # Use default factory
            merged_data[field_name] = field_info.default_factory()
        else:
            # Provide sensible defaults for common types based on annotation
            annotation = field_info.annotation
            if annotation is str or (hasattr(annotation, "__origin__") and annotation.__origin__ is str):
                merged_data[field_name] = ""
            elif annotation is bool:
                merged_data[field_name] = False
            elif annotation is int:
                merged_data[field_name] = 0
            elif annotation is float:
                merged_data[field_name] = 0.0
            elif annotation is list or (hasattr(annotation, "__origin__") and annotation.__origin__ is list):
                merged_data[field_name] = []
            elif hasattr(annotation, "__origin__") and annotation.__origin__ is type(None):
                merged_data[field_name] = None
            # Check for Optional types
            elif hasattr(annotation, "__args__") and type(None) in getattr(annotation, "__args__", ()):
                merged_data[field_name] = None
            # For Literal types, use first option
            elif hasattr(annotation, "__origin__") and str(annotation.__origin__) == "typing.Literal":
                args = getattr(annotation, "__args__", ())
                if args:
                    merged_data[field_name] = args[0]
    
    if not merged_data:
        return None
    
    try:
        return output_schema.model_validate(merged_data)
    except ValidationError as e:
        # Log debug but don't break streaming (partial JSON is expected)
        logger.debug(f"Validation failed on merged data: {e}")
        return None


def parse_response_model_str(
    content: str, output_schema: Type[T]
) -> Optional[T]:
    """
    Parse response model from string content (may be partial JSON).
    
    Main parsing function that handles edge cases. Uses Agno's approach:
    tries multiple strategies to parse partial JSON, then merges fields.
    
    Args:
        content: String content containing JSON (may be partial)
        output_schema: Pydantic BaseModel class to parse into
        
    Returns:
        BaseModel instance if valid data found, None otherwise
    """
    if not content or not content.strip():
        return None
    
    # Try to parse directly (handles partial JSON)
    result = _parse_individual_json(content, output_schema)
    
    if result is not None:
        return result
    
    # If no result, try to extract JSON from markdown code blocks
    # Some LLMs wrap JSON in ```json ... ``` blocks
    json_block_pattern = r"```(?:json)?\s*(\{.*?)\s*```"
    matches = re.findall(json_block_pattern, content, re.DOTALL)
    
    if matches:
        for match in matches:
            result = _parse_individual_json(match, output_schema)
            if result is not None:
                return result
    
    return None


class StructuredStreamingHandler:
    """
    Smart handler for streaming structured output.
    
    Handles both:
    1. Raw JSON strings (incremental parsing like Agno)
    2. Already-parsed BaseModel objects (from LangChain's structured output)
    
    Automatically detects the chunk type and merges updates intelligently.
    Only yields updates when meaningful content has changed.
    """
    
    def __init__(self, output_schema: Type[T], yield_every_n_chars: int = 5):
        """
        Initialize streaming handler.
        
        Args:
            output_schema: Pydantic BaseModel class to parse into
            yield_every_n_chars: Yield update every N characters of new content
        """
        self.output_schema = output_schema
        self.response_content = ""
        self.last_valid_model: Optional[T] = None
        self.last_parsed_dict: Optional[dict] = None
        self.last_yielded_content_len: int = 0
        self.yield_every_n_chars = yield_every_n_chars
    
    def _is_basemodel_instance(self, obj) -> bool:
        """Check if object is an instance of the expected BaseModel."""
        return isinstance(obj, self.output_schema)
    
    def _merge_basemodel_updates(self, new_model: T) -> Optional[T]:
        """
        Merge a new BaseModel instance with the last valid one.
        
        Intelligently merges fields:
        - Lists: extend
        - Other fields: use latest value
        """
        if self.last_valid_model is None:
            return new_model
        
        # Get dicts for comparison
        new_dict = new_model.model_dump()
        last_dict = self.last_valid_model.model_dump()
        
        # Merge fields intelligently
        merged_dict = last_dict.copy()
        model_fields = self.output_schema.model_fields if hasattr(self.output_schema, "model_fields") else {}
        
        for field_name in model_fields:
            if field_name in new_dict:
                new_value = new_dict[field_name]
                last_value = merged_dict.get(field_name)
                
                # If field is a list, extend it
                if isinstance(new_value, list):
                    if last_value is None:
                        merged_dict[field_name] = new_value.copy()
                    else:
                        merged_dict[field_name] = list(last_value) + new_value
                else:
                    # Use latest value
                    merged_dict[field_name] = new_value
        
        # Check if merged data changed
        if merged_dict != self.last_parsed_dict:
            try:
                merged_model = self.output_schema.model_validate(merged_dict)
                self.last_parsed_dict = merged_dict
                self.last_valid_model = merged_model
                return merged_model
            except Exception:
                # If validation fails, just use the new model
                self.last_parsed_dict = new_dict
                self.last_valid_model = new_model
                return new_model
        
        return None
    
    def add_chunk(self, chunk) -> Optional[T]:
        """
        Add a chunk and return incremental BaseModel update if available.
        
        Smart detection:
        - If chunk is already a BaseModel instance, merge it
        - If chunk is a string, parse it as JSON incrementally
        
        Args:
            chunk: Can be a BaseModel instance, dict, or string
            
        Returns:
            Updated BaseModel instance if data changed, None otherwise
        """
        # Case 1: Already a BaseModel instance
        if self._is_basemodel_instance(chunk):
            return self._merge_basemodel_updates(chunk)
        
        # Case 2: Dict that can be converted to BaseModel
        if isinstance(chunk, dict):
            try:
                model_instance = self.output_schema.model_validate(chunk)
                return self._merge_basemodel_updates(model_instance)
            except Exception:
                pass
        
        # Case 3: String (raw JSON - Agno's approach)
        if isinstance(chunk, str) and chunk:
            self.response_content += chunk
            
            # Try to parse incremental update
            parsed = parse_response_model_str(
                self.response_content, self.output_schema
            )
            
            if parsed is not None:
                current_dict = parsed.model_dump()
                
                # Get current content length
                current_content_len = len(self._get_primary_content(current_dict) or "")
                
                # Yield if:
                # 1. First valid parse, OR
                # 2. Content grew by yield_every_n_chars, OR  
                # 3. Other fields changed (not just content growing)
                should_yield = (
                    self.last_parsed_dict is None or
                    current_content_len >= self.last_yielded_content_len + self.yield_every_n_chars or
                    self._non_content_fields_changed(current_dict, self.last_parsed_dict)
                )
                
                if should_yield:
                    self.last_parsed_dict = current_dict
                    self.last_valid_model = parsed
                    self.last_yielded_content_len = current_content_len
                    return parsed
                else:
                    # Update internal state but don't yield
                    self.last_parsed_dict = current_dict
                    self.last_valid_model = parsed
        
        return None
    
    def _get_primary_content(self, data: dict) -> Optional[str]:
        """Get the primary content field from parsed data."""
        content_fields = ["response", "content", "text", "message", "answer", "output"]
        for field in content_fields:
            if field in data and isinstance(data[field], str):
                return data[field]
        return None
    
    def _non_content_fields_changed(self, new_dict: dict, old_dict: dict) -> bool:
        """Check if any non-content fields changed."""
        if old_dict is None:
            return True
        content_fields = {"response", "content", "text", "message", "answer", "output"}
        for key in new_dict:
            if key not in content_fields:
                if new_dict.get(key) != old_dict.get(key):
                    return True
        return False
    
    def get_last_valid(self) -> Optional[T]:
        """
        Get the last valid BaseModel instance parsed.
        
        Returns:
            Last valid BaseModel instance or None
        """
        return self.last_valid_model
    
    def reset(self):
        """Reset the handler state."""
        self.response_content = ""
        self.last_valid_model = None
        self.last_parsed_dict = None
        self.last_yielded_content_len = 0
