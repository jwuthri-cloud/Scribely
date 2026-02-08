"""
Example use case: Using the Customer Support Agent.

This example demonstrates:
1. Setting up the customer support agent
2. Handling customer inquiries
3. Using Langfuse filtering attributes
4. Working with structured responses
"""

import asyncio

from app.agents import CustomerSupportAgent
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("agent_example")


async def customer_support_example():
    """Example of using the customer support agent."""
    # Initialize provider
    provider = OpenRouterProvider()
    
    # Create customer support agent
    agent = CustomerSupportAgent(
        llm_provider=provider,
        model_name="openai/gpt-4o-mini",
        temperature=0.7
    )
    
    # Example customer inquiries
    inquiries = [
        "I need help with my order #12345",
        "What is your return policy?",
        "I'm having trouble logging into my account",
    ]
    
    for i, inquiry in enumerate(inquiries, 1):
        logger.info(f"\n=== Inquiry {i} ===")
        logger.info(f"Customer: {inquiry}")
        
        # Handle inquiry with Langfuse filtering
        response = await agent.handle_inquiry(
            customer_message=inquiry,
            customer_id=f"customer_{i}",
            session_id="support-session-123",
            tags=["support", "example"],
            metadata={"inquiry_number": i}
        )
        
        logger.info(f"Response: {response.response}")
        logger.info(f"Sentiment: {response.sentiment}")
        logger.info(f"Requires escalation: {response.requires_escalation}")
        if response.requires_escalation:
            logger.info(f"Escalation reason: {response.escalation_reason}")
        logger.info(f"Confidence: {response.confidence:.2f}")
        if response.suggested_actions:
            logger.info(f"Suggested actions: {response.suggested_actions}")


def customer_support_sync_example():
    """Example of using the customer support agent synchronously."""
    provider = OpenRouterProvider()
    agent = CustomerSupportAgent(
        llm_provider=provider,
        model_name="openai/gpt-4o-mini"
    )
    
    inquiry = "How do I reset my password?"
    
    response = agent.handle_inquiry_sync(
        customer_message=inquiry,
        customer_id="user_456",
        session_id="sync-session-789"
    )
    
    logger.info(f"Response: {response.response}")
    logger.info(f"Confidence: {response.confidence:.2f}")
    
    return response


if __name__ == "__main__":
    logger.info("=== Customer Support Agent Example (Async) ===")
    asyncio.run(customer_support_example())
    
    logger.info("\n=== Customer Support Agent Example (Sync) ===")
    customer_support_sync_example()
