"""
Enhanced exception handling with context and tracing.
"""

import traceback
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import uuid4

from app.utils.logging import get_logger
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = get_logger("exceptions")


class ErrorSeverity(str, Enum):
    """Error severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(str, Enum):
    """Error categories for better classification."""
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RATE_LIMIT = "rate_limit"
    EXTERNAL_SERVICE = "external_service"
    DATABASE = "database"
    CACHE = "cache"
    NETWORK = "network"
    CONFIGURATION = "configuration"
    BUSINESS_LOGIC = "business_logic"
    SYSTEM = "system"
    UNKNOWN = "unknown"


class ErrorDetail(BaseModel):
    """Structured error detail."""
    field: Optional[str] = None
    message: str
    code: Optional[str] = None
    value: Optional[str] = None


class ErrorContext(BaseModel):
    """Error context information."""
    error_id: str
    timestamp: datetime
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    user_agent: Optional[str] = None
    client_ip: Optional[str] = None
    stack_trace: Optional[List[str]] = None
    additional_data: Dict[str, Any] = {}


class BaseAppException(Exception):
    """
    Enhanced base exception with context and structured error details.
    """

    def __init__(
        self,
        message: str = "An error occurred",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: Optional[str] = None,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        details: Optional[List[Union[ErrorDetail, Dict[str, Any]]]] = None,
        context: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
        retryable: bool = False
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or self.__class__.__name__
        self.category = category
        self.severity = severity
        self.retryable = retryable

        # Process details
        self.details: List[ErrorDetail] = []
        if details:
            for detail in details:
                if isinstance(detail, ErrorDetail):
                    self.details.append(detail)
                elif isinstance(detail, dict):
                    self.details.append(ErrorDetail(**detail))
                else:
                    self.details.append(ErrorDetail(message=str(detail)))

        # Error context
        self.context = ErrorContext(
            error_id=str(uuid4()),
            timestamp=datetime.utcnow(),
            additional_data=context or {}
        )

        # Original cause
        self.cause = cause
        if cause:
            self.context.stack_trace = traceback.format_exception(
                type(cause), cause, cause.__traceback__
            )
        else:
            # Capture current stack trace
            self.context.stack_trace = traceback.format_stack()[:-1]

        super().__init__(self.message)

    def add_detail(self, field: Optional[str], message: str, code: Optional[str] = None):
        """Add error detail."""
        self.details.append(ErrorDetail(field=field, message=message, code=code))

    def add_context(self, key: str, value: Any):
        """Add context information."""
        self.context.additional_data[key] = value

    def set_request_context(self, request: Request):
        """Set request context from FastAPI request."""
        self.context.request_id = getattr(request.state, "request_id", None)
        self.context.endpoint = request.url.path
        self.context.method = request.method
        self.context.user_agent = request.headers.get("user-agent")
        self.context.client_ip = self._get_client_ip(request)

        # Extract user context if available
        if hasattr(request.state, "user"):
            user = request.state.user
            self.context.user_id = getattr(user, "id", None)

        # Extract session context if available
        if hasattr(request.state, "session_id"):
            self.context.session_id = request.state.session_id

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request."""
        # Check forwarded headers
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

        return request.client.host if request.client else "unknown"

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary."""
        return {
            "error_id": self.context.error_id,
            "error_code": self.error_code,
            "category": self.category,
            "severity": self.severity,
            "message": self.message,
            "status_code": self.status_code,
            "retryable": self.retryable,
            "details": [detail.dict() for detail in self.details],
            "context": self.context.dict(exclude={"stack_trace"}),  # Exclude stack trace from public output
            "timestamp": self.context.timestamp.isoformat()
        }


# Specific Exception Classes

class ValidationError(BaseAppException):
    """Input validation error."""

    def __init__(self, message: str = "Validation error", field: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            category=ErrorCategory.VALIDATION,
            severity=ErrorSeverity.LOW,
            **kwargs
        )
        if field:
            self.add_detail(field, message, "VALIDATION_ERROR")


class NotFoundError(BaseAppException):
    """Resource not found error."""

    def __init__(self, message: str = "Resource not found", resource_type: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            category=ErrorCategory.NOT_FOUND,
            severity=ErrorSeverity.LOW,
            **kwargs
        )
        if resource_type:
            self.add_context("resource_type", resource_type)


class ConflictError(BaseAppException):
    """Resource conflict error."""

    def __init__(self, message: str = "Conflict", resource_id: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            category=ErrorCategory.CONFLICT,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )
        if resource_id:
            self.add_context("resource_id", resource_id)


class UnauthorizedError(BaseAppException):
    """Authentication required error."""

    def __init__(self, message: str = "Authentication required", **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            category=ErrorCategory.AUTHENTICATION,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )


class ForbiddenError(BaseAppException):
    """Access forbidden error."""

    def __init__(self, message: str = "Access forbidden", resource: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            category=ErrorCategory.AUTHORIZATION,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )
        if resource:
            self.add_context("resource", resource)


class RateLimitError(BaseAppException):
    """Rate limit exceeded error."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: Optional[int] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            category=ErrorCategory.RATE_LIMIT,
            severity=ErrorSeverity.MEDIUM,
            retryable=True,
            **kwargs
        )
        if retry_after:
            self.add_context("retry_after", retry_after)


