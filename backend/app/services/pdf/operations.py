"""The PDF work itself: merging documents and splitting one apart.

Everything here takes bytes and returns bytes. Nothing in this module knows
about the database, the storage layer, HTTP or who is signed in, which is what
makes it testable by simply reopening the output and counting pages.

PyMuPDF holds documents in memory, so the callers above enforce the size and
count limits from settings before anything reaches these functions.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass

import pymupdf

from app.core.errors import InvalidFileError, ProcessingError
from app.services.pdf.ranges import PageRange
from app.services.storage.keys import safe_download_name

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourcePdf:
    """One input to an operation: its bytes and the name to blame in an error."""

    name: str
    data: bytes


@dataclass(frozen=True)
class OutputFile:
    """One produced file, named as the user will see it.

    ``page_count`` is ``None`` for a file that has no pages to count - a page
    exported as a JPG is a result like any other, but "1 page" would be a
    number we invented.
    """

    filename: str
    data: bytes
    page_count: int | None = None


def open_pdf(source: SourcePdf) -> pymupdf.Document:
    """Open a source PDF, turning every failure into something we can show.

    These files have already passed validation on upload, so a failure here
    usually means the stored file has been damaged since - still the user's
    problem to see, and still not a stack trace.
    """
    try:
        document: pymupdf.Document = pymupdf.open(stream=source.data, filetype="pdf")
    except Exception as exc:
        logger.info("Could not open %r for processing: %s", source.name, exc.__class__.__name__)
        raise InvalidFileError(f"'{source.name}' could not be opened. It may be damaged.") from exc

    if document.needs_pass:
        document.close()
        raise InvalidFileError(f"'{source.name}' is password protected. Remove the password first.")

    if document.page_count == 0:
        document.close()
        raise InvalidFileError(f"'{source.name}' has no pages.")

    return document


def merge(sources: Sequence[SourcePdf]) -> OutputFile:
    """Join several PDFs into one, in the order given.

    The order is the caller's, not ours: it is what the user dragged the files
    into, and reordering it here would silently ignore them.
    """
    if len(sources) < 2:
        raise ProcessingError("Choose at least two PDFs to merge.")

    merged: pymupdf.Document = pymupdf.open()
    try:
        for source in sources:
            with open_pdf(source) as document:
                merged.insert_pdf(document)

        data = bytes(merged.tobytes())
        page_count = merged.page_count
    finally:
        merged.close()

    return OutputFile(filename="merged.pdf", data=data, page_count=page_count)


def _extract(source: pymupdf.Document, first: int, last: int) -> bytes:
    """A new PDF holding pages ``first``..``last`` (0-based, inclusive)."""
    part: pymupdf.Document = pymupdf.open()
    try:
        part.insert_pdf(source, from_page=first, to_page=last)
        return bytes(part.tobytes())
    finally:
        part.close()


def split_by_ranges(source: SourcePdf, ranges: Sequence[PageRange]) -> list[OutputFile]:
    """One output file per range, named after the pages it contains."""
    stem = stem_of(source.name)
    outputs: list[OutputFile] = []

    with open_pdf(source) as document:
        for page_range in ranges:
            first, last = page_range.indices()
            outputs.append(
                OutputFile(
                    filename=f"{stem}-{page_range.label}.pdf",
                    data=_extract(document, first, last),
                    page_count=page_range.page_count,
                )
            )

    return outputs


def split_every_page(source: SourcePdf) -> list[OutputFile]:
    """One output file per page."""
    stem = stem_of(source.name)
    outputs: list[OutputFile] = []

    with open_pdf(source) as document:
        # Zero-padded so a 12-page document sorts as 01, 02 ... 12 rather than
        # 1, 10, 11, 12, 2 in whatever the user unzips it with.
        width = len(str(document.page_count))
        for index in range(document.page_count):
            outputs.append(
                OutputFile(
                    filename=f"{stem}-page-{index + 1:0{width}d}.pdf",
                    data=_extract(document, index, index),
                    page_count=1,
                )
            )

    return outputs


def extract_pages(source: SourcePdf, pages: Sequence[int]) -> OutputFile:
    """A single PDF holding the chosen 1-based pages, in the order given."""
    stem = stem_of(source.name)

    with open_pdf(source) as document:
        part: pymupdf.Document = pymupdf.open()
        try:
            for page in pages:
                part.insert_pdf(document, from_page=page - 1, to_page=page - 1)
            data = bytes(part.tobytes())
            page_count = part.page_count
        finally:
            part.close()

    return OutputFile(filename=f"{stem}-selected-pages.pdf", data=data, page_count=page_count)


@dataclass(frozen=True)
class PlannedPage:
    """One page of the document the user wants, and how it should sit.

    ``number`` is 1-based, as printed on the page. ``rotation`` is clockwise
    degrees *relative to how the page already sits*, so 0 means "leave it".
    """

    number: int
    rotation: int = 0


def apply_page_plan(source: SourcePdf, plan: Sequence[PlannedPage]) -> OutputFile:
    """Rebuild a document from a list of the pages the user wants.

    This one operation covers rotating, reordering, deleting and extracting,
    because from the document's point of view they are the same edit: a page
    that is dropped is simply absent from the plan, the order of the plan is
    the order of the result, and a rotation is a property of the page. Doing it
    any other way would need several passes for an edit the user made in one
    go, each writing a document nobody asked for.
    """
    if not plan:
        raise ProcessingError("A document needs at least one page.")

    stem = stem_of(source.name)

    with open_pdf(source) as document:
        rebuilt: pymupdf.Document = pymupdf.open()
        try:
            for planned in plan:
                index = planned.number - 1
                rebuilt.insert_pdf(document, from_page=index, to_page=index)

                if planned.rotation:
                    page = rebuilt[rebuilt.page_count - 1]
                    # Added to the rotation the page already carries, rather
                    # than replacing it: a scan that arrives at 90 and is
                    # turned once more belongs at 180, not at 90.
                    page.set_rotation((page.rotation + planned.rotation) % 360)

            data = bytes(rebuilt.tobytes())
            page_count = rebuilt.page_count
        finally:
            rebuilt.close()

    return OutputFile(filename=f"{stem}-organised.pdf", data=data, page_count=page_count)


def stem_of(filename: str) -> str:
    """The filename without its extension, safe to build new names from."""
    name = safe_download_name(filename)
    stem = name.rsplit(".", 1)[0] if "." in name else name
    return stem[:80] or "document"
