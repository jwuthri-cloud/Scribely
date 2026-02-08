"""Training configuration settings for agent-lightning integration."""

from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TrainingSettings(BaseSettings):
    """Settings for agent-lightning training algorithms."""

    model_config = SettingsConfigDict(
        env_prefix="TRAINING_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # APO (Automatic Prompt Optimization) settings
    apo_enabled: bool = Field(
        default=True,
        description="Enable APO training algorithm"
    )
    apo_gradient_model: str = Field(
        default="openai/gpt-5-mini",
        description="Model for computing textual gradients in APO"
    )
    apo_apply_edit_model: str = Field(
        default="openai/gpt-5-mini",
        description="Model for applying edits based on gradients"
    )
    apo_beam_width: int = Field(
        default=4,
        ge=1,
        description="Number of prompts to keep in beam search"
    )
    apo_beam_rounds: int = Field(
        default=3,
        ge=1,
        description="Number of beam search optimization rounds"
    )
    apo_branch_factor: int = Field(
        default=4,
        ge=1,
        description="Number of new prompts to generate per parent"
    )
    apo_gradient_batch_size: int = Field(
        default=4,
        ge=1,
        description="Number of rollouts to sample for gradient computation"
    )
    apo_val_batch_size: int = Field(
        default=16,
        ge=1,
        description="Number of validation examples per batch"
    )
    apo_diversity_temperature: float = Field(
        default=1.0,
        ge=0.0,
        le=2.0,
        description="Temperature for diversity in gradient generation"
    )
    apo_rollout_batch_timeout: float = Field(
        default=3600.0,
        ge=60.0,
        description="Timeout in seconds for rollout batches"
    )

    # VERL (Reinforcement Learning) settings
    verl_enabled: bool = Field(
        default=False,
        description="Enable VERL training (requires GPU)"
    )
    verl_model_path: str = Field(
        default="",
        description="Path to local model for VERL training"
    )
    verl_use_lora: bool = Field(
        default=True,
        description="Use LoRA for efficient fine-tuning"
    )
    verl_learning_rate: float = Field(
        default=1e-5,
        gt=0.0,
        description="Learning rate for VERL training"
    )
    verl_batch_size: int = Field(
        default=4,
        ge=1,
        description="Batch size for VERL training"
    )
    verl_epochs: int = Field(
        default=1,
        ge=1,
        description="Number of epochs for VERL training"
    )

    # SFT (Supervised Fine-Tuning) settings
    sft_enabled: bool = Field(
        default=False,
        description="Enable SFT training via Unsloth"
    )
    sft_model_path: str = Field(
        default="",
        description="Path to model for SFT"
    )
    sft_learning_rate: float = Field(
        default=2e-5,
        gt=0.0,
        description="Learning rate for SFT"
    )
    sft_batch_size: int = Field(
        default=4,
        ge=1,
        description="Batch size for SFT"
    )
    sft_epochs: int = Field(
        default=3,
        ge=1,
        description="Number of epochs for SFT"
    )

    # Store settings
    store_type: Literal["memory", "sqlite", "mongodb"] = Field(
        default="memory",
        description="Type of store for training data"
    )
    store_path: str = Field(
        default="training_store.db",
        description="Path to SQLite store (if using sqlite)"
    )
    store_mongodb_uri: str = Field(
        default="",
        description="MongoDB connection URI (if using mongodb)"
    )

    # Runner settings
    n_runners: int = Field(
        default=1,
        ge=1,
        description="Number of parallel runners for training"
    )
    max_rollouts: Optional[int] = Field(
        default=None,
        description="Maximum rollouts per runner (None for unlimited)"
    )

    # Tracer settings
    tracer_enabled: bool = Field(
        default=True,
        description="Enable tracing during training"
    )

    # OpenRouter settings (for APO)
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        description="OpenRouter API base URL"
    )


# Global settings instance
_training_settings: Optional[TrainingSettings] = None


def get_training_settings() -> TrainingSettings:
    """Get training settings singleton."""
    global _training_settings
    if _training_settings is None:
        _training_settings = TrainingSettings()
    return _training_settings
