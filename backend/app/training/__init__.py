"""Agent Lightning training integration module.

This module provides integration with Microsoft's agent-lightning framework
to enable:
- APO (Automatic Prompt Optimization) via textual gradients
- VERL (Reinforcement Learning) with PPO for local model fine-tuning
- SFT (Supervised Fine-tuning) via Unsloth integration
"""

from app.training.config import TrainingSettings, get_training_settings
from app.training.datasets import (
    CustomerSupportDataset,
    CustomerSupportTask,
    TaskDataset,
    create_train_val_split,
    get_example_dataset,
    load_dataset_from_jsonl,
    load_dataset_from_list,
)
from app.training.litagent import LitCustomerSupportAgent, LitLangChainAgent
from app.training.rewards import (
    composite_reward,
    confidence_reward,
    create_weighted_reward,
    customer_support_reward,
    escalation_penalty_reward,
    response_length_reward,
    sentiment_match_reward,
    suggested_actions_reward,
)

__all__ = [
    # Config
    "TrainingSettings",
    "get_training_settings",
    # LitAgent wrappers
    "LitLangChainAgent",
    "LitCustomerSupportAgent",
    # Datasets
    "TaskDataset",
    "CustomerSupportDataset",
    "CustomerSupportTask",
    "load_dataset_from_jsonl",
    "load_dataset_from_list",
    "create_train_val_split",
    "get_example_dataset",
    # Rewards
    "customer_support_reward",
    "composite_reward",
    "confidence_reward",
    "escalation_penalty_reward",
    "sentiment_match_reward",
    "response_length_reward",
    "suggested_actions_reward",
    "create_weighted_reward",
]
