"""
Multi-turn conversation example with LangChain + Langfuse.

Demonstrates a conversation flow with multiple user/assistant exchanges,
all grouped under a single session_id and user_id for easy tracking in Langfuse.

This example shows:
1. Multiple conversation turns in a single session
2. Session ID propagation across all turns
3. User ID tracking
4. Rich console output showing the conversation flow
"""

import asyncio
import uuid
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from app.agents.agents import CustomerSupportAgent
from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

from langfuse import propagate_attributes

logger = get_logger("multi_turn_conversation_example")
console = Console()


class ConversationTurn:
    """Represents a single turn in the conversation."""
    
    def __init__(self, turn_number: int, user_message: str):
        self.turn_number = turn_number
        self.user_message = user_message
        self.assistant_response: Optional[CustomerSupportResponse] = None


async def multi_turn_conversation_demo(
    model_name: str = "openai/gpt-4o-mini",
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
):
    """
    Demonstrate a multi-turn conversation with a single session_id and user_id.
    
    Args:
        model_name: Model to use for the conversation
        user_id: User ID for tracking (generated if not provided)
        session_id: Session ID for grouping (generated if not provided)
    """
    # Generate IDs if not provided
    if user_id is None:
        user_id = f"user-{uuid.uuid4().hex[:8]}"
    
    if session_id is None:
        session_id = f"conversation-{uuid.uuid4().hex[:8]}"
    
    # Display header
    console.print("\n" + "=" * 70)
    console.print(Panel(
        f"[bold white]Multi-Turn Conversation Demo[/]\n\n"
        f"[dim]Model:[/] {model_name}\n"
        f"[dim]User ID:[/] {user_id}\n"
        f"[dim]Session ID:[/] {session_id}\n\n"
        f"[yellow]💡 All turns will be grouped under the same session in Langfuse[/]",
        title="💬 Conversation",
        border_style="cyan",
    ))
    console.print("=" * 70 + "\n")
    
    # Initialize provider and agent
    provider = OpenRouterProvider()
    agent = CustomerSupportAgent(
        llm_provider=provider,
        model_name=model_name,
        temperature=0.7
    )
    
    # Define conversation turns
    conversation_turns = [
        ConversationTurn(1, "Hi, I need help with my order #12345"),
        ConversationTurn(2, "When will it arrive?"),
        ConversationTurn(3, "Can I change the delivery address?"),
        ConversationTurn(4, "Thank you for your help!"),
    ]
    
    # Process each turn with the same session_id and user_id
    for turn in conversation_turns:
        console.print(f"\n[bold cyan]─── Turn {turn.turn_number} ───[/]\n")
        
        # Display user message
        console.print(Panel(
            turn.user_message,
            title=f"[bold green]👤 User[/]",
            border_style="green",
        ))
        
        # Process with propagate_attributes for better session propagation
        try:
            with propagate_attributes(
                session_id=session_id,
                user_id=user_id,
            ):
                response = await agent.handle_inquiry(
                    customer_message=turn.user_message,
                    customer_id=user_id,
                    session_id=session_id,  # Still pass for backward compatibility
                    tags=["multi-turn", "conversation"],
                    metadata={
                        "turn_number": turn.turn_number,
                        "total_turns": len(conversation_turns),
                    },
                )
            
            turn.assistant_response = response
            
            # Display assistant response
            response_table = create_response_table(response, turn.turn_number)
            console.print(response_table)
            
            # Log for debugging
            logger.info(
                f"Turn {turn.turn_number} - Session: {session_id}, "
                f"User: {user_id}, Sentiment: {response.sentiment}"
            )
            
        except Exception as e:
            console.print(f"[red]❌ Error in turn {turn.turn_number}: {e}[/]")
            logger.error(f"Error processing turn {turn.turn_number}: {e}", exc_info=True)
            # Create fallback response
            turn.assistant_response = CustomerSupportResponse(
                response=f"I apologize, but I encountered an error: {str(e)}",
                sentiment="neutral",
                requires_escalation=True,
                escalation_reason="Error occurred during processing",
                confidence=0.0
            )
    
    # Display conversation summary
    console.print("\n" + "=" * 70)
    console.print(Panel(
        "[bold white]Conversation Summary[/]\n",
        title="📊 Summary",
        border_style="blue",
    ))
    
    summary_table = Table(
        title="[bold]Conversation Overview[/]",
        show_header=True,
        header_style="bold magenta",
        border_style="blue",
    )
    summary_table.add_column("Turn", style="cyan", justify="center")
    summary_table.add_column("User Message", style="white", width=30)
    summary_table.add_column("Sentiment", style="white", justify="center")
    summary_table.add_column("Escalation", style="white", justify="center")
    summary_table.add_column("Confidence", style="white", justify="right")
    
    for turn in conversation_turns:
        if turn.assistant_response:
            sentiment_color = {
                "positive": "green",
                "neutral": "yellow",
                "negative": "red"
            }.get(turn.assistant_response.sentiment, "white")
            
            escalation_icon = "🚨" if turn.assistant_response.requires_escalation else "✅"
            
            summary_table.add_row(
                str(turn.turn_number),
                turn.user_message[:28] + "..." if len(turn.user_message) > 30 else turn.user_message,
                f"[{sentiment_color}]{turn.assistant_response.sentiment}[/]",
                escalation_icon,
                f"{turn.assistant_response.confidence:.2f}",
            )
    
    console.print(summary_table)
    
    # Final message with Langfuse info
    console.print("\n" + "=" * 70)
    console.print(Panel(
        f"[bold green]✅ Conversation Complete![/]\n\n"
        f"[dim]Session ID:[/] [cyan]{session_id}[/]\n"
        f"[dim]User ID:[/] [cyan]{user_id}[/]\n"
        f"[dim]Total Turns:[/] {len(conversation_turns)}\n\n"
        f"[yellow]💡 View this conversation in Langfuse:[/]\n"
        f"   Filter by session_id: [cyan]{session_id}[/]\n"
        f"   Or filter by user_id: [cyan]{user_id}[/]\n"
        f"   All {len(conversation_turns)} turns should be grouped together!",
        title="🎯 Langfuse Tracking",
        border_style="green",
    ))
    console.print("=" * 70 + "\n")


