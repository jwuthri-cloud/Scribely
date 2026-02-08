"""
Example: Using LangChain's create_agent with Langfuse filtering attributes.

This example demonstrates:
1. Creating an agent using create_agent
2. Using Langfuse filtering attributes (session_id, user_id, tags, metadata)
3. Structured output with Pydantic models
4. Async agent invocation with Langfuse tracing
"""

import uuid
from typing import Optional

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from app.infrastructure.langfuse_handler import get_langfuse_config
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("create_agent_example")


# Example structured output model
class AnalysisOutput(BaseModel):
    """Structured output for analysis agent."""
    summary: str = Field(description="Brief summary of the analysis")
    key_points: list[str] = Field(description="List of key points identified")
    confidence: float = Field(description="Confidence score between 0 and 1", ge=0, le=1)
    recommendations: list[str] = Field(description="List of recommendations")


# Example system prompt
EXAMPLE_SYSTEM_PROMPT = """You are an expert analyst. Analyze the given information and provide:
1. A concise summary
2. Key points identified
3. Your confidence level (0-1)
4. Actionable recommendations

Be thorough but concise."""


async def create_agent_with_langfuse_example():
    """Example of using create_agent with Langfuse filtering attributes."""
    # Initialize provider
    provider = OpenRouterProvider()
    
    # Get LLM instance (Langfuse automatically enabled if configured)
    llm = provider.get_llm(
        model_name="openai/gpt-4o-mini",
        temperature=0.3
    )
    
    # Create agent with structured output
    agent = create_agent(
        model=llm,
        system_prompt=EXAMPLE_SYSTEM_PROMPT,
        tools=[],  # Add tools here if needed
        response_format=AnalysisOutput,
    )
    
    # Example user input
    user_input = """
    Analyze the following data:
    - Sales increased 15% this quarter
    - Customer satisfaction is at 4.2/5
    - Support tickets decreased by 20%
    - New feature adoption is at 60%
    """
    
    # Build Langfuse config with filtering attributes
    # This enables easy filtering in Langfuse UI by session, user, tags, etc.
    langfuse_config = get_langfuse_config(
        session_id=f"analysis-session-{uuid.uuid4()}",  # Group related traces
        user_id="user_123",                               # User-level filtering
        tags=["analysis", "example", "production"],       # Custom tags
        metadata={                                        # Custom metadata
            "agent_type": "analysis",
            "input_length": len(user_input),
            "model": "openai/gpt-4o-mini"
        },
        run_name="analysis-agent-run"                     # Optional trace name
    )
    
    # Invoke agent with Langfuse config
    # The config is passed as the second parameter to ainvoke
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=user_input)]},
        config=langfuse_config
    )
    
    # Extract structured response
    if isinstance(result, dict) and "structured_response" in result:
        analysis = result["structured_response"]
        logger.info(f"Summary: {analysis.summary}")
        logger.info(f"Key Points: {analysis.key_points}")
        logger.info(f"Confidence: {analysis.confidence}")
        logger.info(f"Recommendations: {analysis.recommendations}")
        
        return analysis
    else:
        logger.warning("Unexpected result format")
        return result


def create_agent_sync_example():
    """Example of using create_agent synchronously with Langfuse."""
    # Initialize provider
    provider = OpenRouterProvider()
    
    # Get LLM instance
    llm = provider.get_llm(
        model_name="openai/gpt-4o-mini",
        temperature=0.3
    )
    
    # Create agent
    agent = create_agent(
        model=llm,
        system_prompt=EXAMPLE_SYSTEM_PROMPT,
        tools=[],
        response_format=AnalysisOutput,
    )
    
    user_input = "Analyze: Sales up 10%, satisfaction at 4.5/5"
    
    # Build Langfuse config
    langfuse_config = get_langfuse_config(
        session_id="sync-analysis-session",
        user_id="user_456",
        tags=["sync", "quick-analysis"]
    )
    
    # Invoke synchronously
    result = agent.invoke(
        {"messages": [HumanMessage(content=user_input)]},
        config=langfuse_config
    )
    
    return result


async def create_agent_with_fallbacks_example():
    """Example of using create_agent with model fallbacks and Langfuse."""
    provider = OpenRouterProvider()
    
    # Get LLM with fallbacks
    llm = provider.get_llm_with_fallbacks([
        "anthropic/claude-3.5-sonnet",  # Primary
        "openai/gpt-4o-mini",           # Fallback 1
        "gryphe/mythomax-l2-13b"        # Fallback 2
    ])
    
    # Create agent
    agent = create_agent(
        model=llm,
        system_prompt=EXAMPLE_SYSTEM_PROMPT,
        tools=[],
        response_format=AnalysisOutput,
    )
    
    user_input = "Analyze quarterly performance metrics"
    
    # Langfuse config with session tracking
    langfuse_config = get_langfuse_config(
        session_id="quarterly-analysis-2024-Q1",
        user_id="analyst_789",
        tags=["quarterly-review", "performance"],
        metadata={
            "quarter": "2024-Q1",
            "has_fallbacks": True
        }
    )
    
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=user_input)]},
        config=langfuse_config
    )
    
    return result


if __name__ == "__main__":
    import asyncio
    
    logger.info("=== Create Agent with Langfuse (Async) ===")
    asyncio.run(create_agent_with_langfuse_example())
    
    logger.info("\n=== Create Agent with Langfuse (Sync) ===")
    create_agent_sync_example()
    
    logger.info("\n=== Create Agent with Fallbacks and Langfuse ===")
    asyncio.run(create_agent_with_fallbacks_example())
