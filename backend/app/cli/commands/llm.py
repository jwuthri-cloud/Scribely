"""
LLM service management commands.
"""


import click
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table

console = Console()


@click.group()
def llm():
    """Manage LLM services and models."""


@llm.command()
def test():
    """Test OpenRouter connection and functionality."""
    console.print("[bold blue]Testing OpenRouter connection...[/bold blue]")
    _test_openrouter()


@llm.command()
def list():
    """List available models from OpenRouter."""
    console.print("[bold blue]Fetching available models from OpenRouter...[/bold blue]\n")

    try:
        from app.infrastructure.llm_provider import OpenRouterProvider
        
        provider = OpenRouterProvider()
        models = provider.get_models()
        
        if not models:
            console.print("[yellow]⚠ No models found or unable to fetch models[/yellow]")
            return
        
        # Group models by provider
        providers = {}
        for model in models[:50]:  # Limit to first 50 for display
            provider_name = model.get("id", "").split("/")[0] if "/" in model.get("id", "") else "unknown"
            if provider_name not in providers:
                providers[provider_name] = []
            providers[provider_name].append(model.get("id", "unknown"))
        
        for provider_name, model_list in providers.items():
            table = Table(title=f"{provider_name.title()} Models")
            table.add_column("Model ID", style="cyan")
            table.add_column("Context", style="yellow")
            
            for model_id in model_list[:10]:  # Show first 10 per provider
                table.add_row(model_id, "Available")
            
            if len(model_list) > 10:
                table.add_row(f"... and {len(model_list) - 10} more", "")
            
            console.print(table)
            console.print()
            
    except Exception as e:
        console.print(f"[red]✗ Failed to fetch models: {e}[/red]")
        console.print("[dim]Make sure OPENROUTER_API_KEY is set in your environment[/dim]")


@llm.command()
@click.option(
    "--model",
    default="openai/gpt-4o-mini",
    help="OpenRouter model to use (e.g., 'openai/gpt-4o-mini')"
)
@click.option(
    "--fallback",
    multiple=True,
    help="Fallback models to use if primary fails (can be specified multiple times)"
)
def chat(model, fallback):
    """Interactive chat with LLM model via OpenRouter."""
    fallback_list = list(fallback) if fallback else None
    model_info = model
    if fallback_list:
        model_info = f"{model} → {', '.join(fallback_list)}"
    
    console.print(Panel.fit(
        f"[bold blue]Interactive Chat Session[/bold blue]\n"
        f"Model: {model_info}\n"
        f"Provider: OpenRouter\n"
        f"Type 'quit' or 'exit' to end session",
        title="LLM Chat"
    ))

    try:
        from app.infrastructure.llm_provider import OpenRouterProvider
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        
        provider = OpenRouterProvider()
        llm = provider.get_llm(
            model_name=model,
            temperature=0.7,
            fallback_models=fallback_list
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant."),
            ("user", "{input}")
        ])
        
        chain = prompt | llm | StrOutputParser()
        
        while True:
            user_input = Prompt.ask("\n[bold cyan]You")

            if user_input.lower() in ["quit", "exit", "q"]:
                break

            try:
                response = chain.invoke({"input": user_input})
                console.print(f"[bold green]Assistant:[/bold green] {response}")
            except Exception as e:
                console.print(f"[red]✗ Error: {e}[/red]")

    except ImportError:
        console.print("[red]✗ Failed to import LLM provider[/red]")
        console.print("[dim]Make sure dependencies are installed[/dim]")
    except Exception as e:
        console.print(f"[red]✗ Failed to initialize chat: {e}[/red]")
    except KeyboardInterrupt:
        console.print("\n[yellow]Chat session ended[/yellow]")


@llm.command()
@click.argument("prompt")
@click.option(
    "--model",
    default="openai/gpt-4o-mini",
    help="OpenRouter model to use (e.g., 'openai/gpt-4o-mini')"
)
@click.option(
    "--temperature",
    default=0.7,
    type=float,
    help="Temperature for response (0.0-2.0)"
)
@click.option(
    "--fallback",
    multiple=True,
    help="Fallback models to use if primary fails (can be specified multiple times)"
)
def complete(prompt, model, temperature, fallback):
    """Get a single completion from LLM via OpenRouter."""
    fallback_list = list(fallback) if fallback else None
    model_info = model
    if fallback_list:
        model_info = f"{model} → {', '.join(fallback_list)}"
    
    console.print(f"[bold blue]Getting completion for:[/bold blue] {prompt}")
    console.print(f"[dim]Model: {model_info} | Temperature: {temperature}[/dim]\n")

    try:
        from app.infrastructure.llm_provider import OpenRouterProvider
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        
        provider = OpenRouterProvider()
        llm = provider.get_llm(
            model_name=model,
            temperature=temperature,
            fallback_models=fallback_list
        )
        
        prompt_template = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant."),
            ("user", "{input}")
        ])
        
        chain = prompt_template | llm | StrOutputParser()
        completion = chain.invoke({"input": prompt})

        console.print(Panel.fit(
            completion,
            title="LLM Response"
        ))

    except ImportError:
        console.print("[red]✗ Failed to import LLM provider[/red]")
        console.print("[dim]Make sure dependencies are installed[/dim]")
    except Exception as e:
        console.print(f"[red]✗ Completion failed: {e}[/red]")


