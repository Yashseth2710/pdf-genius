"""The response envelope every endpoint uses (spec section 47)."""

from typing import Literal

from pydantic import BaseModel, Field


class SuccessResponse[T](BaseModel):
    """``{"success": true, "data": {...}}``"""

    success: Literal[True] = True
    data: T


class ErrorDetail(BaseModel):
    """A machine-readable code plus a message safe to show a user."""

    code: str = Field(examples=["INVALID_FILE"])
    message: str = Field(examples=["The uploaded file is not a valid PDF."])


class ErrorResponse(BaseModel):
    """``{"success": false, "error": {"code": ..., "message": ...}}``"""

    success: Literal[False] = False
    error: ErrorDetail
