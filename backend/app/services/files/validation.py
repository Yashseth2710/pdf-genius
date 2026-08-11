"""Deciding what an uploaded file actually is.

The rule from spec section 18: do not trust the filename, and do not trust the
Content-Type header either. Both are supplied by whoever is uploading. What a
file *is* gets decided by reading its first few bytes.
"""

from dataclasses import dataclass

PDF = "application/pdf"
JPEG = "image/jpeg"
PNG = "image/png"

# Enough bytes to identify every type we accept.
SNIFF_BYTES = 16


@dataclass(frozen=True)
class FileType:
    mime: str
    extension: str


_SIGNATURES: list[tuple[bytes, FileType]] = [
    # "%PDF-" - the header every PDF starts with.
    (b"%PDF-", FileType(PDF, "pdf")),
    # JPEG: Start of Image marker.
    (b"\xff\xd8\xff", FileType(JPEG, "jpg")),
    # PNG: the 8-byte signature, including the newline checks that catch
    # a file mangled by a text-mode transfer.
    (b"\x89PNG\r\n\x1a\n", FileType(PNG, "png")),
]


def sniff(head: bytes) -> FileType | None:
    """Identify a file from its leading bytes, or None if we do not know it."""
    for signature, file_type in _SIGNATURES:
        if head.startswith(signature):
            return file_type
    return None


def looks_like_pdf(head: bytes) -> bool:
    return head.startswith(b"%PDF-")
