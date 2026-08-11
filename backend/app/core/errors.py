"""Application errors and the handlers that turn them into JSON.

Two rules drive this module (spec sections 42 and 47):

* every failure leaves as ``{"success": false, "error": {"code", "message"}}``
* users never see a stack trace, a database error or an internal path
"""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for failures we raise deliberately and can explain."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"
    message: str = "The request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None) -> None:
        self.message = message or self.message
        if code is not None:
            self.code = code
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    message = "The requested resource does not exist."


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHENTICATED"
    message = "Authentication is required."


class PermissionDeniedError(AppError):
    """Raised when a user reaches for a record that is not theirs."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
    message = "You do not have access to this resource."


class InvalidFileError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "INVALID_FILE"
    message = "The uploaded file is not valid."


class FileTooLargeError(AppError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    code = "FILE_TOO_LARGE"
    message = "The uploaded file is too large."


class UnsupportedFileTypeError(AppError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "UNSUPPORTED_FILE_TYPE"
    message = "This file type is not supported."


class ProcessingError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "PROCESSING_FAILED"
    message = "We couldn't process this document. Please try again."


class ServiceUnavailableError(AppError):
    """Used when an optional dependency (such as AI) is switched off or down."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "SERVICE_UNAVAILABLE"
    message = "This feature is currently unavailable."


def error_body(code: str, message: str) -> dict[str, Any]:
    """Build the error envelope as a plain dict."""
    return {"success": False, "error": {"code": code, "message": message}}


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers so no route has to format its own error response."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Report the first problem in words a user can act on, e.g.
        # "body.email: value is not a valid email address".
        first = exc.errors()[0] if exc.errors() else None
        if first is not None:
            location = ".".join(str(part) for part in first["loc"])
            message = f"{location}: {first['msg']}"
        else:
            message = "The request data is invalid."
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=error_body("VALIDATION_ERROR", message),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {
            status.HTTP_401_UNAUTHORIZED: "UNAUTHENTICATED",
            status.HTTP_403_FORBIDDEN: "FORBIDDEN",
            status.HTTP_404_NOT_FOUND: "NOT_FOUND",
            status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
            status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
        }
        code = codes.get(exc.status_code, "HTTP_ERROR")
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(status_code=exc.status_code, content=error_body(code, detail))

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Full detail goes to the logs; the client gets a generic message.
        request_id = getattr(request.state, "request_id", "-")
        logger.exception("Unhandled error [request_id=%s] %s %s", request_id, request.method, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("INTERNAL_ERROR", "Something went wrong on our side."),
        )
