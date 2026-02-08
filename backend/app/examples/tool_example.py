"""
Example use case: Using LangChain tools with agents.

This example demonstrates:
1. Creating and using LangChain tools
2. Binding tools to an LLM
3. Using tools in agent workflows
"""

from langchain_core.prompts import ChatPromptTemplate

from app.agents.tool.customer_support import (
    search_knowledge_base,
    check_order_status,
    create_support_ticket,
    get_account_info,
    CUSTOMER_SUPPORT_TOOLS,
)
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

logger = get_logger("tool_example")


def basic_tool_usage():
    """Example of using tools directly."""
    logger.info("=== Basic Tool Usage ===")
    
    # Use search_knowledge_base tool
    kb_result = search_knowledge_base.invoke({"query": "return policy"})
    logger.info(f"Knowledge base result: {kb_result}")
    
    # Use check_order_status tool
    order_info = check_order_status.invoke({"order_id": "ORD-12345"})
    logger.info(f"Order status: {order_info}")
    
    # Use get_account_info tool
    account_info = get_account_info.invoke({"customer_id": "customer_123"})
    logger.info(f"Account info: {account_info}")
    
    # Use create_support_ticket tool
    ticket = create_support_ticket.invoke({
        "customer_id": "customer_123",
        "issue_description": "Unable to access account",
        "priority": "high"
    })
    logger.info(f"Support ticket: {ticket}")


def tool_with_llm():
    """Example of binding tools to an LLM."""
    logger.info("\n=== Tool with LLM ===")
    
    # Initialize provider
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-4o-mini", temperature=0)
    
    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(CUSTOMER_SUPPORT_TOOLS)
    
    # Create a prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful customer support assistant with access to tools."),
        ("user", "{input}")
    ])
    
    # Create chain
    chain = prompt | llm_with_tools
    
    # Invoke with a request that might use tools
    response = chain.invoke({
        "input": "Can you check the status of order ORD-12345?"
    })
    
    logger.info(f"Response: {response}")
    
    # Check if the LLM wants to use tools
    if hasattr(response, 'tool_calls') and response.tool_calls:
        logger.info(f"LLM wants to use {len(response.tool_calls)} tool(s)")
        for tool_call in response.tool_calls:
            logger.info(f"Tool: {tool_call.get('name')}")
            logger.info(f"Args: {tool_call.get('args')}")


def tool_workflow_example():
    """Example of a workflow using multiple tools."""
    logger.info("\n=== Tool Workflow Example ===")
    
    customer_id = "customer_789"
    
    # Step 1: Get account info
    account = get_account_info.invoke({"customer_id": customer_id})
    logger.info(f"Step 1: Account status: {account.get('account_status')}")
    
    # Step 2: Check order status
    order_info = check_order_status.invoke({"order_id": "ORD-12345"})
    logger.info(f"Step 2: Order status: {order_info.get('status')}")
    
    # Step 3: Search knowledge base if needed
    kb_result = search_knowledge_base.invoke({"query": "shipping information"})
    logger.info(f"Step 3: Knowledge base: {kb_result[:100]}...")
    
    # Step 4: Create ticket if escalation needed
    ticket = create_support_ticket.invoke({
        "customer_id": customer_id,
        "issue_description": "Order delayed",
        "priority": "normal"
    })
    logger.info(f"Step 4: Ticket created: {ticket.get('ticket_id')}")


def custom_tool_example():
    """Example of creating a custom tool."""
    logger.info("\n=== Custom Tool Example ===")
    
    from langchain_core.tools import tool
    
    @tool
    def calculate_refund_amount(
        order_total: float,
        items_returned: int,
        total_items: int
    ) -> dict:
        """
        Calculate refund amount for returned items.
        
        Args:
            order_total: Total order amount
            items_returned: Number of items being returned
            total_items: Total number of items in order
        
        Returns:
            Dictionary with refund calculation details
        """
        refund_per_item = order_total / total_items
        refund_amount = refund_per_item * items_returned
        
        return {
            "refund_amount": round(refund_amount, 2),
            "items_returned": items_returned,
            "total_items": total_items,
            "refund_percentage": round((items_returned / total_items) * 100, 2)
        }
    
    # Use the custom tool
    result = calculate_refund_amount.invoke({
        "order_total": 100.00,
        "items_returned": 2,
        "total_items": 5
    })
    
    logger.info(f"Refund calculation: {result}")


if __name__ == "__main__":
    basic_tool_usage()
    tool_with_llm()
    tool_workflow_example()
    custom_tool_example()
