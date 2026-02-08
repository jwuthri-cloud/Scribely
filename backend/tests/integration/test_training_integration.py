"""
Integration tests for agent-lightning training module.

These tests verify that the training infrastructure correctly integrates
with the existing CustomerSupportAgent and can be used for APO, VERL, and SFT.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any, Dict

from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.training.config import TrainingSettings, get_training_settings
from app.training.datasets.base import (
    CustomerSupportDataset,
    CustomerSupportTask,
    TaskDataset,
    create_train_val_split,
    get_example_dataset,
    load_dataset_from_list,
)
from app.training.litagent.base import LitLangChainAgent
from app.training.litagent.customer_support import (
    LitCustomerSupportAgent,
    create_lit_customer_support_agent,
)
from app.training.rewards.base import (
    confidence_reward,
    customer_support_reward,
    create_weighted_reward,
    escalation_penalty_reward,
    response_length_reward,
    sentiment_match_reward,
    suggested_actions_reward,
)


# =============================================================================
# Training Configuration Tests
# =============================================================================

class TestTrainingSettings:
    """Tests for TrainingSettings configuration."""
    
    def test_default_settings(self):
        """Test that default settings are valid."""
        settings = TrainingSettings()
        
        # APO defaults
        assert settings.apo_enabled is True
        assert settings.apo_beam_width >= 1
        assert settings.apo_beam_rounds >= 1
        assert settings.apo_gradient_model
        
        # VERL defaults
        assert settings.verl_enabled is False  # Requires GPU
        assert settings.verl_use_lora is True
        assert settings.verl_learning_rate > 0
        
        # SFT defaults
        assert settings.sft_enabled is False  # Requires data
        assert settings.sft_learning_rate > 0
        
        # Store defaults
        assert settings.store_type in ["memory", "sqlite", "mongodb"]
    
    def test_settings_singleton(self):
        """Test that get_training_settings returns singleton."""
        settings1 = get_training_settings()
        settings2 = get_training_settings()
        
        # Should be same instance
        assert settings1 is settings2


# =============================================================================
# Dataset Tests
# =============================================================================

class TestDatasets:
    """Tests for training datasets."""
    
    def test_task_dataset_basic(self):
        """Test basic TaskDataset operations."""
        items = [{"message": f"Task {i}"} for i in range(5)]
        dataset = TaskDataset(items, name="test")
        
        assert len(dataset) == 5
        assert dataset[0] == {"message": "Task 0"}
        assert "test(n=5)" in repr(dataset)
    
    def test_task_dataset_shuffle(self):
        """Test dataset shuffling with seed."""
        items = [{"message": f"Task {i}"} for i in range(10)]
        dataset = TaskDataset(items)
        
        shuffled1 = dataset.shuffle(seed=42)
        shuffled2 = dataset.shuffle(seed=42)
        
        # Same seed should produce same order
        assert shuffled1.to_list() == shuffled2.to_list()
        # Should be different from original (with high probability)
        assert shuffled1.to_list() != items
    
    def test_task_dataset_sample(self):
        """Test dataset sampling."""
        items = [{"message": f"Task {i}"} for i in range(20)]
        dataset = TaskDataset(items)
        
        sampled = dataset.sample(5, seed=42)
        
        assert len(sampled) == 5
        assert all(item in items for item in sampled.to_list())
    
    def test_customer_support_task(self):
        """Test CustomerSupportTask model."""
        task = CustomerSupportTask(
            message="Test message",
            expected_sentiment="positive",
            expected_escalation=False,
            metadata={"key": "value"},
        )
        
        task_dict = task.to_dict()
        
        assert task_dict["message"] == "Test message"
        assert task_dict["key"] == "value"
    
    def test_customer_support_dataset(self):
        """Test CustomerSupportDataset."""
        tasks = [
            CustomerSupportTask(message="Task 1"),
            CustomerSupportTask(message="Task 2"),
            {"message": "Task 3"},  # Also accepts dicts
        ]
        
        dataset = CustomerSupportDataset(tasks)
        
        assert len(dataset) == 3
        assert dataset[0]["message"] == "Task 1"
        assert dataset[2]["message"] == "Task 3"
    
    def test_train_val_split(self):
        """Test train/val split."""
        items = [{"message": f"Task {i}"} for i in range(100)]
        dataset = TaskDataset(items)
        
        train, val = create_train_val_split(dataset, val_ratio=0.2, seed=42)
        
        assert len(train) == 80
        assert len(val) == 20
        assert len(train) + len(val) == len(dataset)
    
    def test_load_dataset_from_list(self):
        """Test loading dataset from mixed list."""
        items = [
            "String message",
            {"message": "Dict message"},
        ]
        
        dataset = load_dataset_from_list(items)
        
        assert len(dataset) == 2
        assert dataset[0]["message"] == "String message"
        assert dataset[1]["message"] == "Dict message"
    
    def test_example_dataset(self):
        """Test example dataset helper."""
        dataset = get_example_dataset()
        
        assert len(dataset) > 0
        assert all("message" in item for item in dataset)


# =============================================================================
# Reward Function Tests
# =============================================================================

class TestRewardFunctions:
    """Tests for reward functions."""
    
    @pytest.fixture
    def sample_response(self):
        """Create a sample response for testing."""
        return CustomerSupportResponse(
            response="Thank you for reaching out. I can help you with that.",
            sentiment="neutral",
            requires_escalation=False,
            confidence=0.85,
            suggested_actions=["check_faq", "contact_support"],
        )
    
    @pytest.fixture
    def sample_task(self):
        """Create a sample task for testing."""
        return {
            "message": "How do I reset my password?",
            "expected_sentiment": "neutral",
        }
    
    def test_confidence_reward(self, sample_task, sample_response):
        """Test confidence reward calculation."""
        reward = confidence_reward(sample_task, sample_response)
        
        # High confidence (0.85) should get high reward
        assert reward > 0.2
        assert reward <= 0.3
    
    def test_confidence_reward_low(self, sample_task):
        """Test confidence reward with low confidence."""
        response = CustomerSupportResponse(
            response="I'm not sure about that.",
            sentiment="neutral",
            requires_escalation=False,
            confidence=0.3,
        )
        
        reward = confidence_reward(sample_task, response)
        
        # Low confidence should get lower reward
        assert reward < 0.2
    
    def test_escalation_penalty(self, sample_task, sample_response):
        """Test escalation penalty reward."""
        # No escalation = no penalty
        reward = escalation_penalty_reward(sample_task, sample_response)
        assert reward == 0.0
        
        # Escalation without reason = penalty
        response_escalate = CustomerSupportResponse(
            response="I need to escalate this.",
            sentiment="negative",
            requires_escalation=True,
            confidence=0.8,
        )
        
        reward_escalate = escalation_penalty_reward(sample_task, response_escalate)
        assert reward_escalate < 0
    
    def test_sentiment_match_reward(self, sample_task, sample_response):
        """Test sentiment matching reward."""
        reward = sentiment_match_reward(sample_task, sample_response)
        
        # Matching sentiment should get bonus
        assert reward == 0.2
    
    def test_sentiment_match_no_expected(self, sample_response):
        """Test sentiment reward when no expected sentiment."""
        task = {"message": "Test"}  # No expected_sentiment
        
        reward = sentiment_match_reward(task, sample_response)
        
        # No expected sentiment = no bonus
        assert reward == 0.0
    
    def test_response_length_reward(self, sample_task, sample_response):
        """Test response length reward."""
        reward = response_length_reward(sample_task, sample_response)
        
        # Response is 55 chars, should be within acceptable range
        assert reward > 0.0
    
    def test_suggested_actions_reward(self, sample_task, sample_response):
        """Test suggested actions reward."""
        reward = suggested_actions_reward(sample_task, sample_response)
        
        # 2 actions = 2 * 0.05 = 0.1
        assert reward == 0.1
    
    def test_customer_support_reward_composite(self, sample_task, sample_response):
        """Test composite customer support reward."""
        reward = customer_support_reward(sample_task, sample_response)
        
        # Should be between 0 and 1
        assert 0.0 <= reward <= 1.0
        # A good response should get decent reward
        assert reward > 0.5
    
    def test_create_weighted_reward(self, sample_task, sample_response):
        """Test custom weighted reward creation."""
        weighted_fn = create_weighted_reward({
            "confidence": 0.5,
            "escalation": 0.3,
            "length": 0.2,
        })
        
        reward = weighted_fn(sample_task, sample_response)
        
        assert 0.0 <= reward <= 1.0


# =============================================================================
# LitAgent Tests
# =============================================================================

class TestLitAgents:
    """Tests for LitAgent wrappers."""
    
    def test_lit_customer_support_agent_creation(self):
        """Test LitCustomerSupportAgent can be created."""
        agent = LitCustomerSupportAgent(
            model_name="openai/gpt-5-mini",
            temperature=0.7,
        )
        
        assert agent is not None
        assert agent._model_name == "openai/gpt-5-mini"
        assert agent._temperature == 0.7
    
    def test_lit_agent_factory_function(self):
        """Test factory function creates agent correctly."""
        agent = create_lit_customer_support_agent(
            model_name="openai/gpt-5",
            temperature=0.5,
        )
        
        assert isinstance(agent, LitCustomerSupportAgent)
        assert agent._model_name == "openai/gpt-5"
    
    def test_lit_agent_custom_reward(self):
        """Test LitAgent with custom reward function."""
        custom_reward = lambda task, result: 0.5  # Simple constant reward
        
        agent = LitCustomerSupportAgent(
            reward_fn=custom_reward,
        )
        
        # Verify custom reward is used
        task = {"message": "test"}
        result = CustomerSupportResponse(
            response="test",
            sentiment="neutral",
            requires_escalation=False,
            confidence=0.8,
        )
        
        reward = agent.compute_reward(task, result)
        assert reward == 0.5
    
    def test_lit_agent_default_reward(self):
        """Test LitAgent with default reward function."""
        agent = LitCustomerSupportAgent()
        
        task = {"message": "test"}
        result = CustomerSupportResponse(
            response="This is a helpful response to your question.",
            sentiment="neutral",
            requires_escalation=False,
            confidence=0.9,
            suggested_actions=["action1"],
        )
        
        reward = agent.compute_reward(task, result)
        
        # Should use customer_support_reward
        assert 0.0 <= reward <= 1.0


# =============================================================================
# Integration Tests with Mocked Agent
# =============================================================================

class TestTrainingIntegration:
    """Integration tests for the training pipeline."""
    
    @pytest.fixture
    def mock_llm_provider(self):
        """Create a mock LLM provider."""
        provider = MagicMock()
        provider.get_llm.return_value = MagicMock()
        return provider
    
    @pytest.fixture
    def mock_agent_response(self):
        """Create a mock agent response."""
        return {
            "structured_response": CustomerSupportResponse(
                response="I can help you with that.",
                sentiment="neutral",
                requires_escalation=False,
                confidence=0.85,
            )
        }
    
    @pytest.mark.asyncio
    async def test_lit_agent_create_agent(self, mock_llm_provider):
        """Test that create_agent creates a working agent."""
        agent = LitCustomerSupportAgent(
            llm_provider=mock_llm_provider,
            model_name="test-model",
        )
        
        # Mock the create_agent import
        with patch("app.training.litagent.customer_support.create_agent") as mock_create:
            mock_create.return_value = MagicMock()
            
            wrapped = agent.create_agent(system_prompt="Test prompt")
            
            assert wrapped is not None
            mock_create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_lit_agent_invoke(self, mock_llm_provider, mock_agent_response):
        """Test that invoke_agent correctly processes responses."""
        agent = LitCustomerSupportAgent(
            llm_provider=mock_llm_provider,
        )
        
        # Create mock agent that returns expected response
        mock_wrapped = MagicMock()
        mock_wrapped.ainvoke = AsyncMock(return_value=mock_agent_response)
        
        task = {"message": "Test inquiry"}
        
        result = await agent.invoke_agent(mock_wrapped, task)
        
        assert isinstance(result, CustomerSupportResponse)
        assert result.response == "I can help you with that."
        assert result.confidence == 0.85
    
    def test_full_training_pipeline_configuration(self):
        """Test that full training pipeline can be configured."""
        settings = get_training_settings()
        
        # Should be able to create all components
        agent = LitCustomerSupportAgent()
        dataset = get_example_dataset()
        train_data, val_data = create_train_val_split(dataset, val_ratio=0.2)
        
        assert len(train_data) > 0
        assert len(val_data) > 0
        assert agent is not None


# =============================================================================
# CLI Command Tests
# =============================================================================

class TestTrainingCLI:
    """Tests for training CLI commands."""
    
    def test_training_command_import(self):
        """Test that training commands can be imported."""
        from app.cli.commands.training import training, apo, verl, sft, status, evaluate
        
        assert training is not None
        assert apo is not None
        assert verl is not None
        assert sft is not None
        assert status is not None
        assert evaluate is not None
    
    def test_training_command_group(self):
        """Test training command group structure."""
        from app.cli.commands.training import training
        
        # Should be a Click group
        assert hasattr(training, "commands") or hasattr(training, "add_command")


# =============================================================================
# Example Module Tests
# =============================================================================

class TestExamples:
    """Tests for training examples."""
    
    def test_training_example_imports(self):
        """Test that training_example.py can be imported."""
        from app.examples import training_example
        
        assert hasattr(training_example, "basic_training_example")
        assert hasattr(training_example, "custom_reward_fn")
    
    def test_apo_example_imports(self):
        """Test that apo_example.py can be imported."""
        from app.examples import apo_example
        
        assert hasattr(apo_example, "run_apo_training")
        assert hasattr(apo_example, "quick_apo_demo")
    
    def test_verl_example_imports(self):
        """Test that verl_example.py can be imported."""
        from app.examples import verl_example
        
        assert hasattr(verl_example, "run_verl_training")
        assert hasattr(verl_example, "check_gpu_availability")
    
    def test_sft_example_imports(self):
        """Test that sft_example.py can be imported."""
        from app.examples import sft_example
        
        assert hasattr(sft_example, "run_sft_training")
        assert hasattr(sft_example, "create_sft_dataset")
