# Agents Structure

This directory contains agent implementations using LangChain's `create_agent` with a modular structure pattern.

## Directory Structure

```
agents/
├── __init__.py                 # Main exports
├── agents/                     # Agent implementations
│   ├── __init__.py
│   └── customer_support.py     # Customer support agent
├── prompt/                      # Prompt templates
│   ├── __init__.py
│   └── customer_support.py     # Prompts for customer support
├── tool/                        # LangChain tools
│   ├── __init__.py
│   └── customer_support.py     # Tools for customer support
└── structured_output/           # Pydantic models for structured outputs
    ├── __init__.py
    └── customer_support.py      # Output models for customer support
```

## Pattern

Each agent follows this structure:

1. **Agent Implementation** (`agents/`): The main agent class using `create_agent`
2. **Prompts** (`prompt/`): System prompts for the agent
3. **Tools** (`tool/`): LangChain tools that the agent can use
4. **Structured Outputs** (`structured_output/`): Pydantic models for type-safe outputs

## Adding a New Agent

To add a new agent (e.g., `evaluation`):

1. Create `agents/evaluation.py` with your agent class using `create_agent`
2. Create `prompt/evaluation.py` with system prompt
3. Create `tool/evaluation.py` with any tools needed
4. Create `structured_output/evaluation.py` with output models
5. Update `__init__.py` files to export your new agent

## Example Usage

### Using the Customer Support Agent

```python
from app.agents import CustomerSupportAgent
from app.infrastructure.llm_provider import OpenRouterProvider

# Initialize
provider = OpenRouterProvider()
agent = CustomerSupportAgent(
    llm_provider=provider,
    model_name="openai/gpt-4o-mini",
    temperature=0.7
)

# Handle customer inquiry (async)
response = await agent.handle_inquiry(
    customer_message="I need help with my order",
    customer_id="user_123",
    session_id="support-session-456",
    tags=["support", "order"],
    metadata={"order_id": "ORD-789"}
)

print(f"Response: {response.response}")
print(f"Requires escalation: {response.requires_escalation}")
print(f"Confidence: {response.confidence}")

# Or synchronously
response = agent.handle_inquiry_sync(
    customer_message="What is your return policy?",
    customer_id="user_123"
)
```

### Using Tools Directly

```python
from app.agents.tool.customer_support import (
    search_knowledge_base,
    check_order_status,
    create_support_ticket,
    CUSTOMER_SUPPORT_TOOLS
)

# Use tools directly
kb_result = search_knowledge_base.invoke({"query": "return policy"})
order_info = check_order_status.invoke({"order_id": "ORD-123"})

# Bind tools to LLM
from app.infrastructure.llm_provider import OpenRouterProvider

provider = OpenRouterProvider()
llm = provider.get_llm(model_name="openai/gpt-4o-mini")
llm_with_tools = llm.bind_tools(CUSTOMER_SUPPORT_TOOLS)

# LLM can now use these tools when needed
response = llm_with_tools.invoke("Check order status for ORD-123")
```

### Creating Custom Tools

```python
from langchain_core.tools import tool

@tool
def my_custom_tool(input_text: str) -> str:
    """Description of what the tool does."""
    # Tool implementation
    return processed_result

# Use the tool
result = my_custom_tool.invoke({"input_text": "example"})
```

## Langfuse Integration

All agents automatically use Langfuse for tracing when enabled. The agent methods accept optional parameters for filtering:

- `session_id`: Groups related traces
- `customer_id` / `user_id`: User-level filtering
- `tags`: Custom tags for filtering
- `metadata`: Additional context

See `app/infrastructure/langfuse_handler.py` for more details.
