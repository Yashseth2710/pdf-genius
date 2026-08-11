"""Shared database access.

Routes and services go through repositories rather than writing queries inline,
so ownership checks live in one place instead of being repeated - and
occasionally forgotten - at every call site.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import Base


class BaseRepository[ModelT: Base]:
    """CRUD shared by every model.

    Subclasses set ``model``. Anything owned by a user should be fetched with
    :meth:`get_for_user`, never :meth:`get`.
    """

    model: type[ModelT]

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, record_id: uuid.UUID) -> ModelT | None:
        """Fetch by id with no ownership check.

        Only for records that do not belong to a user, or where the caller has
        already established access.
        """
        return self.db.get(self.model, record_id)

    def get_for_user(self, record_id: uuid.UUID, user_id: uuid.UUID) -> ModelT | None:
        """Fetch a record only if it belongs to this user.

        Returning None for someone else's record - rather than the record, or a
        403 - means a user cannot even confirm that an id exists (spec
        section 17).
        """
        stmt = select(self.model).where(
            self.model.id == record_id,  # type: ignore[attr-defined]
            self.model.user_id == user_id,  # type: ignore[attr-defined]
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> Sequence[ModelT]:
        """Newest first, paginated - histories are never fetched whole."""
        stmt = (
            select(self.model)
            .where(self.model.user_id == user_id)  # type: ignore[attr-defined]
            .order_by(self.model.created_at.desc())  # type: ignore[attr-defined]
            .limit(limit)
            .offset(offset)
        )
        return self.db.execute(stmt).scalars().all()

    def count_for_user(self, user_id: uuid.UUID) -> int:
        """Total rows for this user, for pagination."""
        stmt = (
            select(func.count()).select_from(self.model).where(self.model.user_id == user_id)  # type: ignore[attr-defined]
        )
        return self.db.execute(stmt).scalar_one()

    def add(self, instance: ModelT) -> ModelT:
        """Persist a new record and return it with database defaults filled in."""
        self.db.add(instance)
        self.db.flush()
        self.db.refresh(instance)
        return instance

    def delete(self, instance: ModelT) -> None:
        self.db.delete(instance)
        self.db.flush()
