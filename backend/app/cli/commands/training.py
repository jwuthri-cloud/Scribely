"""
Agent training CLI commands for APO, VERL, and SFT.

This module provides CLI commands for training agents using agent-lightning:
- APO: Automatic Prompt Optimization via textual gradients
- VERL: Reinforcement Learning with PPO for model fine-tuning  
- SFT: Supervised Fine-tuning via Unsloth integration
"""

import asyncio
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

console = Console()


@click.group()
def training():
    """Agent training commands (APO, VERL, SFT)."""


@training.command()
@click.option(
    "--agent",
    default="customer_support",
    help="Agent to train (e.g., 'customer_support')",
)
@click.option(
    "--dataset",
    default=None,
    type=click.Path(exists=True),
    help="Training dataset path (JSONL format). Uses example dataset if not provided.",
)
@click.option(
    "--val-dataset",
    default=None,
    type=click.Path(exists=True),
    help="Validation dataset path. If not provided, splits from training set.",
)
@click.option(
    "--rounds",
    default=3,
    type=int,
    help="Number of APO optimization rounds (beam_rounds)",
)
@click.option(
    "--beam-width",
    default=4,
    type=int,
    help="Number of prompts to keep in beam search",
)
@click.option(
    "--gradient-model",
    default=None,
    help="Model for computing gradients (default: from settings)",
)
@click.option(
    "--output",
    default=None,
    type=click.Path(),
    help="Output path for optimized prompt",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Show configuration without running training",
)
def apo(
    agent: str,
    dataset: Optional[str],
    val_dataset: Optional[str],
    rounds: int,
    beam_width: int,
    gradient_model: Optional[str],
    output: Optional[str],
    dry_run: bool,
):
    """Run Automatic Prompt Optimization (APO).
    
    APO uses textual gradients to optimize prompts. It evaluates the agent
    on training tasks, computes "gradients" describing how to improve the
    prompt, and applies edits to create better prompts.
    
    Example:
        
        # Run APO with default settings
        python -m app.cli training apo --agent customer_support
        
        # Run with custom dataset and more rounds
        python -m app.cli training apo --dataset data/train.jsonl --rounds 5
    """
    console.print(Panel.fit(
        "[bold blue]Automatic Prompt Optimization (APO)[/bold blue]\n"
        f"Agent: {agent}\n"
        f"Rounds: {rounds} | Beam Width: {beam_width}",
        title="Training Configuration"
    ))
    
    try:
        from app.training.config import get_training_settings
        settings = get_training_settings()
        
        # Show configuration
        config_table = Table(title="APO Configuration")
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        
        grad_model = gradient_model or settings.apo_gradient_model
        config_table.add_row("Gradient Model", grad_model)
        config_table.add_row("Apply Edit Model", settings.apo_apply_edit_model)
        config_table.add_row("Beam Width", str(beam_width))
        config_table.add_row("Beam Rounds", str(rounds))
        config_table.add_row("Branch Factor", str(settings.apo_branch_factor))
        config_table.add_row("Val Batch Size", str(settings.apo_val_batch_size))
        config_table.add_row("Dataset", dataset or "example dataset")
        
        console.print(config_table)
        console.print()
        
        if dry_run:
            console.print("[yellow]Dry run - not starting training[/yellow]")
            return
        
        # Import and run APO training
        asyncio.run(_run_apo_training(
            agent_name=agent,
            dataset_path=dataset,
            val_dataset_path=val_dataset,
            rounds=rounds,
            beam_width=beam_width,
            gradient_model=grad_model,
            output_path=output,
        ))
        
    except ImportError as e:
        console.print(f"[red]✗ Missing dependency: {e}[/red]")
        console.print("[dim]Run: pip install agentlightning[/dim]")
    except Exception as e:
        console.print(f"[red]✗ APO training failed: {e}[/red]")
        raise


