"""Base dataset utilities for agent-lightning training.

This module provides dataset classes and utilities that implement
agent-lightning's Dataset protocol for training.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, Generic, List, Optional, Sequence, Tuple, TypeVar, Union

from pydantic import BaseModel, Field

from app.utils.logging import get_logger

logger = get_logger("training_datasets")

T = TypeVar("T")


class TaskDataset(Generic[T], Sequence[T]):
    """A simple dataset implementation compatible with agent-lightning.
    
    This class wraps a list of items and provides the Sequence interface
    required by agent-lightning's Dataset protocol.
    
    Type Parameters:
        T: The type of items in the dataset.
    
    Example:
        ```python
        tasks = [
            {"message": "How do I reset my password?"},
            {"message": "I need help with billing"},
        ]
        dataset = TaskDataset(tasks)
        
        # Use with trainer
        trainer.fit(agent, train_dataset=dataset)
        ```
    """

    def __init__(
        self,
        items: List[T],
        name: Optional[str] = None,
    ) -> None:
        """Initialize the dataset.
        
        Args:
            items: List of task items.
            name: Optional name for the dataset (for logging).
        """
        self._items = items
        self._name = name or "TaskDataset"
    
    def __getitem__(self, index: int) -> T:
        """Get item at index."""
        return self._items[index]
    
    def __len__(self) -> int:
        """Get dataset length."""
        return len(self._items)
    
    def __repr__(self) -> str:
        return f"{self._name}(n={len(self)})"
    
    def shuffle(self, seed: Optional[int] = None) -> "TaskDataset[T]":
        """Return a new shuffled dataset.
        
        Args:
            seed: Optional random seed for reproducibility.
        
        Returns:
            New TaskDataset with shuffled items.
        """
        items = list(self._items)
        if seed is not None:
            random.seed(seed)
        random.shuffle(items)
        return TaskDataset(items, name=self._name)
    
    def sample(self, n: int, seed: Optional[int] = None) -> "TaskDataset[T]":
        """Return a random sample of items.
        
        Args:
            n: Number of items to sample.
            seed: Optional random seed.
        
        Returns:
            New TaskDataset with sampled items.
        """
        if seed is not None:
            random.seed(seed)
        
        n = min(n, len(self))
        sampled = random.sample(self._items, n)
        return TaskDataset(sampled, name=f"{self._name}_sample")
    
    def to_list(self) -> List[T]:
        """Convert to list."""
        return list(self._items)


class CustomerSupportTask(BaseModel):
    """A customer support training task.
    
    Attributes:
        message: The customer's inquiry message.
        expected_sentiment: Expected sentiment classification (optional).
        expected_escalation: Whether escalation is expected (optional).
        metadata: Additional task metadata.
    """
    
    message: str = Field(description="Customer inquiry message")
    expected_sentiment: Optional[str] = Field(
        default=None,
        description="Expected sentiment: positive, neutral, negative"
    )
    expected_escalation: Optional[bool] = Field(
        default=None,
        description="Whether escalation is expected"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata"
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for agent invocation."""
        return {"message": self.message, **self.metadata}


class CustomerSupportDataset(TaskDataset[Dict[str, Any]]):
    """Dataset specifically for customer support training.
    
    This dataset wraps CustomerSupportTask items and provides them
    as dictionaries suitable for the LitCustomerSupportAgent.
    
    Example:
        ```python
        tasks = [
            CustomerSupportTask(
                message="How do I reset my password?",
                expected_sentiment="neutral",
            ),
        ]
        dataset = CustomerSupportDataset(tasks)
        ```
    """

    def __init__(
        self,
        tasks: Union[List[CustomerSupportTask], List[Dict[str, Any]]],
        name: Optional[str] = None,
    ) -> None:
        """Initialize the dataset.
        
        Args:
            tasks: List of tasks (CustomerSupportTask or dicts).
            name: Optional dataset name.
        """
        # Convert to dicts if needed
        items: List[Dict[str, Any]] = []
        for task in tasks:
            if isinstance(task, CustomerSupportTask):
                items.append(task.to_dict())
            elif isinstance(task, dict):
                items.append(task)
            else:
                items.append({"message": str(task)})
        
        super().__init__(items, name=name or "CustomerSupportDataset")