class ExternalServiceError(BaseAppException):
    """External service error."""

    def __init__(self, message: str = "External service error", service: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            category=ErrorCategory.EXTERNAL_SERVICE,
            severity=ErrorSeverity.HIGH,
            retryable=True,
            **kwargs
        )
        if service:
            self.add_context("service", service)


class DatabaseError(BaseAppException):
    """Database operation error."""

    def __init__(self, message: str = "Database error", operation: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            category=ErrorCategory.DATABASE,
            severity=ErrorSeverity.HIGH,
            retryable=False,
            **kwargs
        )
        if operation:
            self.add_context("operation", operation)


class CacheError(BaseAppException):
    """Cache operation error."""

    def __init__(self, message: str = "Cache error", operation: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            category=ErrorCategory.CACHE,
            severity=ErrorSeverity.MEDIUM,
            retryable=True,
            **kwargs
        )
        if operation:
            self.add_context("operation", operation)


class ConfigurationError(BaseAppException):
    """Configuration error."""

    def __init__(self, message: str = "Configuration error", config_key: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            category=ErrorCategory.CONFIGURATION,
            severity=ErrorSeverity.CRITICAL,
            **kwargs
        )
        if config_key:
            self.add_context("config_key", config_key)


class BusinessLogicError(BaseAppException):
    """Business logic error."""

    def __init__(self, message: str, business_rule: Optional[str] = None, **kwargs):
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            category=ErrorCategory.BUSINESS_LOGIC,
            severity=ErrorSeverity.MEDIUM,
            **kwargs
        )
        if business_rule:
            self.add_context("business_rule", business_rule)


# Legacy aliases for backward compatibility
LLMError = ExternalServiceError
ServiceUnavailableError = ExternalServiceError
MessageQueueError = ExternalServiceError


# Error tracking and reporting

class ErrorTracker:
    """Track and aggregate errors for monitoring."""

    def __init__(self):
        self.errors: List[BaseAppException] = []
        self.error_counts: Dict[str, int] = {}

    def track_error(self, error: BaseAppException):
        """Track an error occurrence."""
        self.errors.append(error)

        # Update counts
        error_key = f"{error.category}:{error.error_code}"
        self.error_counts[error_key] = self.error_counts.get(error_key, 0) + 1

        # Log error with context
        log_data = {
            "error_id": error.context.error_id,
            "category": error.category,
            "severity": error.severity,
            "error_code": error.error_code,
            "status_code": error.status_code,
            "request_id": error.context.request_id,
            "user_id": error.context.user_id,
            "endpoint": error.context.endpoint,
        }

        if error.severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]:
            logger.error(f"[{error.context.error_id}] {error.message}", extra=log_data)
        elif error.severity == ErrorSeverity.MEDIUM:
            logger.warning(f"[{error.context.error_id}] {error.message}", extra=log_data)
        else:
            logger.info(f"[{error.context.error_id}] {error.message}", extra=log_data)

    def get_error_stats(self) -> Dict[str, Any]:
        """Get error statistics."""
        return {
            "total_errors": len(self.errors),
            "error_counts": self.error_counts,
            "recent_errors": [
                {
                    "error_id": error.context.error_id,
                    "timestamp": error.context.timestamp,
                    "category": error.category,
                    "severity": error.severity,
                    "message": error.message
                }
                for error in self.errors[-10:]  # Last 10 errors
            ]
        }


# Global error tracker
_error_tracker = ErrorTracker()


def get_error_tracker() -> ErrorTracker:
    """Get global error tracker."""
    return _error_tracker


# Exception Handlers

async def base_app_exception_handler(request: Request, exc: BaseAppException) -> JSONResponse:
    """Handle application exceptions with full context."""
    # Set request context
    exc.set_request_context(request)

    # Track error
    _error_tracker.track_error(exc)

    # Create response
    error_response = exc.to_dict()

    # Add trace information for debugging (not in production)
    if exc.severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]:
        from app.config import get_settings
        settings = get_settings()
        if not settings.is_production() or settings.debug:
            error_response["trace"] = exc.context.stack_trace

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response,
        headers={"X-Error-ID": exc.context.error_id}
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle FastAPI/Pydantic validation exceptions."""
    validation_error = ValidationError(
        message="Request validation failed",
        cause=exc
    )
    validation_error.set_request_context(request)

    # Extract validation details if available
    if hasattr(exc, "errors"):
        for error in exc.errors():
            field = ".".join(str(loc) for loc in error.get("loc", []))
            validation_error.add_detail(field, error.get("msg", "Validation error"))

    return await base_app_exception_handler(request, validation_error)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTP exceptions."""
    # Convert to app exception
    app_exception = BaseAppException(
        message=exc.detail,
        status_code=exc.status_code,
        category=ErrorCategory.UNKNOWN,
        severity=ErrorSeverity.MEDIUM
    )
    app_exception.set_request_context(request)

    return await base_app_exception_handler(request, app_exception)


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    # Create system error
    system_error = BaseAppException(
        message="An unexpected error occurred",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        category=ErrorCategory.SYSTEM,
        severity=ErrorSeverity.CRITICAL,
        cause=exc
    )
    system_error.set_request_context(request)

    return await base_app_exception_handler(request, system_error)


def setup_enhanced_exception_handlers(app):
    """Set up enhanced exception handlers."""
    from fastapi.exceptions import RequestValidationError
    from pydantic import ValidationError as PydanticValidationError

    app.add_exception_handler(BaseAppException, base_app_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(PydanticValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    logger.info("Enhanced exception handlers registered")
