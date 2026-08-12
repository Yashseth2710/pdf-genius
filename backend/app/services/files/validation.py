"""Deciding what an uploaded file actually is.

The rule from spec section 18: do not trust the filename, and do not trust the
Content-Type header either. Both are supplied by whoever is uploading. What a
file *is* gets decided by reading its first few bytes.
"""

from dataclasses import dataclass

PDF = "application/pdf"
JPEG = "image/jpeg"
PNG = "image/png"
GIF = "image/gif"
BMP = "image/bmp"
TIFF = "image/tiff"
WEBP = "image/webp"
HEIC = "image/heic"
# We produce zip archives when a split has several outputs, but we never accept
# one: it is deliberately absent from the signature table below, so an uploaded
# archive is not recognised and therefore refused.
ZIP = "application/zip"

# Every image type that can go into a PDF. The set matches what the established
# converters take, so somebody arriving with a phone photo or a scan is not
# turned away over a file extension.
IMAGE_TYPES: tuple[str, ...] = (JPEG, PNG, GIF, BMP, TIFF, WEBP, HEIC)

# Enough bytes to identify every type we accept. HEIC is the reason this is not
# smaller: its brand sits twelve bytes in.
SNIFF_BYTES = 32


@dataclass(frozen=True)
class FileType:
    mime: str
    extension: str


@dataclass(frozen=True)
class Signature:
    """Bytes that identify a type, and where in the file to find them.

    Most formats put their marker first. The container formats - WEBP inside
    RIFF, HEIC inside ISO-BMFF - put a length or a chunk name there instead, so
    the marker has to be looked for at a known offset rather than at the start.
    """

    offset: int
    magic: bytes
    file_type: FileType

    def matches(self, head: bytes) -> bool:
        return head[self.offset : self.offset + len(self.magic)] == self.magic


def _at_start(magic: bytes, mime: str, extension: str) -> Signature:
    return Signature(0, magic, FileType(mime, extension))


_SIGNATURES: list[Signature] = [
    # "%PDF-" - the header every PDF starts with.
    _at_start(b"%PDF-", PDF, "pdf"),
    # JPEG: Start of Image marker.
    _at_start(b"\xff\xd8\xff", JPEG, "jpg"),
    # PNG: the 8-byte signature, including the newline bytes that catch a file
    # mangled by a text-mode transfer.
    _at_start(b"\x89PNG\r\n\x1a\n", PNG, "png"),
    # GIF, in both versions still in the wild.
    _at_start(b"GIF87a", GIF, "gif"),
    _at_start(b"GIF89a", GIF, "gif"),
    # BMP, which is only two bytes of magic - hence the Pillow decode later,
    # which is what actually proves it is an image.
    _at_start(b"BM", BMP, "bmp"),
    # TIFF, little- and big-endian. Scanners produce both.
    _at_start(b"II\x2a\x00", TIFF, "tiff"),
    _at_start(b"MM\x00\x2a", TIFF, "tiff"),
    # WEBP: a RIFF container with "WEBP" as its form type, four bytes past the
    # file length.
    Signature(8, b"WEBP", FileType(WEBP, "webp")),
]

# HEIC: an ISO base media file whose brand follows the "ftyp" box header.
# Several brands mean the same thing to us - what an iPhone writes depends on
# whether the picture is a single image, a sequence, or a burst.
_HEIF_BRANDS = (b"heic", b"heix", b"heim", b"heis", b"hevc", b"mif1", b"msf1")
_SIGNATURES += [Signature(4, b"ftyp" + brand, FileType(HEIC, "heic")) for brand in _HEIF_BRANDS]


# The file extension we give a result of each type. Uploads take theirs from
# the signature table above; results are ours to name.
EXTENSIONS: dict[str, str] = {
    PDF: "pdf",
    JPEG: "jpg",
    PNG: "png",
    GIF: "gif",
    BMP: "bmp",
    TIFF: "tiff",
    WEBP: "webp",
    HEIC: "heic",
    ZIP: "zip",
}


def sniff(head: bytes) -> FileType | None:
    """Identify a file from its leading bytes, or None if we do not know it."""
    for signature in _SIGNATURES:
        if signature.matches(head):
            return signature.file_type
    return None


def looks_like_pdf(head: bytes) -> bool:
    return head.startswith(b"%PDF-")
