"""
Example: Training CustomerSupportAgent with agent-lightning.

This example demonstrates how to train the CustomerSupportAgent using
agent-lightning's training infrastructure. It covers:

1. Setting up a LitAgent wrapper
2. Defining reward functions
3. Running APO (Automatic Prompt Optimization)
4. Evaluating optimized prompts

For detailed examples of each training method, see:
- apo_example.py - Automatic Prompt Optimization
- verl_example.py - Reinforcement Learning
- sft_example.py - Supervised Fine-tuning
"""

import asyncio
from typing import Any, Dict

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
from app.training.rewards.base import (
    create_weighted_reward,
    customer_support_reward,
)
from app.utils.logging import get_logger

logger = get_logger("training_example")


# =============================================================================
# Training Tasks
# =============================================================================

TRAINING_TASKS = [
    CustomerSupportTask(
        message="How do I reset my password?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="I was charged twice for my subscription",
        expected_sentiment="negative",
        expected_escalation=False,
    ),
    CustomerSupportTask(
        message="Your product is amazing! Best purchase ever!",
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
        message="Can I get a refund for my purchase?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="The app keeps crashing on my phone",
        expected_sentiment="negative",
    ),
    CustomerSupportTask(
        message="How do I update my billing information?",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="I have a question about your privacy policy",
        expected_sentiment="neutral",
    ),
    CustomerSupportTask(
        message="This is the worst customer service I've ever experienced!",
        expected_sentiment="negative",
        expected_escalation=True,
    ),
]


# =============================================================================
# Custom Reward Function
# =============================================================================

def custom_reward_fn(task: Dict[str, Any], result: CustomerSupportResponse) -> float:
    """Custom reward function for training.
    
    This example shows how to create a custom reward function that:
    - Rewards high confidence responses
    - Penalizes unnecessary escalations
    - Rewards matching expected sentiment
    - Rewards appropriate response length
    
    Args:
        task: The input task dictionary
        result: The agent's response
    
    Returns:
        Reward value between 0.0 and 1.0
    """
    score = 0.0
    
    # 1. Base reward for having a response
    if result.response and len(result.response) > 20:
        score += 0.2
    
    # 2. Confidence reward (up to 0.3)
    if result.confidence >= 0.8:
        score += 0.3
    elif result.confidence >= 0.6:
        score += 0.2
    elif result.confidence >= 0.4:
        score += 0.1
    
    # 3. Escalation handling (up to 0.2)
    expected_escalation = task.get("expected_escalation")
    if expected_escalation is not None:
        if result.requires_escalation == expected_escalation:
            score += 0.2
    elif not result.requires_escalation:
        # If no expectation, reward not escalating
        score += 0.1
    
    # 4. Sentiment matching (up to 0.2)
    expected_sentiment = task.get("expected_sentiment")
    if expected_sentiment and result.sentiment.lower() == expected_sentiment.lower():
        score += 0.2
    
    # 5. Suggested actions (up to 0.1)
    if result.suggested_actions:
        score += min(0.1, len(result.suggested_actions) * 0.03)
    
    return min(1.0, score)


# =============================================================================
# Basic Training Example
# =============================================================================

