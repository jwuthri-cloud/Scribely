"""
API response wrapper utilities for standardized responses.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.base import EnhancedErrorResponse, ErrorDetail, SuccessResponse
from app.utils.logging import get_logger
from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = get_logger("api_response")


class APIResponseWrapper:
    """Standardized API response wrapper."""

    @staticmethod
    def success(
        message: str,
        data: Any = None,
        status_code: int = status.HTTP_200_OK,
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized success response.

        Args:
            message: Success message
            data: Response data
            status_code: HTTP status code
            request: FastAPI request object

        Returns:
            Standardized JSON response
        """
        request_id = getattr(request.state, "request_id", None) if request else None

        response_data = SuccessResponse(
            success=True,
            message=message,
            data=data,
            request_id=request_id,
            timestamp=datetime.utcnow().isoformat()
        )

        return JSONResponse(
            status_code=status_code,
            content=response_data.dict(exclude_none=True)
        )

    @staticmethod
    def error(
        message: str,
        details: Optional[List[ErrorDetail]] = None,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        request: Optional[Request] = None,
        error_type: str = "APIError"
    ) -> JSONResponse:
        """
        Create a standardized error response.

        Args:
            message: Error message
            details: List of error details
            status_code: HTTP status code
            request: FastAPI request object
            error_type: Error type/category

        Returns:
            Standardized JSON error response
        """
        request_id = getattr(request.state, "request_id", None) if request else None

        response_data = EnhancedErrorResponse(
            error=error_type,
            message=message,
            details=details or [],
            request_id=request_id,
            timestamp=datetime.utcnow().isoformat(),
            path=request.url.path if request else None,
            method=request.method if request else None
        )

        return JSONResponse(
            status_code=status_code,
            content=response_data.dict(exclude_none=True)
        )

    @staticmethod
    def validation_error(
        message: str = "Validation failed",
        field_errors: Optional[List[Dict[str, Any]]] = None,
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized validation error response.

        Args:
            message: Main validation error message
            field_errors: List of field-specific validation errors
            request: FastAPI request object

        Returns:
            Standardized validation error response
        """
        details = []

        if field_errors:
            for error in field_errors:
                details.append(ErrorDetail(
                    type="validation_error",
                    message=error.get("msg", "Invalid value"),
                    field=error.get("loc", [])[-1] if error.get("loc") else None,
                    code="VALIDATION_FAILED"
                ))

        return APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            request=request,
            error_type="ValidationError"
        )

    @staticmethod
    def not_found(
        resource: str = "Resource",
        identifier: Optional[str] = None,
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized not found error response.

        Args:
            resource: Resource type that was not found
            identifier: Resource identifier that was not found
            request: FastAPI request object

        Returns:
            Standardized not found error response
        """
        if identifier:
            message = f"{resource} with ID '{identifier}' not found"
        else:
            message = f"{resource} not found"

        details = [ErrorDetail(
            type="not_found",
            message=message,
            code="RESOURCE_NOT_FOUND"
        )]

        return APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_404_NOT_FOUND,
            request=request,
            error_type="NotFoundError"
        )

    @staticmethod
    def unauthorized(
        message: str = "Authentication required",
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized unauthorized error response.

        Args:
            message: Unauthorized error message
            request: FastAPI request object

        Returns:
            Standardized unauthorized error response
        """
        details = [ErrorDetail(
            type="authentication_error",
            message=message,
            code="UNAUTHORIZED"
        )]

        return APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_401_UNAUTHORIZED,
            request=request,
            error_type="UnauthorizedError"
        )

    @staticmethod
    def forbidden(
        message: str = "Access forbidden",
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized forbidden error response.

        Args:
            message: Forbidden error message
            request: FastAPI request object

        Returns:
            Standardized forbidden error response
        """
        details = [ErrorDetail(
            type="authorization_error",
            message=message,
            code="FORBIDDEN"
        )]

        return APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_403_FORBIDDEN,
            request=request,
            error_type="ForbiddenError"
        )

    @staticmethod
    def rate_limited(
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized rate limit error response.

        Args:
            message: Rate limit error message
            retry_after: Seconds to wait before retrying
            request: FastAPI request object

        Returns:
            Standardized rate limit error response
        """
        details = [ErrorDetail(
            type="rate_limit_error",
            message=message,
            code="RATE_LIMIT_EXCEEDED"
        )]

        response = APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            request=request,
            error_type="RateLimitError"
        )

        # Add Retry-After header
        if retry_after:
            response.headers["Retry-After"] = str(retry_after)

        return response

    @staticmethod
    def server_error(
        message: str = "Internal server error",
        request: Optional[Request] = None,
        error_code: Optional[str] = None
    ) -> JSONResponse:
        """
        Create a standardized server error response.

        Args:
            message: Server error message
            request: FastAPI request object
            error_code: Optional error code for debugging

        Returns:
            Standardized server error response
        """
        details = [ErrorDetail(
            type="server_error",
            message=message,
            code=error_code or "INTERNAL_SERVER_ERROR"
        )]

        return APIResponseWrapper.error(
            message=message,
            details=details,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            request=request,
            error_type="ServerError"
        )

    @staticmethod
    def paginated_response(
        items: List[Any],
        total: int,
        limit: int,
        offset: int,
        message: str = "Data retrieved successfully",
        request: Optional[Request] = None
    ) -> JSONResponse:
        """
        Create a standardized paginated response.

        Args:
            items: List of items for current page
            total: Total number of items
            limit: Items per page
            offset: Items skipped
            message: Success message
            request: FastAPI request object

        Returns:
            Standardized paginated response
        """
        pagination = {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(items) < total,
            "has_prev": offset > 0,
            "page": (offset // limit) + 1,
            "pages": ((total - 1) // limit) + 1 if total > 0 else 0
        }

        data = {
            "items": items,
            "pagination": pagination
        }

        return APIResponseWrapper.success(
            message=message,
            data=data,
            request=request
        )


# Convenience functions for common responses
def success_response(
    message: str,
    data: Any = None,
    request: Optional[Request] = None
) -> JSONResponse:
    """Convenience function for success response."""
    return APIResponseWrapper.success(message, data, request=request)


def error_response(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    request: Optional[Request] = None
) -> JSONResponse:
    """Convenience function for error response."""
    return APIResponseWrapper.error(message, status_code=status_code, request=request)


def validation_error_response(
    errors: List[Dict[str, Any]],
    request: Optional[Request] = None
) -> JSONResponse:
    """Convenience function for validation error response."""
    return APIResponseWrapper.validation_error(field_errors=errors, request=request)


def not_found_response(
    resource: str,
    identifier: Optional[str] = None,
    request: Optional[Request] = None
) -> JSONResponse:
    """Convenience function for not found response."""
    return APIResponseWrapper.not_found(resource, identifier, request)


# Decorator for standardizing endpoint responses
def standardize_response(func):
    """
    Decorator to automatically wrap endpoint responses in standard format.

    Usage:
        @router.get("/items/{item_id}")
        @standardize_response
        async def get_item(item_id: int):
            item = get_item_from_db(item_id)
            if not item:
                raise HTTPException(404, "Item not found")
            return {"message": "Item retrieved", "data": item}
    """
    async def wrapper(*args, **kwargs):
        try:
            result = await func(*args, **kwargs)

            # If result is already a JSONResponse, return as is
            if isinstance(result, JSONResponse):
                return result

            # If result is a dict with message and data, wrap it
            if isinstance(result, dict):
                if "message" in result:
                    return success_response(
                        message=result["message"],
                        data=result.get("data"),
                        request=kwargs.get("request")
                    )

            # Otherwise, return raw result (for existing working endpoints)
            return result

        except Exception as e:
            logger.exception(f"Error in endpoint {func.__name__}: {e}")
            return APIResponseWrapper.server_error(
                message="An unexpected error occurred",
                request=kwargs.get("request")
            )

    return wrapper
