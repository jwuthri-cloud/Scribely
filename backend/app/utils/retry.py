"""
Retry mechanisms with exponential backoff and circuit breaker patterns.
"""

import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
from typing import Any, Callable, Optional

from app.utils.exceptions import CacheError, DatabaseError, ExternalServiceError
from app.utils.logging import get_logger

logger = get_logger("retry")


class RetryStrategy(str, Enum):
    """Retry strategy types."""
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    FIBONACCI = "fibonacci"


@dataclass
class RetryConfig:
    """Retry configuration."""
    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    backoff_factor: float = 2.0
    jitter: bool = True
    retryable_exceptions: tuple = (
        ExternalServiceError,
        DatabaseError,
        CacheError,
        ConnectionError,
        TimeoutError,
        asyncio.TimeoutError,
    )
    stop_on_exceptions: tuple = ()


@dataclass
class CircuitBreakerState:
    """Circuit breaker state."""
    failures: int = 0
    last_failure_time: Optional[datetime] = None
    state: str = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    next_retry_time: Optional[datetime] = None


class RetryExhaustedError(Exception):
    """Raised when all retry attempts are exhausted."""

    def __init__(self, attempts: int, last_exception: Exception):
        self.attempts = attempts
        self.last_exception = last_exception
        super().__init__(f"Retry exhausted after {attempts} attempts: {last_exception}")


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open."""

    def __init__(self, retry_after: Optional[datetime] = None):
        self.retry_after = retry_after
        message = "Circuit breaker is open"
        if retry_after:
            message += f", retry after {retry_after}"
        super().__init__(message)


class RetryHandler:
    """Advanced retry handler with multiple strategies."""

    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for the given attempt."""
        if self.config.strategy == RetryStrategy.FIXED:
            delay = self.config.base_delay
        elif self.config.strategy == RetryStrategy.LINEAR:
            delay = self.config.base_delay * attempt
        elif self.config.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.config.base_delay * (self.config.backoff_factor ** (attempt - 1))
        elif self.config.strategy == RetryStrategy.FIBONACCI:
            delay = self.config.base_delay * self._fibonacci(attempt)
        else:
            delay = self.config.base_delay

        # Apply max delay limit
        delay = min(delay, self.config.max_delay)

        # Add jitter to prevent thundering herd
        if self.config.jitter:
            jitter_range = delay * 0.1  # 10% jitter
            delay += random.uniform(-jitter_range, jitter_range)

        return max(0, delay)

    def _fibonacci(self, n: int) -> int:
        """Calculate fibonacci number."""
        if n <= 1:
            return n
        return self._fibonacci(n - 1) + self._fibonacci(n - 2)

    def should_retry(self, exception: Exception, attempt: int) -> bool:
        """Determine if should retry based on exception and attempt."""
        # Check if we've exceeded max attempts
        if attempt > self.config.max_attempts:
            return False

        # Check if exception should stop retries
        if isinstance(exception, self.config.stop_on_exceptions):
            return False

        # Check if exception is retryable
        if isinstance(exception, self.config.retryable_exceptions):
            return True

        # Check if the exception has retryable attribute
        if hasattr(exception, "retryable") and exception.retryable:
            return True

        return False

    async def execute_with_retry(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """Execute function with retry logic."""
        last_exception = None

        for attempt in range(1, self.config.max_attempts + 1):
            try:
                # Log retry attempt
                if attempt > 1:
                    logger.info(f"Retry attempt {attempt}/{self.config.max_attempts} for {func.__name__}")

                # Execute function
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)

                # Success - reset any tracking
                if attempt > 1:
                    logger.info(f"Function {func.__name__} succeeded on attempt {attempt}")

                return result

            except Exception as e:
                last_exception = e

                # Check if we should retry
                if not self.should_retry(e, attempt):
                    logger.error(f"Not retrying {func.__name__} due to non-retryable exception: {e}")
                    raise e

                # Check if this was the last attempt
                if attempt >= self.config.max_attempts:
                    logger.error(f"All retry attempts exhausted for {func.__name__}")
                    raise RetryExhaustedError(attempt, e)

                # Calculate delay and wait
                delay = self.calculate_delay(attempt)
                logger.warning(
                    f"Attempt {attempt} failed for {func.__name__}: {e}. "
                    f"Retrying in {delay:.2f}s"
                )

                await asyncio.sleep(delay)

        # This should never be reached, but just in case
        raise RetryExhaustedError(self.config.max_attempts, last_exception)


