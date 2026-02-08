"""Base reward functions for agent training.

This module provides reward functions for evaluating agent responses
during training. These functions are used by LitAgents to compute
rewards for agent-lightning's optimization algorithms.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from app.agents.structured_output.customer_support import CustomerSupportResponse
from app.utils.logging import get_logger

logger = get_logger("training_rewards")


def confidence_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    threshold: float = 0.7,
    high_bonus: float = 0.3,
    low_penalty: float = 0.1,
) -> float:
    """Reward based on response confidence.
    
    Higher confidence (above threshold) is rewarded, lower confidence
    receives a smaller reward.
    
    Args:
        task: The original task (unused, for interface compatibility).
        result: The agent's response.
        threshold: Confidence threshold for bonus reward.
        high_bonus: Reward for confidence above threshold.
        low_penalty: Penalty multiplier for low confidence.
    
    Returns:
        Reward value between 0.0 and high_bonus.
    """
    confidence = result.confidence
    
    if confidence >= threshold:
        # Scale reward based on how far above threshold
        excess = (confidence - threshold) / (1.0 - threshold)
        return high_bonus * (0.5 + 0.5 * excess)
    else:
        # Scale down for lower confidence
        ratio = confidence / threshold
        return high_bonus * ratio * (1.0 - low_penalty)


def escalation_penalty_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    penalty: float = 0.2,
    justified_penalty: float = 0.05,
) -> float:
    """Reward that penalizes unnecessary escalations.
    
    Escalations without clear justification receive a larger penalty.
    
    Args:
        task: The original task.
        result: The agent's response.
        penalty: Penalty for unjustified escalation.
        justified_penalty: Smaller penalty for justified escalation.
    
    Returns:
        Reward value (negative for escalations).
    """
    if not result.requires_escalation:
        return 0.0
    
    # Check if escalation has justification
    if result.escalation_reason and len(result.escalation_reason) > 10:
        return -justified_penalty
    else:
        return -penalty


def sentiment_match_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    match_bonus: float = 0.2,
) -> float:
    """Reward for matching expected sentiment (if provided).
    
    Args:
        task: Task dict potentially containing "expected_sentiment".
        result: The agent's response.
        match_bonus: Bonus for correct sentiment classification.
    
    Returns:
        match_bonus if sentiment matches, 0.0 otherwise.
    """
    expected = task.get("expected_sentiment")
    if expected is None:
        return 0.0
    
    if result.sentiment.lower() == expected.lower():
        return match_bonus
    
    return 0.0


def response_length_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    min_length: int = 50,
    max_length: int = 500,
    optimal_range: Tuple[int, int] = (100, 300),
) -> float:
    """Reward based on response length.
    
    Responses within optimal range get full reward. Too short or too long
    responses get reduced reward.
    
    Args:
        task: The original task (unused).
        result: The agent's response.
        min_length: Minimum acceptable length.
        max_length: Maximum acceptable length.
        optimal_range: Tuple of (min_optimal, max_optimal) lengths.
    
    Returns:
        Reward value between 0.0 and 0.2.
    """
    length = len(result.response)
    
    if length < min_length:
        return 0.0
    elif length > max_length:
        return 0.05  # Small reward for at least responding
    elif optimal_range[0] <= length <= optimal_range[1]:
        return 0.2
    else:
        # Interpolate based on distance from optimal
        if length < optimal_range[0]:
            ratio = (length - min_length) / (optimal_range[0] - min_length)
        else:
            ratio = (max_length - length) / (max_length - optimal_range[1])
        return 0.1 + 0.1 * ratio


def suggested_actions_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    action_bonus: float = 0.05,
    max_actions: int = 3,
) -> float:
    """Reward for providing helpful suggested actions.
    
    Args:
        task: The original task (unused).
        result: The agent's response.
        action_bonus: Bonus per suggested action.
        max_actions: Maximum actions to reward.
    
    Returns:
        Reward based on number of suggested actions.
    """
    n_actions = len(result.suggested_actions)
    if n_actions == 0:
        return 0.0
    
    return min(n_actions, max_actions) * action_bonus


def customer_support_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
) -> float:
    """Composite reward function for customer support responses.
    
    This function combines multiple reward signals to provide a
    comprehensive evaluation of agent responses:
    - Confidence score
    - Escalation appropriateness
    - Response length
    - Suggested actions
    - Sentiment matching (if expected_sentiment provided)
    
    Args:
        task: The original task/inquiry.
        result: The agent's CustomerSupportResponse.
    
    Returns:
        Total reward value, typically between 0.0 and 1.0.
    """
    total_reward = 0.0
    
    # Base reward for responding
    if result.response and len(result.response) > 20:
        total_reward += 0.3
    
    # Confidence reward (up to 0.3)
    total_reward += confidence_reward(task, result)
    
    # Escalation penalty (up to -0.2)
    total_reward += escalation_penalty_reward(task, result)
    
    # Response length reward (up to 0.2)
    total_reward += response_length_reward(task, result)
    
    # Suggested actions reward (up to 0.15)
    total_reward += suggested_actions_reward(task, result)
    
    # Sentiment matching (up to 0.2 if expected provided)
    total_reward += sentiment_match_reward(task, result)
    
    # Clamp to [0, 1]
    return max(0.0, min(1.0, total_reward))


def composite_reward(
    task: Dict[str, Any],
    result: CustomerSupportResponse,
    reward_fns: List[Callable[[Dict[str, Any], CustomerSupportResponse], float]],
    weights: Optional[List[float]] = None,
) -> float:
    """Combine multiple reward functions with optional weights.
    
    Args:
        task: The original task.
        result: The agent's response.
        reward_fns: List of reward functions to combine.
        weights: Optional weights for each function (normalized).
    
    Returns:
        Weighted sum of rewards.
    """
    if not reward_fns:
        return 0.0
    
    if weights is None:
        weights = [1.0] * len(reward_fns)
    
    # Normalize weights
    total_weight = sum(weights)
    if total_weight == 0:
        return 0.0
    
    weights = [w / total_weight for w in weights]
    
    total = 0.0
    for fn, weight in zip(reward_fns, weights):
        try:
            reward = fn(task, result)
            total += weight * reward
        except Exception as e:
            logger.warning(f"Reward function {fn.__name__} failed: {e}")
    
    return total


def create_weighted_reward(
    weights: Dict[str, float],
) -> Callable[[Dict[str, Any], CustomerSupportResponse], float]:
    """Create a custom weighted reward function.
    
    Available components:
    - "confidence": confidence_reward
    - "escalation": escalation_penalty_reward
    - "length": response_length_reward
    - "actions": suggested_actions_reward
    - "sentiment": sentiment_match_reward
    
    Args:
        weights: Dictionary mapping component names to weights.
    
    Returns:
        A reward function combining specified components.
    
    Example:
        ```python
        reward_fn = create_weighted_reward({
            "confidence": 0.4,
            "escalation": 0.2,
            "length": 0.2,
            "actions": 0.2,
        })
        
        reward = reward_fn(task, result)
        ```
    """
    component_map = {
        "confidence": confidence_reward,
        "escalation": escalation_penalty_reward,
        "length": response_length_reward,
        "actions": suggested_actions_reward,
        "sentiment": sentiment_match_reward,
    }
    
    fns = []
    weight_list = []
    
    for name, weight in weights.items():
        if name in component_map:
            fns.append(component_map[name])
            weight_list.append(weight)
        else:
            logger.warning(f"Unknown reward component: {name}")
    
    def weighted_reward(
        task: Dict[str, Any],
        result: CustomerSupportResponse,
    ) -> float:
        return composite_reward(task, result, fns, weight_list)
    
    return weighted_reward
