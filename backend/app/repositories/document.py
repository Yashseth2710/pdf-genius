"""Database access for uploaded documents."""

import uuid

from sqlalchemy import func, select

from app.models import Document
from app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository[Document]):
    model = Document

    def get_by_key(self, storage_key: str) -> Document | None:
        stmt = select(Document).where(Document.storage_path == storage_key)
        return self.db.execute(stmt).scalar_one_or_none()

    def total_bytes_for_user(self, user_id: uuid.UUID) -> int:
        """How much space this account is using, uploads and results together.

        Summed by the database rather than by adding up a list of every file
        size in Python: this runs on the way in to each upload, and an account
        with a thousand documents should not mean a thousand rows crossing the
        wire to answer one number. ``coalesce`` because SUM over no rows is
        NULL, and a new account has no rows.
        """
        stmt = select(func.coalesce(func.sum(Document.file_size), 0)).where(
            Document.user_id == user_id
        )
        return int(self.db.execute(stmt).scalar_one())
