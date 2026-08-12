"""Compression, measured rather than described.

Every assertion here compares real byte counts, because the whole promise of
this tool is a number: how much smaller the file got. A test that only checked
"a PDF came back" would pass on a compressor that did nothing at all - which is
exactly the failure the roadmap warned about.
"""

import io
from functools import cache

import pymupdf
import pytest
from PIL import Image

from app.services.pdf.compress import (
    MINIMUM_SAVED_BYTES,
    CompressionLevel,
    compress,
)
from app.services.pdf.operations import SourcePdf


@cache
def photograph(width: int, height: int) -> bytes:
    """A JPEG with enough detail that it cannot be squeezed to nothing.

    A flat colour compresses to almost nothing whatever we do to it, so a test
    built on one would report huge savings from every level and prove nothing.
    Noise is generated in Pillow rather than pixel by pixel in Python, which is
    the difference between this file taking one second and taking fifteen.
    """
    image = Image.effect_noise((width, height), 64).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=95)
    return buffer.getvalue()


@cache
def scanned_pdf(pages: int = 2, width: int = 1600, height: int = 2200) -> bytes:
    """A PDF of full-page photographs, as a phone or a scanner produces."""
    picture = photograph(width, height)
    with pymupdf.open() as document:
        for _ in range(pages):
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, stream=picture)
        return bytes(document.tobytes(deflate=True))


@cache
def text_pdf(pages: int = 30) -> bytes:
    """A PDF that is nothing but text, already packed as tightly as it goes.

    Saved with the same settings the compressor itself uses, which is the point:
    a *carelessly* built text PDF has plenty to give - the first version of this
    fixture lost 92% to lossless tidying alone, which is Basic doing its job -
    so it proves nothing about a file with nothing left in it. This one is what
    a text document looks like after any competent producer has written it.
    """
    with pymupdf.open() as document:
        for number in range(pages):
            page = document.new_page()
            for line in range(40):
                page.insert_text((72, 72 + line * 16), f"Page {number} line {line}", fontsize=11)
        return bytes(
            document.tobytes(
                garbage=4, clean=True, deflate=True, deflate_images=True, deflate_fonts=True
            )
        )


# --- Making files smaller ----------------------------------------------


@pytest.mark.parametrize("level", [CompressionLevel.BALANCED, CompressionLevel.STRONG])
def test_a_scanned_pdf_actually_gets_smaller(level: CompressionLevel) -> None:
    original = scanned_pdf()

    outcome = compress(SourcePdf("scan.pdf", original), level)

    assert outcome.shrank
    assert outcome.output is not None
    assert len(outcome.output.data) < len(original)
    # The reported size is the size of the bytes that came back, not a guess.
    assert outcome.final_size == len(outcome.output.data)
    assert outcome.saved_bytes == len(original) - len(outcome.output.data)


def test_strong_gets_further_than_balanced() -> None:
    original = scanned_pdf()

    balanced = compress(SourcePdf("scan.pdf", original), CompressionLevel.BALANCED)
    strong = compress(SourcePdf("scan.pdf", original), CompressionLevel.STRONG)

    assert strong.final_size < balanced.final_size


def test_every_page_survives_compression() -> None:
    # Losing a page would be a spectacular way to save space.
    outcome = compress(SourcePdf("scan.pdf", scanned_pdf(pages=4)), CompressionLevel.STRONG)

    assert outcome.output is not None
    assert outcome.output.page_count == 4
    with pymupdf.open(stream=outcome.output.data, filetype="pdf") as result:
        assert result.page_count == 4


def test_text_is_left_alone_even_at_the_strongest_level() -> None:
    """The promise the levels are built on: images get worse, text does not."""
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "Legible after compression", fontsize=14)
        page.insert_image(pymupdf.Rect(72, 200, 520, 700), stream=photograph(1200, 1400))
        original = bytes(document.tobytes(deflate=True))

    outcome = compress(SourcePdf("mixed.pdf", original), CompressionLevel.STRONG)

    assert outcome.output is not None
    with pymupdf.open(stream=outcome.output.data, filetype="pdf") as result:
        assert "Legible after compression" in result[0].get_text()


# --- Saying so when it cannot ------------------------------------------


def test_a_text_only_pdf_reports_that_it_cannot_shrink() -> None:
    original = text_pdf()

    outcome = compress(SourcePdf("notes.pdf", original), CompressionLevel.STRONG)

    assert not outcome.shrank
    assert outcome.output is None
    # And the sizes still add up, so the UI has something true to show.
    assert outcome.final_size == outcome.original_size == len(original)
    assert outcome.saved_bytes == 0
    assert outcome.saved_fraction == 0.0


def test_a_saving_too_small_to_notice_is_not_called_a_saving() -> None:
    """A few bytes off a document is not worth a second copy of it.

    Without a floor in bytes, a percentage gate alone calls a 70-byte saving on
    a tiny file a 5% success and puts a duplicate in the user's list for it.
    """
    original = text_pdf(pages=1)

    outcome = compress(SourcePdf("one-page.pdf", original), CompressionLevel.BASIC)

    assert len(original) < MINIMUM_SAVED_BYTES  # the premise of this test
    assert not outcome.shrank


def test_compressing_twice_does_not_pretend_the_second_run_helped() -> None:
    once = compress(SourcePdf("scan.pdf", scanned_pdf()), CompressionLevel.STRONG)
    assert once.output is not None

    twice = compress(SourcePdf("scan-compressed.pdf", once.output.data), CompressionLevel.STRONG)

    assert not twice.shrank


def test_the_result_is_never_larger_than_the_original() -> None:
    """Compression that inflates a file must not be reported as a success.

    PyMuPDF can legitimately produce a bigger file - re-encoding an image that
    was already well packed costs more than it saves - and returning that under
    the name "compressed" is the lie this whole module exists to avoid.
    """
    for original in (text_pdf(), scanned_pdf(), text_pdf(pages=1)):
        outcome = compress(SourcePdf("x.pdf", original), CompressionLevel.STRONG)
        assert outcome.final_size <= len(original)


# --- Naming -------------------------------------------------------------


def test_the_result_is_named_after_the_original() -> None:
    outcome = compress(SourcePdf("Quarterly Report.pdf", scanned_pdf()), CompressionLevel.STRONG)

    assert outcome.output is not None
    assert outcome.output.filename == "Quarterly Report-compressed.pdf"
