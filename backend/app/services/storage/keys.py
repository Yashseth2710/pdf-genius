"""Building storage keys, and refusing to accept one we did not build."""

import re
import unicodedata
import uuid
from pathlib import PurePosixPath

# A key we generated: two or three path segments of safe characters, ending in
# a short extension. Anything else is rejected outright.
_SAFE_KEY = re.compile(r"^[a-z0-9][a-z0-9._/-]{0,254}$")

_UNSAFE_FILENAME_CHARS = re.compile(r'[\x00-\x1f<>:"/\\|?*]')


class UnsafeStorageKeyError(ValueError):
    """Raised when a key could escape the storage root."""


def new_document_key(user_id: uuid.UUID, extension: str) -> str:
    """A fresh key for an uploaded document.

    The name is generated, never derived from what the user called the file:
    a filename is attacker-controlled text, and the moment it becomes a path
    it can contain ``..`` or an absolute prefix.
    """
    suffix = extension.lower().lstrip(".")
    return f"documents/{user_id}/{uuid.uuid4().hex}.{suffix}"


def new_output_key(user_id: uuid.UUID, extension: str) -> str:
    """A key for a file we produced, such as a merge result."""
    suffix = extension.lower().lstrip(".")
    return f"outputs/{user_id}/{uuid.uuid4().hex}.{suffix}"


def validate_key(key: str) -> str:
    """Reject anything that is not a key we could have generated.

    This is the last line of defence. Nothing in the API accepts a key from a
    client, but a corrupted or tampered database row must not be enough to
    read ``../../etc/passwd`` either.
    """
    if not key or not _SAFE_KEY.match(key):
        raise UnsafeStorageKeyError(f"Refusing unsafe storage key: {key!r}")

    path = PurePosixPath(key)
    if path.is_absolute() or any(part in {"..", ""} for part in path.parts):
        raise UnsafeStorageKeyError(f"Refusing unsafe storage key: {key!r}")

    return key


def safe_download_name(original_filename: str, *, fallback: str = "document.pdf") -> str:
    """Clean a user's filename enough to put in a Content-Disposition header.

    Used for display only - never as a path. Strips directory separators,
    control characters and anything that would let the filename break out of
    the header it sits in.
    """
    # Take the last segment, so "../../etc/passwd" becomes "passwd".
    name = PurePosixPath(original_filename.replace("\\", "/")).name
    name = unicodedata.normalize("NFKC", name)
    name = _UNSAFE_FILENAME_CHARS.sub("", name).strip(". ")

    if not name:
        return fallback
    return name[:200]
