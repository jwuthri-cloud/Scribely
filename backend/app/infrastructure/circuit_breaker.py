"""
Circuit breaker pattern for LLM API calls.

Prevents cascading failures by temporarily blocking requests when
the failure rate exceeds a threshold. Automatically recovers after
a cooldown period.

States:
- CLOSED: Normal operation, requests pass through
- OPEN: Failures exceeded threshold, requests are blocked
- HALF_OPEN: Testing if service recovered, limited requests allowed
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, TypeVar

from app.utils.logging import get_logger

logger = get_logger("circuit_breaker")

T = TypeVar("T")


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""

    # Number of failures before opening circuit
    failure_threshold: int = 5

    # Number of successes in half-open state before closing
    success_threshold: int = 2

    # Time in seconds before attempting recovery (half-open)
    timeout: float = 30.0

    # Time window in seconds for counting failures
    failure_window: float = 60.0

    # Exceptions that should trigger the circuit breaker
    # If None, all exceptions trigger it
    expected_exceptions: Optional[tuple] = None

    # Exceptions that should NOT trigger the circuit breaker
    excluded_exceptions: Optional[tuple] = None


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker monitoring."""

    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    opened_at: Optional[float] = None
    total_failures: int = 0
    total_successes: int = 0
    total_rejected: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert stats to dictionary for monitoring."""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time,
            "last_success_time": self.last_success_time,
            "opened_at": self.opened_at,
            "total_failures": self.total_failures,
            "total_successes": self.total_successes,
            "total_rejected": self.total_rejected,
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open and rejecting requests."""

    def __init__(self, name: str, retry_after: float):
        self.name = name
        self.retry_after = retry_after
        super().__init__(
            f"Circuit breaker '{name}' is open. Retry after {retry_after:.1f} seconds."
        )