async def basic_training_example():
    """Basic example of training with APO.
    
    This shows the minimal setup required to train an agent.
    """
    logger.info("=== Basic APO Training Example ===")
    
    training_settings = get_training_settings()
    
    # 1. Create dataset
    dataset = CustomerSupportDataset(TRAINING_TASKS, name="example_train")
    train_data, val_data = create_train_val_split(dataset, val_ratio=0.2, seed=42)
    
    logger.info(f"Dataset: {len(train_data)} train, {len(val_data)} val tasks")
    
    # 2. Create LitAgent
    lit_agent = LitCustomerSupportAgent(
        model_name="openai/gpt-5-mini",
        temperature=0.7,
        reward_fn=customer_support_reward,
    )
    
    # 3. Create OpenRouter client for APO
    client = AsyncOpenAI(
        base_url=training_settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    
    # 4. Create APO algorithm
    apo = agl.APO(
        async_openai_client=client,
        gradient_model=training_settings.apo_gradient_model,
        apply_edit_model=training_settings.apo_apply_edit_model,
        beam_width=2,  # Small for example
        beam_rounds=1,  # Single round for example
    )
    
    # 5. Create trainer with initial prompt
    trainer = agl.Trainer(
        algorithm=apo,
        initial_resources={
            "system_prompt": agl.PromptTemplate(
                template=SYSTEM_PROMPT,
                engine="f-string",
            )
        },
    )
    
    # 6. Run training
    logger.info("Starting APO training...")
    await trainer.fit_async(
        lit_agent,
        train_dataset=train_data.to_list(),
        val_dataset=val_data.to_list(),
    )
    
    # 7. Get optimized prompt
    best_resources = trainer.algorithm.get_best_resources()
    best_prompt = best_resources.get("system_prompt")
    
    if isinstance(best_prompt, agl.PromptTemplate):
        optimized = best_prompt.template
    else:
        optimized = str(best_prompt)
    
    logger.info(f"Optimized prompt (first 200 chars): {optimized[:200]}...")
    
    return optimized


# =============================================================================
# Advanced Training Example
# =============================================================================

async def advanced_training_example():
    """Advanced example with custom reward and more configuration.
    
    This shows:
    - Custom weighted reward function
    - More APO rounds
    - Using a store for persistence
    """
    logger.info("=== Advanced APO Training Example ===")
    
    training_settings = get_training_settings()
    
    # 1. Create custom weighted reward
    weighted_reward = create_weighted_reward({
        "confidence": 0.3,
        "escalation": 0.2,
        "length": 0.2,
        "actions": 0.15,
        "sentiment": 0.15,
    })
    
    # 2. Create larger dataset
    dataset = CustomerSupportDataset(TRAINING_TASKS * 2, name="advanced_train")
    train_data, val_data = create_train_val_split(dataset, val_ratio=0.2, seed=42)
    
    logger.info(f"Dataset: {len(train_data)} train, {len(val_data)} val tasks")
    
    # 3. Create LitAgent with custom reward
    lit_agent = LitCustomerSupportAgent(
        model_name="openai/gpt-5-mini",
        temperature=0.7,
        reward_fn=weighted_reward,
        include_langfuse=True,  # Enable Langfuse for observability
    )
    
    # 4. Create OpenRouter client
    client = AsyncOpenAI(
        base_url=training_settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    
    # 5. Create APO with more aggressive settings
    apo = agl.APO(
        async_openai_client=client,
        gradient_model=training_settings.apo_gradient_model,
        apply_edit_model=training_settings.apo_apply_edit_model,
        beam_width=4,
        beam_rounds=3,
        branch_factor=4,
        val_batch_size=8,
        diversity_temperature=1.2,  # More diverse prompts
    )
    
    # 6. Create trainer
    trainer = agl.Trainer(
        algorithm=apo,
        initial_resources={
            "system_prompt": agl.PromptTemplate(
                template=SYSTEM_PROMPT,
                engine="f-string",
            )
        },
        n_runners=2,  # Parallel runners
    )
    
    # 7. Run training with progress tracking
    logger.info("Starting advanced APO training...")
    
    async def on_round_complete(round_num: int, best_score: float):
        logger.info(f"Round {round_num} complete. Best score: {best_score:.3f}")
    
    await trainer.fit_async(
        lit_agent,
        train_dataset=train_data.to_list(),
        val_dataset=val_data.to_list(),
    )
    
    # 8. Get results
    best_resources = trainer.algorithm.get_best_resources()
    best_prompt = best_resources.get("system_prompt")
    
    if isinstance(best_prompt, agl.PromptTemplate):
        optimized = best_prompt.template
    else:
        optimized = str(best_prompt)
    
    logger.info("Training complete!")
    logger.info(f"Optimized prompt:\n{optimized}")
    
    return optimized


# =============================================================================
# Evaluation Example
# =============================================================================

async def evaluate_prompt(prompt: str, tasks: list):
    """Evaluate a prompt on test tasks.
    
    Args:
        prompt: The system prompt to evaluate
        tasks: List of test tasks
    
    Returns:
        Average reward across all tasks
    """
    from app.infrastructure.llm_provider import OpenRouterProvider
    from langchain.agents import create_agent
    from langchain_core.messages import HumanMessage
    
    from app.agents.structured_output.customer_support import CustomerSupportResponse
    from app.agents.tool.customer_support import CUSTOMER_SUPPORT_TOOLS
    
    provider = OpenRouterProvider()
    llm = provider.get_llm(model_name="openai/gpt-5-mini", temperature=0.7)
    
    agent = create_agent(
        model=llm,
        system_prompt=prompt,
        tools=CUSTOMER_SUPPORT_TOOLS,
        response_format=CustomerSupportResponse,
    )
    
    rewards = []
    
    for task in tasks:
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
            logger.warning(f"Task failed: {e}")
            rewards.append(0.0)
    
    avg_reward = sum(rewards) / len(rewards) if rewards else 0.0
    logger.info(f"Evaluation: {len(rewards)} tasks, avg reward: {avg_reward:.3f}")
    
    return avg_reward


# =============================================================================
# Main
# =============================================================================

async def main():
    """Run training examples."""
    logger.info("Agent Lightning Training Examples")
    logger.info("=" * 50)
    
    # Basic example (quick)
    logger.info("\n[1/3] Running basic training example...")
    try:
        optimized_prompt = await basic_training_example()
        logger.info("Basic example completed!")
    except Exception as e:
        logger.error(f"Basic example failed: {e}")
        return
    
    # Evaluate the optimized prompt
    logger.info("\n[2/3] Evaluating optimized prompt...")
    test_tasks = [t.to_dict() for t in TRAINING_TASKS[:5]]
    
    try:
        # Evaluate original
        original_score = await evaluate_prompt(SYSTEM_PROMPT, test_tasks)
        logger.info(f"Original prompt score: {original_score:.3f}")
        
        # Evaluate optimized
        optimized_score = await evaluate_prompt(optimized_prompt, test_tasks)
        logger.info(f"Optimized prompt score: {optimized_score:.3f}")
        
        improvement = ((optimized_score - original_score) / original_score) * 100
        logger.info(f"Improvement: {improvement:+.1f}%")
        
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
    
    # Advanced example (optional, longer)
    logger.info("\n[3/3] Advanced example (skipped in quick demo)")
    logger.info("Run advanced_training_example() separately for full training")


if __name__ == "__main__":
    asyncio.run(main())
