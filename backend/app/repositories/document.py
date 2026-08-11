"""Database access for uploaded documents."""

import uuid

from sqlalchemy import select

from app.models import Document
from app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository[Document]):
    model = Document

    def get_by_key(self, storage_key: str) -> Document | None:
        stmt = select(Document).where(Document.storage_path == storage_key)
        return self.db.execute(stmt).scalar_one_or_none()

    def total_bytes_for_user(self, user_id: uuid.UUID) -> int:
        """How much space this account is using, for a future quota."""
        stmt = select(Document.file_size).where(Document.user_id == user_id)
        return sum(self.db.execute(stmt).scalars().all())