class CircuitBreaker:
    """Circuit breaker implementation."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: tuple = (Exception,)
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.state = CircuitBreakerState()

    def _should_attempt_reset(self) -> bool:
        """Check if circuit breaker should attempt reset."""
        return (
            self.state.state == "OPEN" and
            self.state.next_retry_time and
            datetime.utcnow() >= self.state.next_retry_time
        )

    def _on_success(self):
        """Handle successful execution."""
        if self.state.state == "HALF_OPEN":
            logger.info("Circuit breaker reset to CLOSED after successful call")
            self.state.state = "CLOSED"
            self.state.failures = 0
            self.state.last_failure_time = None
            self.state.next_retry_time = None

    def _on_failure(self, exception: Exception):
        """Handle failed execution."""
        if isinstance(exception, self.expected_exception):
            self.state.failures += 1
            self.state.last_failure_time = datetime.utcnow()

            if self.state.failures >= self.failure_threshold:
                if self.state.state != "OPEN":
                    logger.warning(
                        f"Circuit breaker opened after {self.state.failures} failures"
                    )
                    self.state.state = "OPEN"
                    self.state.next_retry_time = datetime.utcnow() + timedelta(
                        seconds=self.recovery_timeout
                    )

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection."""
        # Check if we should attempt reset
        if self._should_attempt_reset():
            logger.info("Circuit breaker attempting reset (HALF_OPEN)")
            self.state.state = "HALF_OPEN"

        # Check if circuit breaker is open
        if self.state.state == "OPEN":
            raise CircuitBreakerOpenError(self.state.next_retry_time)

        try:
            # Execute function
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            # Success
            self._on_success()
            return result

        except Exception as e:
            self._on_failure(e)
            raise e

    def reset(self):
        """Manually reset circuit breaker."""
        logger.info("Circuit breaker manually reset")
        self.state.state = "CLOSED"
        self.state.failures = 0
        self.state.last_failure_time = None
        self.state.next_retry_time = None

    def get_state(self) -> dict:
        """Get circuit breaker state information."""
        return {
            "state": self.state.state,
            "failures": self.state.failures,
            "failure_threshold": self.failure_threshold,
            "last_failure_time": self.state.last_failure_time.isoformat() if self.state.last_failure_time else None,
            "next_retry_time": self.state.next_retry_time.isoformat() if self.state.next_retry_time else None,
            "recovery_timeout": self.recovery_timeout
        }


# Decorator functions

def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL,
    retryable_exceptions: Optional[tuple] = None
):
    """Decorator for adding retry logic to functions."""
    def decorator(func):
        config = RetryConfig(
            max_attempts=max_attempts,
            base_delay=base_delay,
            max_delay=max_delay,
            strategy=strategy,
            retryable_exceptions=retryable_exceptions or RetryConfig().retryable_exceptions
        )

        retry_handler = RetryHandler(config)

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            return await retry_handler.execute_with_retry(func, *args, **kwargs)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            return asyncio.run(retry_handler.execute_with_retry(func, *args, **kwargs))

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout: int = 60,
    expected_exception: tuple = (Exception,)
):
    """Decorator for adding circuit breaker protection to functions."""
    breaker = CircuitBreaker(failure_threshold, recovery_timeout, expected_exception)

    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            return await breaker.call(func, *args, **kwargs)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            return asyncio.run(breaker.call(func, *args, **kwargs))

        # Attach circuit breaker methods to the function
        wrapper = async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
        wrapper.circuit_breaker = breaker

        return wrapper

    return decorator


def resilient(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    failure_threshold: int = 5,
    recovery_timeout: int = 60
):
    """Decorator combining retry and circuit breaker patterns."""
    def decorator(func):
        # Apply circuit breaker first, then retry
        func_with_breaker = circuit_breaker(
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout
        )(func)

        func_with_retry = retry(
            max_attempts=max_attempts,
            base_delay=base_delay
        )(func_with_breaker)

        # Attach circuit breaker reference
        func_with_retry.circuit_breaker = func_with_breaker.circuit_breaker

        return func_with_retry

    return decorator


# Global circuit breaker registry
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str) -> Optional[CircuitBreaker]:
    """Get circuit breaker by name."""
    return _circuit_breakers.get(name)


def register_circuit_breaker(name: str, breaker: CircuitBreaker):
    """Register a circuit breaker globally."""
    _circuit_breakers[name] = breaker
    logger.info(f"Registered circuit breaker: {name}")


def get_all_circuit_breakers() -> dict[str, dict]:
    """Get state of all registered circuit breakers."""
    return {
        name: breaker.get_state()
        for name, breaker in _circuit_breakers.items()
    }
