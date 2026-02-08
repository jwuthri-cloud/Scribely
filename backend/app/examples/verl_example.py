"""
Example: VERL (Reinforcement Learning) training with agent-lightning.

VERL uses PPO (Proximal Policy Optimization) to train local language models
using reward signals. Unlike APO which optimizes prompts, VERL optimizes
the model weights themselves.

Requirements:
- GPU with sufficient VRAM (8GB+ recommended)
- PyTorch with CUDA support
- A local model (e.g., Llama, Mistral)

This example shows:
- Setting up VERL with LoRA
- Configuring PPO hyperparameters
- Running RL training
- Evaluating trained models
"""

import asyncio
from pathlib import Path
from typing import Any, Dict, Optional

from app.training.config import get_training_settings
from app.training.datasets.base import (
    CustomerSupportDataset,
    CustomerSupportTask,
)
from app.training.rewards.base import customer_support_reward
from app.utils.logging import get_logger

logger = get_logger("verl_example")


# =============================================================================
# Training Data
# =============================================================================

TRAINING_TASKS = [
    CustomerSupportTask(
        message="How do I reset my password?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="I was charged twice for my subscription",
        expected_sentiment="negative",
    ),
    CustomerSupportTask(
        message="Your product is amazing!",
        expected_sentiment="positive",
    ),
    CustomerSupportTask(
        message="I need to speak with a manager immediately",
        expected_sentiment="negative",
        expected_escalation=True,
    ),
    CustomerSupportTask(
        message="When will my order arrive?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="The app keeps crashing",
        expected_sentiment="negative",
    ),
    CustomerSupportTask(
        message="Can I get a refund?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="This is the worst service ever!",
        expected_sentiment="negative",
        expected_escalation=True,
    ),
]


# =============================================================================
# VERL Training
# =============================================================================

def check_gpu_availability() -> bool:
    """Check if GPU is available for training."""
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            memory_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
            logger.info(f"GPU available: {device_name} ({memory_gb:.1f} GB)")
            return True
        else:
            logger.warning("No GPU available. VERL training requires a GPU.")
            return False
    except ImportError:
        logger.error("PyTorch not installed. Install with: pip install torch")
        return False


async def run_verl_training(
    model_path: str,
    output_dir: str = "./verl_output",
    epochs: int = 1,
    batch_size: int = 4,
    learning_rate: float = 1e-5,
    use_lora: bool = True,
    verbose: bool = True,
) -> str:
    """Run VERL training to fine-tune a local model.
    
    Args:
        model_path: Path to the base model (HuggingFace format)
        output_dir: Directory to save the fine-tuned model
        epochs: Number of training epochs
        batch_size: Training batch size
        learning_rate: Learning rate for PPO
        use_lora: Whether to use LoRA for efficient training
        verbose: Whether to log progress
    
    Returns:
        Path to the saved model
    """
    import agentlightning as agl
    
    from app.training.litagent.customer_support import LitCustomerSupportAgent
    
    if verbose:
        logger.info("=" * 60)
        logger.info("VERL Training Configuration")
        logger.info("=" * 60)
        logger.info(f"Model: {model_path}")
        logger.info(f"Output: {output_dir}")
        logger.info(f"Epochs: {epochs}")
        logger.info(f"Batch Size: {batch_size}")
        logger.info(f"Learning Rate: {learning_rate}")
        logger.info(f"Use LoRA: {use_lora}")
        logger.info("")
    
    # Check GPU
    if not check_gpu_availability():
        raise RuntimeError("GPU required for VERL training")
    
    # Prepare dataset
    dataset = CustomerSupportDataset(TRAINING_TASKS, name="verl_train")
    
    if verbose:
        logger.info(f"Training data: {len(dataset)} tasks")
        logger.info("")
    
    # Create LitAgent
    lit_agent = LitCustomerSupportAgent(
        model_name="local",  # Will be overridden by VERL
        reward_fn=customer_support_reward,
    )
    
    # Create VERL algorithm
    verl = agl.VERL(
        model_path=model_path,
        use_lora=use_lora,
        learning_rate=learning_rate,
        batch_size=batch_size,
        epochs=epochs,
        output_dir=output_dir,
        # PPO hyperparameters
        ppo_clip_range=0.2,
        value_loss_coef=0.5,
        entropy_coef=0.01,
    )
    
    # Create trainer
    trainer = agl.Trainer(
        algorithm=verl,
    )
    
    # Run training
    if verbose:
        logger.info("Starting VERL training...")
        logger.info("This may take a while depending on model size and epochs.")
        logger.info("")
    
    await trainer.fit_async(
        lit_agent,
        train_dataset=dataset.to_list(),
    )
    
    if verbose:
        logger.info("")
        logger.info("=" * 60)
        logger.info("VERL Training Complete!")
        logger.info("=" * 60)
        logger.info(f"Model saved to: {output_dir}")
    
    return output_dir


# =============================================================================
# LoRA Configuration
# =============================================================================

