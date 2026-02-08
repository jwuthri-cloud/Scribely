"""
Example: Supervised Fine-Tuning (SFT) with agent-lightning.

SFT trains a model on input/output pairs to learn desired behavior.
Unlike RL (VERL), SFT directly teaches the model what outputs to produce
for given inputs, making it more stable but requiring labeled data.

Requirements:
- GPU with sufficient VRAM (8GB+ recommended)
- Training data with input/output pairs
- Optional: Unsloth for faster training

This example shows:
- Preparing SFT training data
- Configuring Unsloth for fast training
- Running SFT training
- Evaluating fine-tuned models
"""

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.training.config import get_training_settings
from app.utils.logging import get_logger

logger = get_logger("sft_example")


# =============================================================================
# Training Data Format
# =============================================================================

# SFT requires input/output pairs. Format:
# {"input": "customer message", "output": "ideal response"}

EXAMPLE_SFT_DATA = [
    {
        "input": "How do I reset my password?",
        "output": json.dumps({
            "response": "To reset your password, please follow these steps:\n\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address\n4. Check your inbox for the reset link\n5. Click the link and create a new password\n\nIf you don't receive the email within 5 minutes, please check your spam folder.",
            "sentiment": "neutral",
            "requires_escalation": False,
            "confidence": 0.95,
            "suggested_actions": ["check_spam_folder", "contact_support_if_no_email"]
        }),
    },
    {
        "input": "I was charged twice for my subscription",
        "output": json.dumps({
            "response": "I apologize for the double charge on your subscription. This shouldn't happen and I want to help resolve this immediately.\n\nI can see your account and will initiate a refund for the duplicate charge. The refund should appear in your account within 3-5 business days.\n\nIs there anything else I can help you with?",
            "sentiment": "negative",
            "requires_escalation": False,
            "confidence": 0.9,
            "suggested_actions": ["verify_refund_processed", "check_statement_in_5_days"]
        }),
    },
    {
        "input": "Your product is amazing! Best purchase ever!",
        "output": json.dumps({
            "response": "Thank you so much for the wonderful feedback! We're thrilled to hear you're enjoying the product. Your kind words mean a lot to our team.\n\nIf you have a moment, we'd love it if you could share your experience in a review. It helps others discover us!\n\nIs there anything else I can help you with today?",
            "sentiment": "positive",
            "requires_escalation": False,
            "confidence": 0.95,
            "suggested_actions": ["leave_review", "refer_a_friend"]
        }),
    },
    {
        "input": "I need to speak with a manager immediately!",
        "output": json.dumps({
            "response": "I understand you'd like to speak with a manager, and I want to make sure your concerns are properly addressed.\n\nCould you please share what issue you're experiencing? I may be able to help resolve it right away, or I can ensure a manager has all the context when they reach out to you.\n\nEither way, I'm here to help.",
            "sentiment": "negative",
            "requires_escalation": True,
            "escalation_reason": "Customer explicitly requested manager",
            "confidence": 0.85,
            "suggested_actions": ["escalate_to_manager", "document_issue"]
        }),
    },
    {
        "input": "When will my order arrive?",
        "output": json.dumps({
            "response": "I'd be happy to help you track your order!\n\nCould you please provide your order number? You can find it in your confirmation email or in your account under 'Order History'.\n\nOnce I have that, I can give you real-time tracking information and an estimated delivery date.",
            "sentiment": "neutral",
            "requires_escalation": False,
            "confidence": 0.9,
            "suggested_actions": ["provide_order_number", "check_email_for_tracking"]
        }),
    },
    {
        "input": "The app keeps crashing on my phone",
        "output": json.dumps({
            "response": "I'm sorry to hear you're experiencing crashes. Let's troubleshoot this together.\n\nPlease try these steps:\n1. Force close the app completely\n2. Check if there's an app update available\n3. Restart your phone\n4. If crashes continue, try uninstalling and reinstalling the app\n\nCould you also let me know what phone model and OS version you're using? This helps us identify if it's a known issue.",
            "sentiment": "negative",
            "requires_escalation": False,
            "confidence": 0.85,
            "suggested_actions": ["update_app", "restart_device", "reinstall_if_needed"]
        }),
    },
    {
        "input": "Can I get a refund for my purchase?",
        "output": json.dumps({
            "response": "I'd be happy to help with your refund request.\n\nOur refund policy allows returns within 30 days of purchase for a full refund. Could you please share:\n\n1. Your order number\n2. The reason for the refund (so we can improve)\n\nOnce I have these details, I can process your request right away.",
            "sentiment": "neutral",
            "requires_escalation": False,
            "confidence": 0.9,
            "suggested_actions": ["provide_order_details", "initiate_return"]
        }),
    },
    {
        "input": "This is the worst customer service I've ever experienced!",
        "output": json.dumps({
            "response": "I sincerely apologize for your experience. This is not the level of service we strive to provide, and I take your feedback very seriously.\n\nI would like to understand what went wrong so we can make it right. Could you please share what happened? I'm personally committed to resolving this for you.\n\nI'm also flagging this for our management team to review.",
            "sentiment": "negative",
            "requires_escalation": True,
            "escalation_reason": "Severe customer dissatisfaction requiring management attention",
            "confidence": 0.8,
            "suggested_actions": ["document_complaint", "escalate_to_management", "offer_compensation"]
        }),
    },
]


