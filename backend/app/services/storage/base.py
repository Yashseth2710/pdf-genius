"""The storage interface.

Everything above this layer deals in opaque keys like
``documents/<user id>/<uuid>.pdf`` and never touches a filesystem path. That
keeps the door open for object storage later, and means no caller is in a
position to construct a path of its own.
"""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from typing import BinaryIO


@dataclass(frozen=True)
class StoredFile:
    """The result of writing a file: where it went and how big it turned out."""

    key: str
    size: int


class Storage(ABC):
    @abstractmethod
    def save(self, data: BinaryIO, *, key: str, max_bytes: int) -> StoredFile:
        """Write a stream, refusing anything larger than ``max_bytes``."""

    @abstractmethod
    def open(self, key: str) -> BinaryIO:
        """Open a stored file for reading."""

    @abstractmethod
    def stream(self, key: str, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        """Yield a stored file in chunks, so a download never loads it whole."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove a stored file. Missing files are not an error."""

    @abstractmethod
    def exists(self, key: str) -> bool: ...
