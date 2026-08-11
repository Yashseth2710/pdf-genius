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
    # Rotating, reordering and removing pages are one operation, not three:
    # they are applied together from a single page plan, and a job that did
    # all three at once could not honestly be labelled any one of them.
    ORGANISE = "ORGANISE"
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