# =============================================================================
# SFT Training
# =============================================================================

def check_requirements() -> Dict[str, bool]:
    """Check SFT requirements."""
    requirements = {}
    
    # Check GPU
    try:
        import torch
        requirements["torch"] = True
        requirements["gpu"] = torch.cuda.is_available()
        if requirements["gpu"]:
            logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    except ImportError:
        requirements["torch"] = False
        requirements["gpu"] = False
    
    # Check Unsloth
    try:
        import unsloth  # noqa: F401
        requirements["unsloth"] = True
        logger.info("Unsloth available for fast training")
    except ImportError:
        requirements["unsloth"] = False
        logger.info("Unsloth not available (optional)")
    
    # Check transformers
    try:
        import transformers  # noqa: F401
        requirements["transformers"] = True
    except ImportError:
        requirements["transformers"] = False
    
    return requirements


async def run_sft_training(
    model_path: str,
    dataset_path: str,
    output_dir: str = "./sft_output",
    epochs: int = 3,
    batch_size: int = 4,
    learning_rate: float = 2e-5,
    use_unsloth: bool = True,
    verbose: bool = True,
) -> str:
    """Run SFT training on input/output pairs.
    
    Args:
        model_path: Path to the base model
        dataset_path: Path to JSONL file with input/output pairs
        output_dir: Directory to save fine-tuned model
        epochs: Number of training epochs
        batch_size: Training batch size
        learning_rate: Learning rate
        use_unsloth: Use Unsloth for faster training
        verbose: Whether to log progress
    
    Returns:
        Path to saved model
    """
    import agentlightning as agl
    
    from app.training.datasets.base import load_dataset_from_jsonl
    
    if verbose:
        logger.info("=" * 60)
        logger.info("SFT Training Configuration")
        logger.info("=" * 60)
        logger.info(f"Model: {model_path}")
        logger.info(f"Dataset: {dataset_path}")
        logger.info(f"Output: {output_dir}")
        logger.info(f"Epochs: {epochs}")
        logger.info(f"Batch Size: {batch_size}")
        logger.info(f"Learning Rate: {learning_rate}")
        logger.info(f"Use Unsloth: {use_unsloth}")
        logger.info("")
    
    # Check requirements
    reqs = check_requirements()
    if not reqs.get("torch"):
        raise RuntimeError("PyTorch required for SFT training")
    if not reqs.get("gpu"):
        logger.warning("No GPU detected. Training will be slow.")
    
    # Check Unsloth availability
    if use_unsloth and not reqs.get("unsloth"):
        logger.warning("Unsloth not available, using standard training")
        use_unsloth = False
    
    # Load dataset
    train_data = load_dataset_from_jsonl(dataset_path)
    
    if verbose:
        logger.info(f"Loaded {len(train_data)} training pairs")
        logger.info("")
    
    # Create SFT algorithm
    sft = agl.SFT(
        model_path=model_path,
        learning_rate=learning_rate,
        batch_size=batch_size,
        epochs=epochs,
        output_dir=output_dir,
        use_unsloth=use_unsloth,
    )
    
    # Create trainer
    trainer = agl.Trainer(
        algorithm=sft,
    )
    
    # Run training
    if verbose:
        logger.info("Starting SFT training...")
        logger.info("")
    
    await trainer.fit_async(
        agent=None,  # SFT doesn't use an agent
        train_dataset=train_data.to_list(),
    )
    
    if verbose:
        logger.info("")
        logger.info("=" * 60)
        logger.info("SFT Training Complete!")
        logger.info("=" * 60)
        logger.info(f"Model saved to: {output_dir}")
    
    return output_dir


# =============================================================================
# Dataset Preparation
# =============================================================================

