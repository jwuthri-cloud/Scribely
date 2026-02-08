"""
Example: Automatic Prompt Optimization (APO) with agent-lightning.

APO uses textual gradients to optimize prompts. It:
1. Runs the agent on training tasks
2. Computes "gradients" - natural language descriptions of how to improve
3. Applies edits to the prompt based on gradients
4. Evaluates and keeps the best prompts (beam search)

This example shows:
- Setting up APO with OpenRouter
- Configuring beam search parameters
- Tracking optimization progress
- Saving and loading optimized prompts
"""

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Optional

import agentlightning as agl
from openai import AsyncOpenAI

from app.agents.prompt.customer_support import SYSTEM_PROMPT
from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.config import settings
from app.training.config import get_training_settings
from app.training.datasets.base import (
    CustomerSupportDataset,
    CustomerSupportTask,
    create_train_val_split,
)
from app.training.litagent.customer_support import LitCustomerSupportAgent
from app.training.rewards.base import customer_support_reward
from app.utils.logging import get_logger

logger = get_logger("apo_example")


# =============================================================================
# Training Data
# =============================================================================

# Sample training tasks with expected outcomes for reward computation
TRAINING_TASKS = [
    CustomerSupportTask(
        message="How do I reset my password?",
        expected_sentiment="neutral",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="I was charged twice for my subscription last month",
        expected_sentiment="negative",
        expected_escalation=False,
        metadata={"category": "billing"},
    ),
    CustomerSupportTask(
        message="Your product saved my business! Thank you so much!",
        expected_sentiment="positive",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="I've been on hold for 2 hours and nobody has helped me!",
        expected_sentiment="negative",
        expected_escalation=True,
        metadata={"category": "complaint"},
    ),
    CustomerSupportTask(
        message="What are your business hours?",
        expected_sentiment="neutral",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="My order hasn't arrived and it's been 3 weeks!",
        expected_sentiment="negative",
        expected_escalation=False,
        metadata={"category": "shipping"},
    ),
    CustomerSupportTask(
        message="Can you explain how the premium features work?",
        expected_sentiment="neutral",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="This is unacceptable! I want a full refund immediately!",
        expected_sentiment="negative",
        expected_escalation=True,
        metadata={"category": "refund"},
    ),
    CustomerSupportTask(
        message="Do you offer student discounts?",
        expected_sentiment="neutral",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="The login page isn't loading on mobile",
        expected_sentiment="negative",
        expected_escalation=False,
        metadata={"category": "technical"},
    ),
]


# =============================================================================
# APO Training
# =============================================================================

