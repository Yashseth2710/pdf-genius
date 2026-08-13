"""The response envelope every endpoint uses (spec section 47)."""

import uuid
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


class DeletedResponse(BaseModel):
    """What every delete gives back, whatever was deleted.

    Here rather than beside one kind of record: documents and history entries
    both say the same thing, and a second copy of it under a different name is
    how two identical shapes drift apart.
    """

    id: uuid.UUID
    deleted: bool = True