def create_sft_dataset(output_path: str = "./data/sft_train.jsonl"):
    """Create an example SFT training dataset.
    
    Args:
        output_path: Where to save the JSONL file
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        for item in EXAMPLE_SFT_DATA:
            f.write(json.dumps(item) + "\n")
    
    logger.info(f"Created SFT dataset with {len(EXAMPLE_SFT_DATA)} examples")
    logger.info(f"Saved to: {output_path}")
    
    return output_path


def format_for_chat_template(
    data: List[Dict[str, str]],
    system_prompt: str = "You are a helpful customer support assistant.",
) -> List[Dict[str, Any]]:
    """Format SFT data for chat template.
    
    Converts input/output pairs to chat format suitable for
    instruction-tuned models.
    
    Args:
        data: List of {"input": ..., "output": ...} dicts
        system_prompt: System prompt to use
    
    Returns:
        List of formatted chat examples
    """
    formatted = []
    
    for item in data:
        example = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": item["input"]},
                {"role": "assistant", "content": item["output"]},
            ]
        }
        formatted.append(example)
    
    return formatted


def create_chat_format_dataset(
    output_path: str = "./data/sft_chat_train.jsonl",
    system_prompt: Optional[str] = None,
):
    """Create SFT dataset in chat format.
    
    Args:
        output_path: Where to save the JSONL file
        system_prompt: Custom system prompt
    """
    from app.agents.prompt.customer_support import SYSTEM_PROMPT
    
    system = system_prompt or SYSTEM_PROMPT
    formatted = format_for_chat_template(EXAMPLE_SFT_DATA, system)
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        for item in formatted:
            f.write(json.dumps(item) + "\n")
    
    logger.info(f"Created chat-format SFT dataset with {len(formatted)} examples")
    logger.info(f"Saved to: {output_path}")
    
    return output_path


# =============================================================================
# Quick Demo
# =============================================================================

async def quick_sft_demo(model_path: str, dataset_path: str):
    """Quick demo with minimal epochs.
    
    Args:
        model_path: Path to a small model
        dataset_path: Path to SFT data
    """
    logger.info("Quick SFT Demo (1 epoch)")
    logger.info("-" * 40)
    
    output_dir = await run_sft_training(
        model_path=model_path,
        dataset_path=dataset_path,
        output_dir="./sft_quick_output",
        epochs=1,
        batch_size=2,
        use_unsloth=True,
        verbose=True,
    )
    
    logger.info(f"\nTrained model saved to: {output_dir}")
    return output_dir


# =============================================================================
# Full Training
# =============================================================================

async def full_sft_training(
    model_path: str,
    dataset_path: str,
    output_dir: str = "./sft_full_output",
):
    """Full SFT training with recommended settings.
    
    Args:
        model_path: Path to the base model
        dataset_path: Path to training data
        output_dir: Where to save fine-tuned model
    """
    training_settings = get_training_settings()
    
    logger.info("Full SFT Training")
    logger.info("-" * 40)
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    await run_sft_training(
        model_path=model_path,
        dataset_path=dataset_path,
        output_dir=output_dir,
        epochs=training_settings.sft_epochs,
        batch_size=training_settings.sft_batch_size,
        learning_rate=training_settings.sft_learning_rate,
        use_unsloth=True,
        verbose=True,
    )


# =============================================================================
# Main
# =============================================================================

async def main():
    """Run SFT example."""
    logger.info("=" * 60)
    logger.info("SFT (Supervised Fine-Tuning) Example")
    logger.info("=" * 60)
    logger.info("")
    
    # Check requirements
    reqs = check_requirements()
    
    if not reqs.get("torch"):
        logger.info("PyTorch not installed. Install with:")
        logger.info("  pip install torch")
        logger.info("")
        return
    
    # Create example dataset
    logger.info("Creating example SFT dataset...")
    dataset_path = create_sft_dataset()
    
    # Also create chat format version
    chat_dataset_path = create_chat_format_dataset()
    
    logger.info("")
    logger.info("Example datasets created!")
    logger.info(f"  Input/Output format: {dataset_path}")
    logger.info(f"  Chat format: {chat_dataset_path}")
    logger.info("")
    
    # Show how to run training
    training_settings = get_training_settings()
    
    if training_settings.sft_model_path:
        logger.info(f"Model configured: {training_settings.sft_model_path}")
        logger.info("")
        logger.info("To run training:")
        logger.info(f"  python -m app.cli training sft --dataset {dataset_path}")
    else:
        logger.info("No model configured. Set TRAINING_SFT_MODEL_PATH or use --model-path")
        logger.info("")
        logger.info("Example with TinyLlama:")
        logger.info("  python -m app.cli training sft \\")
        logger.info("    --model-path TinyLlama/TinyLlama-1.1B-Chat-v1.0 \\")
        logger.info(f"    --dataset {dataset_path}")
    
    logger.info("")
    logger.info("For Unsloth (4x faster training), install:")
    logger.info("  pip install unsloth")


if __name__ == "__main__":
    asyncio.run(main())
