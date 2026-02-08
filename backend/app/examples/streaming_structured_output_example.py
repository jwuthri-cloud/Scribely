"""
Full example: Streaming structured output with LangChain + OpenRouter.

Shows the structured object being built incrementally during streaming,
with rich console UI displaying tool calls, structured output updates, and final results.
Tests multiple model providers: Anthropic, OpenAI, Google, xAI.
"""

import uuid
import time
import asyncio
from enum import Enum
from typing import Any, Optional
from dataclasses import dataclass

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

from app.agents.agents import CustomerSupportAgent
from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.infrastructure.llm_provider import OpenRouterProvider
from app.utils.logging import get_logger

from langfuse import propagate_attributes

logger = get_logger("streaming_structured_output_example")
console = Console()

# Models to test for each provider
PROVIDER_MODELS = {
    "Anthropic": "anthropic/claude-4.5-sonnet",
    "OpenAI": "openai/gpt-4o-mini",
    "Google": "google/gemini-3-pro-preview",
    "xAI": "x-ai/grok-4-fast",
}


class EventType(Enum):
    """Types of streaming events."""
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_ARGS = "tool_call_args"
    TOOL_RESULT = "tool_result"
    STRUCTURED_OUTPUT_START = "structured_output_start"
    STRUCTURED_OUTPUT_UPDATE = "structured_output_update"
    STRUCTURED_OUTPUT_COMPLETE = "structured_output_complete"
    ERROR = "error"


@dataclass
class StreamEvent:
    """A streaming event with type and data."""
    event_type: EventType
    timestamp: float
    data: dict[str, Any]


def create_response_table(response: CustomerSupportResponse, update_num: int, elapsed: float) -> Table:
    """Create a rich table displaying all CustomerSupportResponse fields."""
    table = Table(
        title=f"[bold cyan]Structured Output Update #{update_num}[/] [dim]({elapsed:.2f}s)[/]",
        show_header=True,
        header_style="bold magenta",
        border_style="cyan",
        expand=True,
    )
    
    table.add_column("Field", style="bold yellow", width=20)
    table.add_column("Value", style="white")
    
    # Response (truncate if too long)
    response_text = response.response
    if len(response_text) > 200:
        response_text = response_text[:200] + "..."
    table.add_row("response", response_text or "[dim]<empty>[/]")
    
    # Sentiment with color coding
    sentiment_colors = {"positive": "green", "neutral": "yellow", "negative": "red"}
    sentiment_color = sentiment_colors.get(response.sentiment, "white")
    table.add_row("sentiment", f"[{sentiment_color}]{response.sentiment}[/]")
    
    # Requires escalation with icon
    escalation_icon = "🚨" if response.requires_escalation else "✅"
    table.add_row("requires_escalation", f"{escalation_icon} {response.requires_escalation}")
    
    # Escalation reason
    table.add_row("escalation_reason", response.escalation_reason or "[dim]None[/]")
    
    # Suggested actions as bullet list
    if response.suggested_actions:
        actions_text = "\n".join(f"• {action}" for action in response.suggested_actions)
    else:
        actions_text = "[dim]<none>[/]"
    table.add_row("suggested_actions", actions_text)
    
    # Confidence with color gradient
    conf = response.confidence
    if conf >= 0.8:
        conf_color = "green"
    elif conf >= 0.5:
        conf_color = "yellow"
    else:
        conf_color = "red"
    table.add_row("confidence", f"[{conf_color}]{conf:.2f}[/]")
    
    return table


def create_final_result_table(response: CustomerSupportResponse) -> Table:
    """Create a detailed table for the final result."""
    table = Table(
        title="[bold green]✅ Final Structured Output[/]",
        show_header=True,
        header_style="bold white on blue",
        border_style="green",
        expand=True,
    )
    
    table.add_column("Field", style="bold cyan", width=20)
    table.add_column("Value", style="white")
    
    # Full response
    table.add_row("response", response.response or "[dim]<empty>[/]")
    
    # Sentiment
    sentiment_colors = {"positive": "green", "neutral": "yellow", "negative": "red"}
    sentiment_color = sentiment_colors.get(response.sentiment, "white")
    table.add_row("sentiment", f"[{sentiment_color} bold]{response.sentiment}[/]")
    
    # Requires escalation
    escalation_icon = "🚨 YES" if response.requires_escalation else "✅ NO"
    escalation_style = "red bold" if response.requires_escalation else "green"
    table.add_row("requires_escalation", f"[{escalation_style}]{escalation_icon}[/]")
    
    # Escalation reason
    if response.escalation_reason:
        table.add_row("escalation_reason", f"[red]{response.escalation_reason}[/]")
    else:
        table.add_row("escalation_reason", "[dim]None[/]")
    
    # Suggested actions
    if response.suggested_actions:
        actions_text = "\n".join(f"[cyan]•[/] {action}" for action in response.suggested_actions)
    else:
        actions_text = "[dim]<none>[/]"
    table.add_row("suggested_actions", actions_text)
    
    # Confidence
    conf = response.confidence
    if conf >= 0.8:
        conf_style = "green bold"
    elif conf >= 0.5:
        conf_style = "yellow"
    else:
        conf_style = "red"
    table.add_row("confidence", f"[{conf_style}]{conf:.2f}[/]")
    
    return table


