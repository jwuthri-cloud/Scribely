"""
Base models for Scribely.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    """Health check response model."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "timestamp": "2024-01-01T12:00:00.000Z",
                "service": "Scribely",
                "version": "0.1.0",
                "environment": "development",
                "services": {
                    "database": "healthy"
                }
            }
        }
    )

    status: Literal["healthy", "unhealthy"] = Field(..., description="Service health status")
    timestamp: str = Field(..., description="Health check timestamp")
    service: str = Field(..., description="Service name")
    version: Optional[str] = Field(default=None, description="Service version")
    environment: Optional[str] = Field(default=None, description="Environment")
    services: Optional[Dict[str, str]] = Field(default=None, description="Individual service statuses")


class ErrorResponse(BaseModel):
    """Standard error response model."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "ValidationError",
                "message": "The message field is required",
                "details": {"field": "message", "code": "required"},
                "request_id": "req_123456789",
                "timestamp": "2024-01-01T12:00:00.000Z"
            }
        }
    )

    error: str = Field(..., description="Error type or code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")
    request_id: Optional[str] = Field(default=None, description="Request identifier for tracking")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Error timestamp")


class PaginatedResponse(BaseModel):
    """Base model for paginated responses."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total": 150,
                "limit": 50,
                "offset": 0,
                "has_more": True
            }
        }
    )

    total: int = Field(..., description="Total number of items")
    limit: int = Field(..., description="Items per page")
    offset: int = Field(..., description="Items skipped")
    has_more: bool = Field(..., description="Whether there are more items")


class APIInfo(BaseModel):
    """API information model."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Scribely API",
                "version": "0.1.0",
                "description": "A FastAPI + Next.js AI agent application with OpenRouter",
                "docs_url": "/docs",
                "health_url": "/health"
            }
        }
    )

    name: str = Field(..., description="API name")
    version: str = Field(..., description="API version")
    description: str = Field(..., description="API description")
    docs_url: str = Field(..., description="Documentation URL")
    health_url: str = Field(..., description="Health check URL")


class ErrorDetail(BaseModel):
    """Individual error detail."""
    type: str = Field(..., description="Error type identifier")
    message: str = Field(..., description="Human-readable error message")
    field: Optional[str] = Field(None, description="Field that caused the error (if applicable)")
    code: Optional[str] = Field(None, description="Error code for programmatic handling")


class ValidationErrorDetail(ErrorDetail):
    """Validation error detail."""
    input_value: Optional[Any] = Field(None, description="The invalid input value")
    constraints: Optional[Dict[str, Any]] = Field(None, description="Validation constraints that failed")


class EnhancedErrorResponse(BaseModel):
    """Enhanced standardized error response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "ValidationError",
                "message": "Input validation failed",
                "details": [
                    {
                        "type": "value_error",
                        "message": "Field validation failed",
                        "field": "email",
                        "code": "INVALID_FORMAT"
                    }
                ],
                "request_id": "req_123456789",
                "timestamp": "2024-01-01T12:00:00.000Z",
                "path": "/api/v1/users",
                "method": "POST"
            }
        }
    )

    error: str = Field(..., description="Error type/category")
    message: str = Field(..., description="Main error message")
    details: List[ErrorDetail] = Field(default_factory=list, description="Detailed error information")
    request_id: Optional[str] = Field(None, description="Request identifier for tracing")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Error timestamp")
    path: Optional[str] = Field(None, description="Request path that caused the error")
    method: Optional[str] = Field(None, description="HTTP method that caused the error")


class SuccessResponse(BaseModel):
    """Standardized success response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Operation completed successfully",
                "data": {"id": "123", "status": "active"},
                "request_id": "req_123456789",
                "timestamp": "2024-01-01T12:00:00.000Z"
            }
        }
    )

    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")
    data: Optional[Any] = Field(None, description="Response data")
    request_id: Optional[str] = Field(None, description="Request identifier for tracing")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Response timestamp")


class StatusResponse(BaseModel):
    """Status operation response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "processing",
                "message": "Task is being processed",
                "data": {"progress": 75, "estimated_completion": "2024-01-01T12:05:00.000Z"}
            }
        }
    )

    status: str = Field(..., description="Operation status")
    message: str = Field(..., description="Status message")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional status data")