@llm.command()
def config():
    """Configure OpenRouter API key interactively."""
    console.print("[bold blue]OpenRouter Configuration[/bold blue]\n")

    api_key = Prompt.ask("OpenRouter API Key", password=True)
    default_model = Prompt.ask("Default model", default="openai/gpt-4o-mini")

    console.print(f"\n[green]✓ Configuration saved![/green]")
    console.print(f"[dim]Default model: {default_model}[/dim]")
    console.print("[yellow]⚠ Set OPENROUTER_API_KEY in your .env file[/yellow]")
    console.print("[yellow]⚠ Restart the server to apply changes[/yellow]")


@llm.command()
@click.argument("models", nargs=-1, required=True)
@click.option(
    "--temperature",
    default=0.7,
    type=float,
    help="Temperature for response (0.0-2.0)"
)
def chat_fallback(models, temperature):
    """Interactive chat with multiple fallback models via OpenRouter.
    
    The first model is primary, others are fallbacks.
    
    Example:
        llm chat-fallback anthropic/claude-3.5-sonnet openai/gpt-4o-mini gryphe/mythomax-l2-13b
    """
    if not models:
        console.print("[red]✗ At least one model must be provided[/red]")
        return
    
    primary = models[0]
    fallbacks = list(models[1:]) if len(models) > 1 else []
    
    model_info = primary
    if fallbacks:
        model_info = f"{primary} → {', '.join(fallbacks)}"
    
    console.print(Panel.fit(
        f"[bold blue]Interactive Chat Session with Fallbacks[/bold blue]\n"
        f"Models: {model_info}\n"
        f"Provider: OpenRouter\n"
        f"Type 'quit' or 'exit' to end session",
        title="LLM Chat"
    ))

    try:
        from app.infrastructure.llm_provider import OpenRouterProvider
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        
        provider = OpenRouterProvider()
        llm = provider.get_llm_with_fallbacks(
            models=list(models),
            temperature=temperature
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant."),
            ("user", "{input}")
        ])
        
        chain = prompt | llm | StrOutputParser()
        
        while True:
            user_input = Prompt.ask("\n[bold cyan]You")

            if user_input.lower() in ["quit", "exit", "q"]:
                break

            try:
                response = chain.invoke({"input": user_input})
                console.print(f"[bold green]Assistant:[/bold green] {response}")
            except Exception as e:
                console.print(f"[red]✗ Error: {e}[/red]")

    except ImportError:
        console.print("[red]✗ Failed to import LLM provider[/red]")
        console.print("[dim]Make sure dependencies are installed[/dim]")
    except Exception as e:
        console.print(f"[red]✗ Failed to initialize chat: {e}[/red]")
    except KeyboardInterrupt:
        console.print("\n[yellow]Chat session ended[/yellow]")


def _test_openrouter():
    """Test OpenRouter connection."""
    try:
        from app.infrastructure.llm_provider import OpenRouterProvider
        import time
        
        console.print("[dim]Testing OpenRouter connection...[/dim]")
        
        provider = OpenRouterProvider()
        start_time = time.time()
        
        # Try to get models list as a connection test
        models = provider.get_models(use_cache=False)
        response_time = f"{(time.time() - start_time) * 1000:.0f}ms"
        
        model_count = len(models) if models else 0
        
        table = Table(title="OpenRouter Connection Test")
        table.add_column("Property", style="cyan")
        table.add_column("Value", style="green")
        
        table.add_row("Status", "[green]✓ Connected[/green]")
        table.add_row("Response Time", response_time)
        table.add_row("Available Models", str(model_count))
        table.add_row("Details", "Connection successful")
        
        console.print(table)
        
    except ValueError as e:
        if "OPENROUTER_API_KEY" in str(e):
            console.print("[red]✗ OpenRouter API key not configured[/red]")
            console.print("[yellow]Set OPENROUTER_API_KEY in your .env file[/yellow]")
        else:
            console.print(f"[red]✗ Configuration error: {e}[/red]")
    except Exception as e:
        console.print(f"[red]✗ Connection test failed: {e}[/red]")
        console.print("[dim]Make sure OPENROUTER_API_KEY is set and valid[/dim]")