async def test_model_streaming(
    provider_name: str,
    model_name: str,
    query: str = "Hi, how are you today?",
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Test streaming for a specific model.
    
    Returns dict with results: updates, time_to_first, total_time, error
    """
    provider = OpenRouterProvider()
    
    # Generate session ID if not provided
    if session_id is None:
        session_id = f"test-{provider_name.lower()}-{uuid.uuid4().hex[:8]}"
    
    try:
        agent = CustomerSupportAgent(
            llm_provider=provider,
            model_name=model_name,
            temperature=0.1
        )
        
        start_time = time.time()
        first_update_time = None
        update_count = 0
        final_response: Optional[CustomerSupportResponse] = None
        
        # Use propagate_attributes for better session propagation
        with propagate_attributes(session_id=session_id):
            async for response in agent.handle_inquiry_stream(
                customer_message=query,
                session_id=session_id,  # Still pass for backward compatibility
                tags=["streaming-test", provider_name.lower()],
            ):
                if first_update_time is None:
                    first_update_time = time.time() - start_time
                update_count += 1
                final_response = response
        
        total_time = time.time() - start_time
        
        return {
            "provider": provider_name,
            "model": model_name,
            "session_id": session_id,
            "updates": update_count,
            "time_to_first": first_update_time,
            "total_time": total_time,
            "response_len": len(final_response.response) if final_response else 0,
            "streams_incrementally": update_count > 2,
            "error": None,
        }
    except Exception as e:
        logger.error(f"Error in test_model_streaming for {provider_name}: {e}", exc_info=True)
        return {
            "provider": provider_name,
            "model": model_name,
            "session_id": session_id,
            "updates": 0,
            "time_to_first": None,
            "total_time": None,
            "response_len": 0,
            "streams_incrementally": False,
            "error": str(e)[:50],
        }


async def multi_model_demo():
    """
    Test streaming across all provider models.
    
    Shows which providers support incremental streaming.
    """
    console.print(Panel(
        "[bold white]Multi-Model Streaming Test[/]\n"
        "[dim]Testing structured output streaming across Anthropic, OpenAI, Google, and xAI[/]",
        title="🔬 Provider Comparison",
        border_style="blue",
    ))
    
    query = "Hi, how are you today?"
    console.print(Panel(query, title="[bold cyan]📝 Test Query[/]", border_style="cyan"))
    
    # Generate a shared session ID for this multi-model test
    shared_session_id = f"multi-model-test-{uuid.uuid4().hex[:8]}"
    console.print(f"[dim]Session ID: {shared_session_id}[/]")
    console.print()
    
    results = []
    
    for provider_name, model_name in PROVIDER_MODELS.items():
        console.print(f"[bold]Testing {provider_name}[/] ({model_name})...")
        
        # Use provider-specific session ID for better organization
        session_id = f"{shared_session_id}-{provider_name.lower()}"
        logger.info(f"Multi-model test - Provider: {provider_name}, Session ID: {session_id}")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task(f"[cyan]Running {provider_name}...", total=None)
            result = await test_model_streaming(provider_name, model_name, query, session_id)
            results.append(result)
        
        # Show quick result with session ID
        if result["error"]:
            console.print(f"   [red]❌ Error: {result['error']}[/]")
            console.print(f"   [dim]Session ID: {result.get('session_id', 'N/A')}[/]")
        elif result["streams_incrementally"]:
            console.print(f"   [green]✅ {result['updates']} updates, first at {result['time_to_first']:.2f}s[/]")
            console.print(f"   [dim]Session ID: {result.get('session_id', 'N/A')}[/]")
        else:
            console.print(f"   [yellow]⚠️  Only {result['updates']} update(s) - no incremental streaming[/]")
            console.print(f"   [dim]Session ID: {result.get('session_id', 'N/A')}[/]")
        console.print()
    
    # Summary table
    summary = Table(
        title="[bold]📊 Streaming Support Summary[/]",
        border_style="blue",
        expand=True,
    )
    summary.add_column("Provider", style="bold cyan")
    summary.add_column("Model", style="dim")
    summary.add_column("Updates", style="white", justify="right")
    summary.add_column("Time to First", style="white", justify="right")
    summary.add_column("Total Time", style="white", justify="right")
    summary.add_column("Streaming", style="white", justify="center")
    summary.add_column("Session ID", style="dim", width=25)
    
    for r in results:
        if r["error"]:
            streaming_status = f"[red]❌ Error[/]"
            ttf = "-"
            total = "-"
        elif r["streams_incrementally"]:
            streaming_status = "[green]✅ Yes[/]"
            ttf = f"{r['time_to_first']:.2f}s"
            total = f"{r['total_time']:.2f}s"
        else:
            streaming_status = "[yellow]⚠️ No[/]"
            ttf = f"{r['time_to_first']:.2f}s" if r['time_to_first'] else "-"
            total = f"{r['total_time']:.2f}s" if r['total_time'] else "-"
        
        session_id_display = r.get("session_id", "-")[:24] if r.get("session_id") else "-"
        
        summary.add_row(
            r["provider"],
            r["model"].split("/")[-1],
            str(r["updates"]),
            ttf,
            total,
            streaming_status,
            session_id_display,
        )
    
    console.print(summary)
    
    # Legend
    console.print("\n[dim]Legend:[/]")
    console.print("  [green]✅ Yes[/] = Streams token-by-token (many updates)")
    console.print("  [yellow]⚠️ No[/] = Sends all at once (1-2 updates)")
    console.print("  [red]❌ Error[/] = Model unavailable or requires credits")
    console.print(f"\n[bold cyan]💡 Tip:[/] View sessions in Langfuse using the Session IDs above")


async def single_model_demo(model_name: str, provider_name: str):
    """
    Detailed demo for a single model showing streaming updates.
    """
    console.print(Panel(
        f"[bold white]{provider_name} Streaming Demo[/]\n"
        f"[dim]Model: {model_name}[/]",
        title=f"🎯 {provider_name}",
        border_style="green",
    ))
    
    provider = OpenRouterProvider()
    
    try:
        agent = CustomerSupportAgent(
            llm_provider=provider,
            model_name=model_name,
            temperature=0.1
        )
    except Exception as e:
        console.print(f"[red]❌ Failed to create agent: {e}[/]")
        return
    
    query = "Hi, how are you today?"
    console.print(Panel(query, title="[bold cyan]📝 Query[/]", border_style="cyan"))
    
    # Generate session ID for this demo
    session_id = f"demo-{provider_name.lower()}-{uuid.uuid4().hex[:8]}"
    console.print(f"[dim]Session ID: {session_id}[/]")
    console.print()
    
    update_count = 0
    start_time = time.time()
    final_response: Optional[CustomerSupportResponse] = None
    
    try:
        # Use propagate_attributes for better session propagation
        with propagate_attributes(session_id=session_id):
            async for response in agent.handle_inquiry_stream(
                customer_message=query,
                session_id=session_id,  # Still pass for backward compatibility
                tags=["demo", provider_name.lower(), "streaming"],
                metadata={"demo_type": "single_model", "provider": provider_name},
            ):
                update_count += 1
                elapsed = time.time() - start_time
                final_response = response
                
                # Show first 5 updates and every 10th after
                if update_count <= 5 or update_count % 10 == 0:
                    table = create_response_table(response, update_count, elapsed)
                    console.print(table)
        
        console.print()
        if final_response:
            console.print(create_final_result_table(final_response))
        
        console.print(f"\n[bold green]✅ Complete![/] Received [cyan]{update_count}[/] updates")
        console.print(f"[dim]View this session in Langfuse with session_id: {session_id}[/]")
        
    except Exception as e:
        console.print(f"[red]❌ Error during streaming: {e}[/]")
        logger.error(f"Error in single_model_demo for {provider_name}: {e}", exc_info=True)


async def main():
    """Run all demos."""
    console.print("\n[bold blue]═══════════════════════════════════════════════════════════[/]")
    console.print("[bold blue]       🚀 Streaming Structured Output Examples 🚀           [/]")
    console.print("[bold blue]═══════════════════════════════════════════════════════════[/]\n")
    
    # Demo 1: Multi-model comparison
    await multi_model_demo()
    console.print("\n" + "─" * 60 + "\n")
    
    # Demo 2: Detailed demo for each provider that supports streaming
    for provider_name, model_name in PROVIDER_MODELS.items():
        await single_model_demo(model_name, provider_name)
        console.print("\n" + "─" * 60 + "\n")
    
    console.print("\n[bold green]All demos complete![/]\n")


if __name__ == "__main__":
    asyncio.run(main())
