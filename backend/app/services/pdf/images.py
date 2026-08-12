"""Binding images into a PDF.

As everywhere else in this package, this takes bytes and returns bytes: no
database, no storage, no request.
"""

import io
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

import pillow_heif
import pymupdf
from PIL import Image

from app.core.errors import InvalidFileError, ProcessingError
from app.services.pdf.operations import OutputFile

logger = logging.getLogger(__name__)

# Teaches Pillow to read HEIC. Done once, on import, because Pillow decides
# which formats it knows the first time it is asked and a registration that
# happened later would look like an intermittent failure.
pillow_heif.register_heif_opener()


class PageSize(StrEnum):
    A4 = "a4"
    LETTER = "letter"
    # One page per image, exactly the size of that image. For scans that are
    # already the right shape, fitting them to A4 only adds white borders.
    MATCH = "match"


class Orientation(StrEnum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    # Each page follows its own image, so a mixed batch of phone photos does
    # not put the landscape ones in a portrait letterbox.
    AUTO = "auto"


# Points, at 72 per inch, portrait. PDF measures in points and always has.
PAGE_DIMENSIONS: dict[PageSize, tuple[float, float]] = {
    PageSize.A4: (595.0, 842.0),
    PageSize.LETTER: (612.0, 792.0),
}


@dataclass(frozen=True)
class SourceImage:
    """One image going into a PDF.

    ``extension`` comes from the stored MIME type, which was decided by reading
    the file's leading bytes at upload. It is passed to PyMuPDF explicitly so
    that opening the image never depends on guessing.
    """

    name: str
    data: bytes
    extension: str


# The formats PyMuPDF reads for itself. Everything else is decoded by Pillow
# first - see _as_readable.
_NATIVE_EXTENSIONS = frozenset({"jpg", "png", "gif", "bmp", "tiff"})


def _as_readable(source: SourceImage) -> tuple[bytes, str]:
    """The image in a form PyMuPDF can open, decoding it first if it cannot.

    WEBP and HEIC are the two the PDF library does not read, and HEIC is the
    one that matters most: it is what an iPhone writes by default, so refusing
    it would turn away the commonest photo on earth over a container format.
    Pillow reads both, so they are decoded and handed on re-encoded.

    Re-encoding is chosen per image rather than fixed: PNG for anything with
    transparency, because JPEG has none and would fill it with black, and JPEG
    for everything else, because a photograph stored as PNG can be ten times
    the size for no visible gain.
    """
    if source.extension in _NATIVE_EXTENSIONS:
        return source.data, source.extension

    with Image.open(io.BytesIO(source.data)) as decoded:
        buffer = io.BytesIO()
        if _has_alpha(decoded):
            decoded.convert("RGBA").save(buffer, "PNG")
            return buffer.getvalue(), "png"
        decoded.convert("RGB").save(buffer, "JPEG", quality=90)
        return buffer.getvalue(), "jpg"


def _has_alpha(image: Image.Image) -> bool:
    """Whether anything in this image is see-through.

    The mode is the answer for most formats; the ``transparency`` key is how a
    palette image says which colour is the invisible one. Both are needed:
    checking only the key misses a plain RGBA WEBP, and re-encoding that as
    JPEG fills every transparent pixel with black.
    """
    return image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info


def _open_image(source: SourceImage) -> pymupdf.Document:
    """Open an image as a document, or explain which file was bad.

    The page is loaded here, inside the ``try``, and not left to the caller:
    PyMuPDF accepts any bytes at ``open`` and only discovers that they are not
    an image when something asks for the page. Finding out later means the
    failure surfaces from the middle of a loop with no idea whose file it was.
    """
    try:
        data, extension = _as_readable(source)
        image: pymupdf.Document = pymupdf.open(stream=data, filetype=extension)
        if image.page_count == 0:
            raise InvalidFileError(f"'{source.name}' contains no image data.")
        image[0]
    except InvalidFileError:
        raise
    except Exception as exc:
        logger.info("Could not open image %r: %s", source.name, exc.__class__.__name__)
        raise InvalidFileError(f"'{source.name}' could not be opened. It may be damaged.") from exc

    return image


def _page_size(
    size: PageSize, orientation: Orientation, bounds: pymupdf.Rect
) -> tuple[float, float]:
    """The page to draw one image on, in points."""
    width, height = PAGE_DIMENSIONS[size]

    if orientation is Orientation.LANDSCAPE:
        return height, width
    if orientation is Orientation.AUTO and bounds.width > bounds.height:
        return height, width

    return width, height


def _fitted(page: pymupdf.Rect, image: pymupdf.Rect) -> pymupdf.Rect:
    """The largest centred rectangle of the image's shape that fits the page.

    Worked out here rather than left to PyMuPDF's ``keep_proportion``, which in
    this version stretches the image to the rectangle it is given whatever that
    flag is set to - a square photo came out as a full-bleed A4 oblong. Shape is
    not a detail we can afford to get wrong: a stretched face is the first thing
    anyone notices, and it is silent.
    """
    scale = min(page.width / image.width, page.height / image.height)
    width = image.width * scale
    height = image.height * scale
    left = (page.width - width) / 2
    top = (page.height - height) / 2
    return pymupdf.Rect(left, top, left + width, top + height)


def images_to_pdf(
    sources: Sequence[SourceImage],
    *,
    page_size: PageSize = PageSize.A4,
    orientation: Orientation = Orientation.AUTO,
    output_name: str = "images.pdf",
) -> OutputFile:
    """One PDF, one page per image, in the order the images were given.

    The order is the user's: it is what they dragged the thumbnails into, and
    re-sorting it here - by filename, say - would quietly throw that away.
    """
    if not sources:
        raise ProcessingError("Choose at least one image.")

    combined: pymupdf.Document = pymupdf.open()
    try:
        for source in sources:
            # Every image becomes a PDF of its own first, at its natural size.
            # That is one step for a single-frame file and the only correct one
            # for the rest: a scanner writes a three-page fax as a single
            # multi-page TIFF, and drawing "the image" keeps page one and
            # silently loses the other two.
            with (
                _open_image(source) as image,
                pymupdf.open("pdf", image.convert_to_pdf()) as as_pdf,
            ):
                if page_size is PageSize.MATCH:
                    # Pages exactly the size of the picture: nothing scaled and
                    # nothing cropped.
                    combined.insert_pdf(as_pdf)
                    continue

                for index in range(as_pdf.page_count):
                    bounds = as_pdf[index].rect
                    width, height = _page_size(page_size, orientation, bounds)
                    page = combined.new_page(width=width, height=height)
                    page.show_pdf_page(_fitted(page.rect, bounds), as_pdf, index)

        data = bytes(combined.tobytes(garbage=4, clean=True, deflate=True))
        page_count = int(combined.page_count)
    finally:
        combined.close()

    return OutputFile(filename=output_name, data=data, page_count=page_count)
