"""ORM models.

Every model is imported here so that ``Base.metadata`` is complete by the time
Alembic inspects it - a model that is never imported is invisible to
autogenerate, and would silently be missing from migrations.
"""

from app.models.ai import AIMessage, AISession
from app.models.document import Document
from app.models.enums import (
    AISessionType,
    DocumentStatus,
    JobStatus,
    MessageRole,
    OperationType,
)
from app.models.processing_job import ProcessingJob
from app.models.user import User

__all__ = [
    "AIMessage",
    "AISession",
    "AISessionType",
    "Document",
    "DocumentStatus",
    "JobStatus",
    "MessageRole",
    "OperationType",
    "ProcessingJob",
    "User",
]