class CircuitBreaker:
    """
    Circuit breaker implementation for protecting external service calls.

    Usage:
        # Create circuit breaker
        cb = CircuitBreaker(
            name="openai",
            config=CircuitBreakerConfig(failure_threshold=5, timeout=30)
        )

        # Use as decorator
        @cb
        async def call_llm(prompt: str) -> str:
            return await llm.generate(prompt)

        # Or use directly
        try:
            result = await cb.call(llm.generate, prompt)
        except CircuitBreakerOpenError as e:
            # Handle circuit open
            return fallback_response()
    """

    def __init__(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None
    ):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._stats = CircuitBreakerStats()
        self._failure_times: List[float] = []
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._stats.state

    @property
    def stats(self) -> CircuitBreakerStats:
        """Get circuit breaker statistics."""
        return self._stats

    def _should_trigger(self, exception: Exception) -> bool:
        """Check if exception should trigger the circuit breaker."""
        # Check excluded exceptions first
        if self.config.excluded_exceptions:
            if isinstance(exception, self.config.excluded_exceptions):
                return False

        # Check expected exceptions
        if self.config.expected_exceptions:
            return isinstance(exception, self.config.expected_exceptions)

        # Default: all exceptions trigger
        return True

    def _clean_old_failures(self) -> None:
        """Remove failures outside the failure window."""
        current_time = time.time()
        cutoff = current_time - self.config.failure_window
        self._failure_times = [t for t in self._failure_times if t > cutoff]

    async def _check_state(self) -> None:
        """Check and update circuit state based on current conditions."""
        current_time = time.time()

        if self._stats.state == CircuitState.OPEN:
            # Check if timeout has passed
            if self._stats.opened_at:
                elapsed = current_time - self._stats.opened_at
                if elapsed >= self.config.timeout:
                    logger.info(
                        f"Circuit breaker '{self.name}' transitioning to HALF_OPEN "
                        f"after {elapsed:.1f}s timeout"
                    )
                    self._stats.state = CircuitState.HALF_OPEN
                    self._stats.success_count = 0

    async def _record_success(self) -> None:
        """Record a successful call."""
        async with self._lock:
            self._stats.success_count += 1
            self._stats.total_successes += 1
            self._stats.last_success_time = time.time()

            if self._stats.state == CircuitState.HALF_OPEN:
                if self._stats.success_count >= self.config.success_threshold:
                    logger.info(
                        f"Circuit breaker '{self.name}' closing after "
                        f"{self._stats.success_count} successes"
                    )
                    self._stats.state = CircuitState.CLOSED
                    self._stats.failure_count = 0
                    self._failure_times = []

    async def _record_failure(self, exception: Exception) -> None:
        """Record a failed call."""
        if not self._should_trigger(exception):
            return

        async with self._lock:
            current_time = time.time()
            self._failure_times.append(current_time)
            self._clean_old_failures()

            self._stats.failure_count = len(self._failure_times)
            self._stats.total_failures += 1
            self._stats.last_failure_time = current_time

            logger.warning(
                f"Circuit breaker '{self.name}' recorded failure: {exception}. "
                f"Failure count: {self._stats.failure_count}/{self.config.failure_threshold}"
            )

            # Check if we should open the circuit
            if self._stats.state == CircuitState.HALF_OPEN:
                # Any failure in half-open state reopens the circuit
                logger.warning(
                    f"Circuit breaker '{self.name}' reopening due to failure in HALF_OPEN state"
                )
                self._stats.state = CircuitState.OPEN
                self._stats.opened_at = current_time
                self._stats.success_count = 0

            elif self._stats.state == CircuitState.CLOSED:
                if self._stats.failure_count >= self.config.failure_threshold:
                    logger.warning(
                        f"Circuit breaker '{self.name}' opening after "
                        f"{self._stats.failure_count} failures"
                    )
                    self._stats.state = CircuitState.OPEN
                    self._stats.opened_at = current_time

    async def call(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute a function through the circuit breaker.

        Args:
            func: The function to execute (can be sync or async)
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function

        Returns:
            The function's return value

        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: Original exception if function fails
        """
        await self._check_state()

        # Check if circuit is open
        if self._stats.state == CircuitState.OPEN:
            self._stats.total_rejected += 1
            retry_after = self.config.timeout
            if self._stats.opened_at:
                elapsed = time.time() - self._stats.opened_at
                retry_after = max(0, self.config.timeout - elapsed)
            raise CircuitBreakerOpenError(self.name, retry_after)

        try:
            # Execute the function
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            await self._record_success()
            return result

        except Exception as e:
            await self._record_failure(e)
            raise

    def __call__(self, func: Callable[..., T]) -> Callable[..., T]:
        """Use circuit breaker as a decorator."""
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> T:
                return await self.call(func, *args, **kwargs)
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> T:
                return asyncio.get_event_loop().run_until_complete(
                    self.call(func, *args, **kwargs)
                )
            return sync_wrapper

    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state."""
        self._stats = CircuitBreakerStats()
        self._failure_times = []
        logger.info(f"Circuit breaker '{self.name}' manually reset")


# Registry of circuit breakers for monitoring
_circuit_breakers: Dict[str, CircuitBreaker] = {}


def get_circuit_breaker(
    name: str,
    config: Optional[CircuitBreakerConfig] = None
) -> CircuitBreaker:
    """
    Get or create a named circuit breaker.

    Uses singleton pattern so same circuit breaker is shared across the app.
    """
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name, config)
    return _circuit_breakers[name]


def get_all_circuit_breakers() -> Dict[str, CircuitBreaker]:
    """Get all registered circuit breakers for monitoring."""
    return _circuit_breakers.copy()


def get_circuit_breaker_stats() -> Dict[str, Dict[str, Any]]:
    """Get statistics for all circuit breakers."""
    return {
        name: cb.stats.to_dict()
        for name, cb in _circuit_breakers.items()
    }


# Pre-configured circuit breakers for common services
LLM_CIRCUIT_BREAKER_CONFIG = CircuitBreakerConfig(
    failure_threshold=5,
    success_threshold=2,
    timeout=30.0,
    failure_window=60.0,
    # Don't trigger on validation errors
    excluded_exceptions=(ValueError, TypeError),
)


def get_llm_circuit_breaker() -> CircuitBreaker:
    """Get the circuit breaker for LLM API calls."""
    return get_circuit_breaker("llm", LLM_CIRCUIT_BREAKER_CONFIG)


__all__ = [
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitBreakerOpenError",
    "CircuitBreakerStats",
    "CircuitState",
    "get_circuit_breaker",
    "get_llm_circuit_breaker",
    "get_all_circuit_breakers",
    "get_circuit_breaker_stats",
]
