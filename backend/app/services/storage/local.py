"""Filesystem storage.

Free, and enough for a single backend process. Swapping in object storage later
means writing another Storage implementation, not touching any caller.
"""

import logging
import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO

from app.services.storage.base import Storage, StoredFile
from app.services.storage.keys import UnsafeStorageKeyError, validate_key

logger = logging.getLogger(__name__)


class FileTooLargeInStorage(Exception):
    """The stream exceeded the byte limit and was discarded."""


class LocalStorage(Storage):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        """Resolve a key to a real path, confirming it stays inside the root.

        Belt and braces: validate_key has already rejected traversal, but the
        resolved path is checked against the root as well, because symlinks can
        turn a well-formed key into a path somewhere else entirely.
        """
        validate_key(key)
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise UnsafeStorageKeyError(f"Key escapes the storage root: {key!r}")
        return path

    def save(self, data: BinaryIO, *, key: str, max_bytes: int) -> StoredFile:
        """Stream to disk, stopping the moment the limit is passed.

        Copied in chunks rather than read into memory: a 25MB limit should not
        require 25MB of RAM per upload, and a lying Content-Length should not
        be able to make it require more.
        """
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)

        written = 0
        try:
            with path.open("wb") as target:
                while chunk := data.read(64 * 1024):
                    written += len(chunk)
                    if written > max_bytes:
                        raise FileTooLargeInStorage
                    target.write(chunk)
        except Exception:
            # Never leave a partial file behind for a failed upload.
            path.unlink(missing_ok=True)
            raise

        return StoredFile(key=key, size=written)

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def stream(self, key: str, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        with self._path(key).open("rb") as source:
            while chunk := source.read(chunk_size):
                yield chunk

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except UnsafeStorageKeyError:
            # Log and move on: refusing to delete is safer than guessing.
            logger.warning("Refused to delete an unsafe storage key")

    def exists(self, key: str) -> bool:
        try:
            return self._path(key).is_file()
        except UnsafeStorageKeyError:
            return False

    def delete_prefix(self, prefix: str) -> None:
        """Remove everything under a prefix, used when an account is deleted."""
        path = self._path(prefix)
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
