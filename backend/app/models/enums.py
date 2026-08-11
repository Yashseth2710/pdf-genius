"""Enumerations stored in the database as native PostgreSQL enum types."""

from enum import StrEnum


class DocumentStatus(StrEnum):
    """Lifecycle of an uploaded file."""

    UPLOADED = "UPLOADED"
    READY = "READY"
    FAILED = "FAILED"


class JobStatus(StrEnum):
    """Lifecycle of a processing job (spec section 14)."""

    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class OperationType(StrEnum):
    """What a processing job was asked to do."""

    MERGE = "MERGE"
    SPLIT = "SPLIT"
    COMPRESS = "COMPRESS"
    CONVERT = "CONVERT"
    ROTATE = "ROTATE"
    EXTRACT = "EXTRACT"
    WATERMARK = "WATERMARK"
    OCR = "OCR"


class AISessionType(StrEnum):
    SUMMARY = "SUMMARY"
    Q_AND_A = "Q_AND_A"


class MessageRole(StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