def get_lora_config() -> Dict[str, Any]:
    """Get LoRA configuration for efficient fine-tuning.
    
    LoRA (Low-Rank Adaptation) allows training only a small number of
    additional parameters instead of the full model, significantly
    reducing memory requirements and training time.
    
    Returns:
        Dictionary of LoRA configuration
    """
    return {
        # LoRA rank (lower = fewer params, higher = more capacity)
        "r": 16,
        # LoRA alpha (scaling factor)
        "lora_alpha": 32,
        # Dropout for LoRA layers
        "lora_dropout": 0.05,
        # Which modules to apply LoRA to
        "target_modules": [
            "q_proj",
            "k_proj", 
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        # Bias handling
        "bias": "none",
        # Task type
        "task_type": "CAUSAL_LM",
    }


# =============================================================================
# Example: Quick VERL Demo
# =============================================================================

async def quick_verl_demo(model_path: str):
    """Quick demo with minimal epochs.
    
    Args:
        model_path: Path to a small model (e.g., TinyLlama)
    """
    logger.info("Quick VERL Demo (1 epoch)")
    logger.info("-" * 40)
    
    output_dir = await run_verl_training(
        model_path=model_path,
        output_dir="./verl_quick_output",
        epochs=1,
        batch_size=2,
        use_lora=True,
        verbose=True,
    )
    
    logger.info(f"\nTrained model saved to: {output_dir}")
    return output_dir


# =============================================================================
# Example: Full VERL Training
# =============================================================================

async def full_verl_training(
    model_path: str,
    output_dir: str = "./verl_full_output",
):
    """Full VERL training with recommended settings.
    
    Args:
        model_path: Path to the base model
        output_dir: Where to save the fine-tuned model
    """
    training_settings = get_training_settings()
    
    logger.info("Full VERL Training")
    logger.info("-" * 40)
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    await run_verl_training(
        model_path=model_path,
        output_dir=output_dir,
        epochs=training_settings.verl_epochs,
        batch_size=training_settings.verl_batch_size,
        learning_rate=training_settings.verl_learning_rate,
        use_lora=training_settings.verl_use_lora,
        verbose=True,
    )


# =============================================================================
# Evaluation
# =============================================================================

async def evaluate_verl_model(
    model_path: str,
    test_tasks: list,
) -> float:
    """Evaluate a VERL-trained model on test tasks.
    
    Args:
        model_path: Path to the fine-tuned model
        test_tasks: List of test tasks
    
    Returns:
        Average reward
    """
    logger.info(f"Evaluating model: {model_path}")
    
    # Load the model for inference
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            device_map="auto",
        )
        
        rewards = []
        
        for task in test_tasks:
            message = task.get("message", str(task))
            
            # Generate response
            inputs = tokenizer(message, return_tensors="pt")
            inputs = {k: v.to(model.device) for k, v in inputs.items()}
            
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=0.7,
                do_sample=True,
            )
            
            response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Create a mock response for reward computation
            from app.agents.structured_output.customer_support import CustomerSupportResponse
            
            response = CustomerSupportResponse(
                response=response_text,
                sentiment="neutral",  # Would need NLU to detect
                requires_escalation=False,
                confidence=0.7,
            )
            
            reward = customer_support_reward(task, response)
            rewards.append(reward)
        
        avg_reward = sum(rewards) / len(rewards) if rewards else 0.0
        logger.info(f"Average reward: {avg_reward:.3f}")
        return avg_reward
        
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        return 0.0


# =============================================================================
# Main
# =============================================================================

async def main():
    """Run VERL example."""
    logger.info("=" * 60)
    logger.info("VERL (Reinforcement Learning) Training Example")
    logger.info("=" * 60)
    logger.info("")
    
    # Check requirements
    if not check_gpu_availability():
        logger.info("")
        logger.info("To run VERL training, you need:")
        logger.info("  1. A CUDA-capable GPU")
        logger.info("  2. PyTorch with CUDA support")
        logger.info("  3. A local model (e.g., TinyLlama, Mistral)")
        logger.info("")
        logger.info("Example command:")
        logger.info("  python -m app.cli training verl \\")
        logger.info("    --model-path TinyLlama/TinyLlama-1.1B-Chat-v1.0 \\")
        logger.info("    --dataset data/train.jsonl")
        return
    
    # If GPU available, show configuration
    training_settings = get_training_settings()
    
    if training_settings.verl_model_path:
        logger.info(f"Model path configured: {training_settings.verl_model_path}")
        logger.info("")
        logger.info("To run training:")
        logger.info(f"  python -m app.cli training verl --dataset data/train.jsonl")
    else:
        logger.info("No model path configured.")
        logger.info("Set TRAINING_VERL_MODEL_PATH or use --model-path")
        logger.info("")
        logger.info("Example with TinyLlama:")
        logger.info("  python -m app.cli training verl \\")
        logger.info("    --model-path TinyLlama/TinyLlama-1.1B-Chat-v1.0 \\")
        logger.info("    --dataset data/train.jsonl")


if __name__ == "__main__":
    asyncio.run(main())