def load_dataset_from_jsonl(
    path: Union[str, Path],
    message_key: str = "message",
    limit: Optional[int] = None,
) -> TaskDataset[Dict[str, Any]]:
    """Load a dataset from a JSONL file.
    
    Each line in the file should be a valid JSON object containing
    at minimum the message key.
    
    Args:
        path: Path to the JSONL file.
        message_key: Key containing the message/query text.
        limit: Optional limit on number of items to load.
    
    Returns:
        TaskDataset containing the loaded items.
    
    Raises:
        FileNotFoundError: If the file doesn't exist.
        json.JSONDecodeError: If a line is not valid JSON.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")
    
    items: List[Dict[str, Any]] = []
    
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit is not None and i >= limit:
                break
            
            line = line.strip()
            if not line:
                continue
            
            try:
                item = json.loads(line)
                
                # Ensure message key exists
                if message_key not in item:
                    logger.warning(
                        f"Line {i+1}: Missing '{message_key}' key, skipping"
                    )
                    continue
                
                items.append(item)
                
            except json.JSONDecodeError as e:
                logger.warning(f"Line {i+1}: Invalid JSON - {e}")
                continue
    
    logger.info(f"Loaded {len(items)} items from {path}")
    return TaskDataset(items, name=path.stem)


def load_dataset_from_list(
    items: List[Union[str, Dict[str, Any]]],
    message_key: str = "message",
) -> TaskDataset[Dict[str, Any]]:
    """Create a dataset from a list of items.
    
    Items can be strings (converted to dicts with message_key) or dicts.
    
    Args:
        items: List of items (strings or dicts).
        message_key: Key to use for string items.
    
    Returns:
        TaskDataset containing the items.
    """
    processed: List[Dict[str, Any]] = []
    
    for item in items:
        if isinstance(item, str):
            processed.append({message_key: item})
        elif isinstance(item, dict):
            processed.append(item)
        else:
            processed.append({message_key: str(item)})
    
    return TaskDataset(processed)


def create_train_val_split(
    dataset: TaskDataset[T],
    val_ratio: float = 0.2,
    seed: Optional[int] = None,
) -> Tuple[TaskDataset[T], TaskDataset[T]]:
    """Split a dataset into training and validation sets.
    
    Args:
        dataset: The dataset to split.
        val_ratio: Ratio of items for validation (0.0 to 1.0).
        seed: Optional random seed for reproducibility.
    
    Returns:
        Tuple of (train_dataset, val_dataset).
    """
    if seed is not None:
        random.seed(seed)
    
    items = list(dataset.to_list())
    random.shuffle(items)
    
    val_size = int(len(items) * val_ratio)
    
    val_items = items[:val_size]
    train_items = items[val_size:]
    
    logger.info(
        f"Split dataset: {len(train_items)} train, {len(val_items)} val "
        f"(ratio={val_ratio:.2f})"
    )
    
    return (
        TaskDataset(train_items, name="train"),
        TaskDataset(val_items, name="val"),
    )


# Example datasets for testing
EXAMPLE_CUSTOMER_SUPPORT_TASKS = [
    {"message": "How do I reset my password?"},
    {"message": "I was charged twice for my subscription"},
    {"message": "Your product is amazing! Best purchase ever!"},
    {"message": "I need to speak with a manager immediately"},
    {"message": "When will my order arrive?"},
    {"message": "Can I get a refund for my purchase?"},
    {"message": "The app keeps crashing on my phone"},
    {"message": "How do I update my billing information?"},
    {"message": "I have a question about your privacy policy"},
    {"message": "This is the worst customer service I've ever experienced!"},
]


def get_example_dataset() -> CustomerSupportDataset:
    """Get an example customer support dataset for testing.
    
    Returns:
        CustomerSupportDataset with example tasks.
    """
    return CustomerSupportDataset(
        [CustomerSupportTask(**t) if isinstance(t, dict) and "message" in t 
         else CustomerSupportTask(message=str(t)) 
         for t in EXAMPLE_CUSTOMER_SUPPORT_TASKS],
        name="example_dataset",
    )
