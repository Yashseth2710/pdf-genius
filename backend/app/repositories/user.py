"""Database access for user accounts."""

from sqlalchemy import select

from app.models import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        """Look a user up by email.

        The address is normalised first, so Ada@Example.com and
        ada@example.com resolve to the same account.
        """
        stmt = select(User).where(User.email == normalise_email(email))
        return self.db.execute(stmt).scalar_one_or_none()

    def email_exists(self, email: str) -> bool:
        return self.get_by_email(email) is not None


def normalise_email(email: str) -> str:
    """Lower-case and trim, so one address cannot become two accounts."""
    return email.strip().lower()
