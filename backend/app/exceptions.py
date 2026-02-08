"""
Custom exceptions for AssistMe.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


class BaseAppException(Exception):
    """Base exception for all application exceptions."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ValidationError(BaseAppException):
    """Validation error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class NotFoundError(BaseAppException):
    """Resource not found error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=404)


class UnauthorizedError(BaseAppException):
    """Unauthorized access error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=401)


class ForbiddenError(BaseAppException):
    """Forbidden access error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=403)


class ConflictError(BaseAppException):
    """Conflict error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=409)


class DatabaseError(BaseAppException):
    """Database error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=500)


class ConfigurationError(BaseAppException):
    """Configuration error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=500)


class ExternalServiceError(BaseAppException):
    """External service error."""
    def __init__(self, message: str, service: str = None):
        self.service = service
        super().__init__(message, status_code=503)


# Exception handlers
async def base_app_exception_handler(request: Request, exc: BaseAppException):
    """Handle BaseAppException."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "path": str(request.url.path)
        }
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTPException."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTPException",
            "message": exc.detail,
            "path": str(request.url.path)
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "ValidationError",
            "message": "Validation failed",
            "details": exc.errors(),
            "path": str(request.url.path)
        }
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred",
            "path": str(request.url.path)
        }
    )


def setup_exception_handlers(app: FastAPI):
    """Set up exception handlers for the application."""
    app.add_exception_handler(BaseAppException, base_app_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