def create_response_table(response: CustomerSupportResponse, turn_number: int) -> Table:
    """Create a rich table displaying the assistant response."""
    table = Table(
        title=f"[bold cyan]🤖 Assistant Response (Turn {turn_number})[/]",
        show_header=True,
        header_style="bold magenta",
        border_style="cyan",
        expand=True,
    )
    
    table.add_column("Field", style="bold yellow", width=20)
    table.add_column("Value", style="white")
    
    # Response
    response_text = response.response
    if len(response_text) > 200:
        response_text = response_text[:200] + "..."
    table.add_row("response", response_text or "[dim]<empty>[/]")
    
    # Sentiment with color coding
    sentiment_colors = {"positive": "green", "neutral": "yellow", "negative": "red"}
    sentiment_color = sentiment_colors.get(response.sentiment, "white")
    table.add_row("sentiment", f"[{sentiment_color}]{response.sentiment}[/]")
    
    # Requires escalation
    escalation_icon = "🚨" if response.requires_escalation else "✅"
    table.add_row("requires_escalation", f"{escalation_icon} {response.requires_escalation}")
    
    # Escalation reason
    if response.escalation_reason:
        table.add_row("escalation_reason", f"[red]{response.escalation_reason}[/]")
    
    # Suggested actions
    if response.suggested_actions:
        actions_text = "\n".join(f"• {action}" for action in response.suggested_actions)
    else:
        actions_text = "[dim]<none>[/]"
    table.add_row("suggested_actions", actions_text)
    
    # Confidence
    conf = response.confidence
    if conf >= 0.8:
        conf_color = "green"
    elif conf >= 0.5:
        conf_color = "yellow"
    else:
        conf_color = "red"
    table.add_row("confidence", f"[{conf_color}]{conf:.2f}[/]")
    
    return table


async def main():
    """Run the multi-turn conversation demo."""
    # Demo with default settings
    await multi_turn_conversation_demo()
    
    # Optional: Run with custom IDs
    # custom_user_id = "demo-user-123"
    # custom_session_id = "demo-session-456"
    # await multi_turn_conversation_demo(
    #     user_id=custom_user_id,
    #     session_id=custom_session_id,
    # )


if __name__ == "__main__":
    asyncio.run(main())