async def run_apo_training(
    beam_width: int = 4,
    beam_rounds: int = 3,
    output_path: Optional[str] = None,
    verbose: bool = True,
) -> str:
    """Run APO training to optimize the customer support prompt.
    
    Args:
        beam_width: Number of prompt candidates to keep each round
        beam_rounds: Number of optimization rounds
        output_path: Optional path to save the optimized prompt
        verbose: Whether to log progress
    
    Returns:
        The optimized system prompt
    """
    training_settings = get_training_settings()
    
    if verbose:
        logger.info("=" * 60)
        logger.info("APO Training Configuration")
        logger.info("=" * 60)
        logger.info(f"Gradient Model: {training_settings.apo_gradient_model}")
        logger.info(f"Apply Edit Model: {training_settings.apo_apply_edit_model}")
        logger.info(f"Beam Width: {beam_width}")
        logger.info(f"Beam Rounds: {beam_rounds}")
        logger.info(f"Branch Factor: {training_settings.apo_branch_factor}")
        logger.info("")
    
    # 1. Prepare datasets
    dataset = CustomerSupportDataset(TRAINING_TASKS, name="apo_train")
    train_data, val_data = create_train_val_split(dataset, val_ratio=0.2, seed=42)
    
    if verbose:
        logger.info(f"Training data: {len(train_data)} tasks")
        logger.info(f"Validation data: {len(val_data)} tasks")
        logger.info("")
    
    # 2. Create the LitAgent wrapper
    lit_agent = LitCustomerSupportAgent(
        model_name="openai/gpt-5-mini",
        temperature=0.7,
        reward_fn=customer_support_reward,
        include_langfuse=True,
    )
    
    # 3. Create OpenRouter client for APO's gradient computation
    openrouter_client = AsyncOpenAI(
        base_url=training_settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    
    # 4. Create the APO algorithm
    apo = agl.APO(
        async_openai_client=openrouter_client,
        gradient_model=training_settings.apo_gradient_model,
        apply_edit_model=training_settings.apo_apply_edit_model,
        beam_width=beam_width,
        beam_rounds=beam_rounds,
        branch_factor=training_settings.apo_branch_factor,
        val_batch_size=training_settings.apo_val_batch_size,
        gradient_batch_size=training_settings.apo_gradient_batch_size,
        diversity_temperature=training_settings.apo_diversity_temperature,
    )
    
    # 5. Create the trainer with initial resources
    trainer = agl.Trainer(
        algorithm=apo,
        initial_resources={
            "system_prompt": agl.PromptTemplate(
                template=SYSTEM_PROMPT,
                engine="f-string",
            )
        },
        n_runners=training_settings.n_runners,
    )
    
    # 6. Run training
    if verbose:
        logger.info("Starting APO optimization...")
        logger.info("This may take several minutes depending on configuration.")
        logger.info("")
    
    await trainer.fit_async(
        lit_agent,
        train_dataset=train_data.to_list(),
        val_dataset=val_data.to_list(),
    )
    
    # 7. Extract optimized prompt
    best_resources = trainer.algorithm.get_best_resources()
    best_prompt = best_resources.get("system_prompt")
    
    if isinstance(best_prompt, agl.PromptTemplate):
        optimized_prompt = best_prompt.template
    else:
        optimized_prompt = str(best_prompt)
    
    if verbose:
        logger.info("")
        logger.info("=" * 60)
        logger.info("APO Optimization Complete!")
        logger.info("=" * 60)
        logger.info(f"Optimized prompt length: {len(optimized_prompt)} chars")
        logger.info("")
    
    # 8. Save if output path provided
    if output_path:
        Path(output_path).write_text(optimized_prompt)
        logger.info(f"Saved optimized prompt to: {output_path}")
        
        # Also save metadata
        meta_path = Path(output_path).with_suffix(".json")
        meta_data = {
            "beam_width": beam_width,
            "beam_rounds": beam_rounds,
            "gradient_model": training_settings.apo_gradient_model,
            "apply_edit_model": training_settings.apo_apply_edit_model,
            "train_size": len(train_data),
            "val_size": len(val_data),
        }
        meta_path.write_text(json.dumps(meta_data, indent=2))
        logger.info(f"Saved training metadata to: {meta_path}")
    
    return optimized_prompt


# =============================================================================
# Quick APO Demo
# =============================================================================

async def quick_apo_demo():
    """Quick demo with minimal settings for testing.
    
    Uses smaller beam width and single round for fast execution.
    """
    logger.info("Quick APO Demo (1 round, beam width 2)")
    logger.info("-" * 40)
    
    optimized = await run_apo_training(
        beam_width=2,
        beam_rounds=1,
        verbose=True,
    )
    
    logger.info("\nOriginal prompt (first 200 chars):")
    logger.info(SYSTEM_PROMPT[:200] + "...")
    
    logger.info("\nOptimized prompt (first 200 chars):")
    logger.info(optimized[:200] + "...")
    
    return optimized


# =============================================================================
# Full APO Training
# =============================================================================

async def full_apo_training(output_dir: str = "./apo_output"):
    """Full APO training with default settings.
    
    Args:
        output_dir: Directory to save optimized prompt and metadata
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_path = Path(output_dir) / "optimized_prompt.txt"
    
    logger.info("Full APO Training")
    logger.info("-" * 40)
    
    training_settings = get_training_settings()
    
    optimized = await run_apo_training(
        beam_width=training_settings.apo_beam_width,
        beam_rounds=training_settings.apo_beam_rounds,
        output_path=str(output_path),
        verbose=True,
    )
    
    return optimized


# =============================================================================
# Compare Prompts
# =============================================================================

async def compare_prompts(original: str, optimized: str, test_tasks: list):
    """Compare original and optimized prompts on test tasks.
    
    Args:
        original: Original system prompt
        optimized: Optimized system prompt  
        test_tasks: List of test tasks (dicts with "message" key)
    
    Returns:
        Dict with comparison results
    """
    from app.infrastructure.llm_provider import OpenRouterProvider
    from langchain.agents import create_agent
    from langchain_core.messages import HumanMessage
    
    from app.agents.tool.customer_support import CUSTOMER_SUPPORT_TOOLS
    
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-5-mini", temperature=0.7)
    
    async def evaluate_prompt(prompt: str, name: str):
        agent = create_agent(
            model=llm,
            system_prompt=prompt,
            tools=CUSTOMER_SUPPORT_TOOLS,
            response_format=CustomerSupportResponse,
        )
        
        rewards = []
        for task in test_tasks:
            message = task.get("message", str(task))
            try:
                result = await agent.ainvoke(
                    {"messages": [HumanMessage(content=message)]}
                )
                
                if isinstance(result, dict) and "structured_response" in result:
                    response = result["structured_response"]
                    if isinstance(response, dict):
                        response = CustomerSupportResponse(**response)
                else:
                    response = CustomerSupportResponse(
                        response=str(result),
                        sentiment="neutral",
                        requires_escalation=False,
                        confidence=0.5,
                    )
                
                reward = customer_support_reward(task, response)
                rewards.append(reward)
                
            except Exception as e:
                logger.warning(f"[{name}] Task failed: {e}")
                rewards.append(0.0)
        
        avg = sum(rewards) / len(rewards) if rewards else 0.0
        logger.info(f"[{name}] Average reward: {avg:.3f}")
        return avg
    
    logger.info("\nComparing prompts on test tasks...")
    logger.info("-" * 40)
    
    original_score = await evaluate_prompt(original, "Original")
    optimized_score = await evaluate_prompt(optimized, "Optimized")
    
    improvement = ((optimized_score - original_score) / max(original_score, 0.001)) * 100
    
    logger.info("")
    logger.info(f"Original score:  {original_score:.3f}")
    logger.info(f"Optimized score: {optimized_score:.3f}")
    logger.info(f"Improvement:     {improvement:+.1f}%")
    
    return {
        "original_score": original_score,
        "optimized_score": optimized_score,
        "improvement_percent": improvement,
    }


# =============================================================================
# Main
# =============================================================================

async def main():
    """Run APO example."""
    logger.info("=" * 60)
    logger.info("APO (Automatic Prompt Optimization) Example")
    logger.info("=" * 60)
    logger.info("")
    
    # Run quick demo
    optimized = await quick_apo_demo()
    
    # Compare prompts
    test_tasks = [t.to_dict() for t in TRAINING_TASKS[:3]]
    await compare_prompts(SYSTEM_PROMPT, optimized, test_tasks)
    
    logger.info("")
    logger.info("Done! For full training, run:")
    logger.info("  python -m app.cli training apo --rounds 3 --beam-width 4")


if __name__ == "__main__":
    asyncio.run(main())