async def _run_apo_training(
    agent_name: str,
    dataset_path: Optional[str],
    val_dataset_path: Optional[str],
    rounds: int,
    beam_width: int,
    gradient_model: str,
    output_path: Optional[str],
):
    """Run the APO training loop."""
    import agentlightning as agl
    from openai import AsyncOpenAI
    
    from app.config import settings
    from app.training.config import get_training_settings
    from app.training.datasets.base import (
        create_train_val_split,
        get_example_dataset,
        load_dataset_from_jsonl,
    )
    from app.training.litagent.customer_support import LitCustomerSupportAgent
    from app.agents.prompt.customer_support import SYSTEM_PROMPT
    
    training_settings = get_training_settings()
    
    # Load datasets
    if dataset_path:
        train_data = load_dataset_from_jsonl(dataset_path)
    else:
        console.print("[yellow]Using example dataset[/yellow]")
        train_data = get_example_dataset()
    
    if val_dataset_path:
        val_data = load_dataset_from_jsonl(val_dataset_path)
    else:
        # Split training data
        train_data, val_data = create_train_val_split(train_data, val_ratio=0.2)
    
    console.print(f"[green]✓ Loaded {len(train_data)} train, {len(val_data)} val tasks[/green]")
    
    # Create OpenRouter client for APO
    openrouter_client = AsyncOpenAI(
        base_url=training_settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    
    # Create LitAgent
    if agent_name == "customer_support":
        lit_agent = LitCustomerSupportAgent()
    else:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    # Create APO algorithm
    apo_algo = agl.APO(
        async_openai_client=openrouter_client,
        gradient_model=gradient_model,
        apply_edit_model=training_settings.apo_apply_edit_model,
        beam_width=beam_width,
        beam_rounds=rounds,
        branch_factor=training_settings.apo_branch_factor,
        val_batch_size=training_settings.apo_val_batch_size,
        diversity_temperature=training_settings.apo_diversity_temperature,
    )
    
    # Create trainer
    trainer = agl.Trainer(
        algorithm=apo_algo,
        initial_resources={
            "system_prompt": agl.PromptTemplate(
                template=SYSTEM_PROMPT,
                engine="f-string",
            )
        },
        n_runners=training_settings.n_runners,
    )
    
    # Run training
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Running APO optimization...", total=None)
        
        await trainer.fit_async(
            lit_agent,
            train_dataset=train_data.to_list(),
            val_dataset=val_data.to_list(),
        )
        
        progress.update(task, description="[green]APO optimization complete!")
    
    # Get best prompt
    best_resources = trainer.algorithm.get_best_resources()
    best_prompt = best_resources.get("system_prompt")
    
    if isinstance(best_prompt, agl.PromptTemplate):
        best_prompt_str = best_prompt.template
    else:
        best_prompt_str = str(best_prompt)
    
    console.print("\n[bold green]Optimized Prompt:[/bold green]")
    console.print(Panel(best_prompt_str[:500] + "..." if len(best_prompt_str) > 500 else best_prompt_str))
    
    # Save if output path provided
    if output_path:
        Path(output_path).write_text(best_prompt_str)
        console.print(f"[green]✓ Saved optimized prompt to {output_path}[/green]")


@training.command()
@click.option(
    "--agent",
    default="customer_support",
    help="Agent to train",
)
@click.option(
    "--dataset",
    required=True,
    type=click.Path(exists=True),
    help="Training dataset path (JSONL format)",
)
@click.option(
    "--model-path",
    default=None,
    help="Path to local model (default: from settings)",
)
@click.option(
    "--epochs",
    default=1,
    type=int,
    help="Number of training epochs",
)
@click.option(
    "--batch-size",
    default=4,
    type=int,
    help="Training batch size",
)
@click.option(
    "--learning-rate",
    default=1e-5,
    type=float,
    help="Learning rate",
)
@click.option(
    "--use-lora/--no-lora",
    default=True,
    help="Use LoRA for efficient fine-tuning",
)
@click.option(
    "--output-dir",
    default="./verl_output",
    type=click.Path(),
    help="Output directory for trained model",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Show configuration without running training",
)
def verl(
    agent: str,
    dataset: str,
    model_path: Optional[str],
    epochs: int,
    batch_size: int,
    learning_rate: float,
    use_lora: bool,
    output_dir: str,
    dry_run: bool,
):
    """Run VERL reinforcement learning training.
    
    VERL uses PPO (Proximal Policy Optimization) to train local models
    using reward signals from agent evaluations. Requires a GPU.
    
    Example:
        
        # Train with VERL
        python -m app.cli training verl --dataset data/train.jsonl --model-path ./models/base
    """
    console.print(Panel.fit(
        "[bold blue]VERL Reinforcement Learning Training[/bold blue]\n"
        f"Agent: {agent}\n"
        f"Epochs: {epochs} | Batch Size: {batch_size}",
        title="Training Configuration"
    ))
    
    try:
        from app.training.config import get_training_settings
        settings = get_training_settings()
        
        model = model_path or settings.verl_model_path
        if not model:
            console.print("[red]✗ No model path specified[/red]")
            console.print("[dim]Set TRAINING_VERL_MODEL_PATH or use --model-path[/dim]")
            return
        
        # Show configuration
        config_table = Table(title="VERL Configuration")
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        
        config_table.add_row("Model Path", model)
        config_table.add_row("Use LoRA", str(use_lora))
        config_table.add_row("Learning Rate", f"{learning_rate:.2e}")
        config_table.add_row("Batch Size", str(batch_size))
        config_table.add_row("Epochs", str(epochs))
        config_table.add_row("Dataset", dataset)
        config_table.add_row("Output Dir", output_dir)
        
        console.print(config_table)
        console.print()
        
        if dry_run:
            console.print("[yellow]Dry run - not starting training[/yellow]")
            return
        
        # Check GPU availability
        try:
            import torch
            if not torch.cuda.is_available():
                console.print("[yellow]⚠ No GPU detected. VERL training may be slow.[/yellow]")
        except ImportError:
            console.print("[yellow]⚠ PyTorch not installed. VERL requires PyTorch with GPU support.[/yellow]")
            return
        
        # Run VERL training
        asyncio.run(_run_verl_training(
            agent_name=agent,
            dataset_path=dataset,
            model_path=model,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            use_lora=use_lora,
            output_dir=output_dir,
        ))
        
    except ImportError as e:
        console.print(f"[red]✗ Missing dependency: {e}[/red]")
        console.print("[dim]VERL requires: pip install agentlightning[verl] torch[/dim]")
    except Exception as e:
        console.print(f"[red]✗ VERL training failed: {e}[/red]")
        raise


async def _run_verl_training(
    agent_name: str,
    dataset_path: str,
    model_path: str,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    use_lora: bool,
    output_dir: str,
):
    """Run VERL training loop."""
    import agentlightning as agl
    
    from app.training.datasets.base import load_dataset_from_jsonl
    from app.training.litagent.customer_support import LitCustomerSupportAgent
    
    # Load dataset
    train_data = load_dataset_from_jsonl(dataset_path)
    console.print(f"[green]✓ Loaded {len(train_data)} training tasks[/green]")
    
    # Create LitAgent
    if agent_name == "customer_support":
        lit_agent = LitCustomerSupportAgent()
    else:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    # Create VERL algorithm
    verl_algo = agl.VERL(
        model_path=model_path,
        use_lora=use_lora,
        learning_rate=learning_rate,
        batch_size=batch_size,
        epochs=epochs,
        output_dir=output_dir,
    )
    
    # Create trainer
    trainer = agl.Trainer(
        algorithm=verl_algo,
    )
    
    # Run training
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Running VERL training...", total=None)
        
        await trainer.fit_async(
            lit_agent,
            train_dataset=train_data.to_list(),
        )
        
        progress.update(task, description="[green]VERL training complete!")
    
    console.print(f"[green]✓ Model saved to {output_dir}[/green]")


@training.command()
@click.option(
    "--agent",
    default="customer_support",
    help="Agent to train",
)
@click.option(
    "--dataset",
    required=True,
    type=click.Path(exists=True),
    help="Training dataset path (JSONL format with input/output pairs)",
)
@click.option(
    "--model-path",
    default=None,
    help="Path to base model (default: from settings)",
)
@click.option(
    "--epochs",
    default=3,
    type=int,
    help="Number of training epochs",
)
@click.option(
    "--batch-size",
    default=4,
    type=int,
    help="Training batch size",
)
@click.option(
    "--learning-rate",
    default=2e-5,
    type=float,
    help="Learning rate",
)
@click.option(
    "--output-dir",
    default="./sft_output",
    type=click.Path(),
    help="Output directory for fine-tuned model",
)
@click.option(
    "--use-unsloth/--no-unsloth",
    default=True,
    help="Use Unsloth for faster training",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Show configuration without running training",
)
def sft(
    agent: str,
    dataset: str,
    model_path: Optional[str],
    epochs: int,
    batch_size: int,
    learning_rate: float,
    output_dir: str,
    use_unsloth: bool,
    dry_run: bool,
):
    """Run Supervised Fine-Tuning (SFT).
    
    SFT trains the model on input/output pairs to learn desired behavior.
    Uses Unsloth for efficient training when available.
    
    Dataset format (JSONL):
        {"input": "How do I reset my password?", "output": "To reset..."}
    
    Example:
        
        # Train with SFT
        python -m app.cli training sft --dataset data/sft_pairs.jsonl --model-path ./models/base
    """
    console.print(Panel.fit(
        "[bold blue]Supervised Fine-Tuning (SFT)[/bold blue]\n"
        f"Agent: {agent}\n"
        f"Epochs: {epochs} | Batch Size: {batch_size}",
        title="Training Configuration"
    ))
    
    try:
        from app.training.config import get_training_settings
        settings = get_training_settings()
        
        model = model_path or settings.sft_model_path
        if not model:
            console.print("[red]✗ No model path specified[/red]")
            console.print("[dim]Set TRAINING_SFT_MODEL_PATH or use --model-path[/dim]")
            return
        
        # Show configuration
        config_table = Table(title="SFT Configuration")
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        
        config_table.add_row("Model Path", model)
        config_table.add_row("Use Unsloth", str(use_unsloth))
        config_table.add_row("Learning Rate", f"{learning_rate:.2e}")
        config_table.add_row("Batch Size", str(batch_size))
        config_table.add_row("Epochs", str(epochs))
        config_table.add_row("Dataset", dataset)
        config_table.add_row("Output Dir", output_dir)
        
        console.print(config_table)
        console.print()
        
        if dry_run:
            console.print("[yellow]Dry run - not starting training[/yellow]")
            return
        
        # Check Unsloth availability
        if use_unsloth:
            try:
                import unsloth  # noqa: F401
                console.print("[green]✓ Unsloth available - using fast training[/green]")
            except ImportError:
                console.print("[yellow]⚠ Unsloth not available, using standard training[/yellow]")
                use_unsloth = False
        
        # Run SFT training
        asyncio.run(_run_sft_training(
            agent_name=agent,
            dataset_path=dataset,
            model_path=model,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            output_dir=output_dir,
            use_unsloth=use_unsloth,
        ))
        
    except ImportError as e:
        console.print(f"[red]✗ Missing dependency: {e}[/red]")
        console.print("[dim]SFT requires: pip install agentlightning[sft] unsloth[/dim]")
    except Exception as e:
        console.print(f"[red]✗ SFT training failed: {e}[/red]")
        raise


async def _run_sft_training(
    agent_name: str,
    dataset_path: str,
    model_path: str,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    output_dir: str,
    use_unsloth: bool,
):
    """Run SFT training loop."""
    import agentlightning as agl
    
    from app.training.datasets.base import load_dataset_from_jsonl
    
    # Load dataset
    train_data = load_dataset_from_jsonl(dataset_path)
    console.print(f"[green]✓ Loaded {len(train_data)} training pairs[/green]")
    
    # Create SFT algorithm
    sft_algo = agl.SFT(
        model_path=model_path,
        learning_rate=learning_rate,
        batch_size=batch_size,
        epochs=epochs,
        output_dir=output_dir,
        use_unsloth=use_unsloth,
    )
    
    # Create trainer
    trainer = agl.Trainer(
        algorithm=sft_algo,
    )
    
    # Run training
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Running SFT training...", total=None)
        
        # SFT trains directly on input/output pairs
        await trainer.fit_async(
            agent=None,  # SFT doesn't need an agent
            train_dataset=train_data.to_list(),
        )
        
        progress.update(task, description="[green]SFT training complete!")
    
    console.print(f"[green]✓ Fine-tuned model saved to {output_dir}[/green]")


@training.command()
def status():
    """Show training configuration and status."""
    console.print("[bold blue]Training Configuration Status[/bold blue]\n")
    
    try:
        from app.training.config import get_training_settings
        settings = get_training_settings()
        
        # APO status
        apo_table = Table(title="APO Configuration")
        apo_table.add_column("Setting", style="cyan")
        apo_table.add_column("Value", style="green")
        
        apo_table.add_row("Enabled", "[green]✓[/green]" if settings.apo_enabled else "[red]✗[/red]")
        apo_table.add_row("Gradient Model", settings.apo_gradient_model)
        apo_table.add_row("Beam Width", str(settings.apo_beam_width))
        apo_table.add_row("Beam Rounds", str(settings.apo_beam_rounds))
        
        console.print(apo_table)
        console.print()
        
        # VERL status
        verl_table = Table(title="VERL Configuration")
        verl_table.add_column("Setting", style="cyan")
        verl_table.add_column("Value", style="green")
        
        verl_table.add_row("Enabled", "[green]✓[/green]" if settings.verl_enabled else "[red]✗[/red]")
        verl_table.add_row("Model Path", settings.verl_model_path or "[dim]not set[/dim]")
        verl_table.add_row("Use LoRA", str(settings.verl_use_lora))
        verl_table.add_row("Learning Rate", f"{settings.verl_learning_rate:.2e}")
        
        console.print(verl_table)
        console.print()
        
        # SFT status
        sft_table = Table(title="SFT Configuration")
        sft_table.add_column("Setting", style="cyan")
        sft_table.add_column("Value", style="green")
        
        sft_table.add_row("Enabled", "[green]✓[/green]" if settings.sft_enabled else "[red]✗[/red]")
        sft_table.add_row("Model Path", settings.sft_model_path or "[dim]not set[/dim]")
        sft_table.add_row("Learning Rate", f"{settings.sft_learning_rate:.2e}")
        
        console.print(sft_table)
        console.print()
        
        # Store status
        store_table = Table(title="Store Configuration")
        store_table.add_column("Setting", style="cyan")
        store_table.add_column("Value", style="green")
        
        store_table.add_row("Type", settings.store_type)
        if settings.store_type == "sqlite":
            store_table.add_row("Path", settings.store_path)
        elif settings.store_type == "mongodb":
            store_table.add_row("URI", settings.store_mongodb_uri[:30] + "..." if settings.store_mongodb_uri else "[dim]not set[/dim]")
        
        console.print(store_table)
        
        # Check dependencies
        console.print("\n[bold]Dependency Status:[/bold]")
        
        try:
            import agentlightning
            console.print(f"  [green]✓[/green] agentlightning: {agentlightning.__version__}")
        except ImportError:
            console.print("  [red]✗[/red] agentlightning: not installed")
        
        try:
            import torch
            gpu_status = "GPU available" if torch.cuda.is_available() else "CPU only"
            console.print(f"  [green]✓[/green] torch: {torch.__version__} ({gpu_status})")
        except ImportError:
            console.print("  [yellow]○[/yellow] torch: not installed (optional)")
        
        try:
            import unsloth
            console.print(f"  [green]✓[/green] unsloth: available")
        except ImportError:
            console.print("  [yellow]○[/yellow] unsloth: not installed (optional for SFT)")
        
    except Exception as e:
        console.print(f"[red]✗ Failed to load settings: {e}[/red]")


@training.command()
@click.option(
    "--agent",
    default="customer_support",
    help="Agent to evaluate",
)
@click.option(
    "--dataset",
    required=True,
    type=click.Path(exists=True),
    help="Evaluation dataset path (JSONL format)",
)
@click.option(
    "--prompt",
    default=None,
    type=click.Path(exists=True),
    help="Path to custom prompt file (uses default if not provided)",
)
@click.option(
    "--limit",
    default=None,
    type=int,
    help="Limit number of tasks to evaluate",
)
def evaluate(
    agent: str,
    dataset: str,
    prompt: Optional[str],
    limit: Optional[int],
):
    """Evaluate an agent on a dataset.
    
    Runs the agent on each task and computes aggregate reward metrics.
    
    Example:
        
        python -m app.cli training evaluate --dataset data/test.jsonl --limit 50
    """
    console.print(Panel.fit(
        "[bold blue]Agent Evaluation[/bold blue]\n"
        f"Agent: {agent}",
        title="Evaluation"
    ))
    
    try:
        from app.training.datasets.base import load_dataset_from_jsonl
        from app.training.litagent.customer_support import LitCustomerSupportAgent
        from app.training.rewards.base import customer_support_reward
        from app.agents.prompt.customer_support import SYSTEM_PROMPT
        
        # Load dataset
        eval_data = load_dataset_from_jsonl(dataset, limit=limit)
        console.print(f"[green]✓ Loaded {len(eval_data)} evaluation tasks[/green]")
        
        # Load custom prompt if provided
        system_prompt = SYSTEM_PROMPT
        if prompt:
            system_prompt = Path(prompt).read_text()
            console.print(f"[green]✓ Loaded custom prompt from {prompt}[/green]")
        
        # Create agent
        if agent == "customer_support":
            from app.infrastructure.llm_provider import OpenRouterProvider
            from app.agents.agents.customer_support import CustomerSupportAgent
            
            provider = OpenRouterProvider()
            test_agent = CustomerSupportAgent(llm_provider=provider)
        else:
            raise ValueError(f"Unknown agent: {agent}")
        
        # Run evaluation
        rewards = []
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task(f"Evaluating {len(eval_data)} tasks...", total=len(eval_data))
            
            for item in eval_data:
                try:
                    result = asyncio.run(
                        test_agent.handle_inquiry(item.get("message", str(item)))
                    )
                    reward = customer_support_reward(item, result)
                    rewards.append(reward)
                except Exception as e:
                    console.print(f"[yellow]⚠ Task failed: {e}[/yellow]")
                    rewards.append(0.0)
                
                progress.update(task, advance=1)
        
        # Show results
        if rewards:
            avg_reward = sum(rewards) / len(rewards)
            min_reward = min(rewards)
            max_reward = max(rewards)
            
            results_table = Table(title="Evaluation Results")
            results_table.add_column("Metric", style="cyan")
            results_table.add_column("Value", style="green")
            
            results_table.add_row("Tasks Evaluated", str(len(rewards)))
            results_table.add_row("Average Reward", f"{avg_reward:.3f}")
            results_table.add_row("Min Reward", f"{min_reward:.3f}")
            results_table.add_row("Max Reward", f"{max_reward:.3f}")
            
            console.print(results_table)
        else:
            console.print("[yellow]No tasks were evaluated[/yellow]")
        
    except Exception as e:
        console.print(f"[red]✗ Evaluation failed: {e}[/red]")
        raise
