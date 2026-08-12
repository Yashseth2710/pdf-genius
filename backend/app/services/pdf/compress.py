"""Making a PDF smaller — and saying so plainly when it cannot be.

Two different things are called "compressing a PDF", and only one of them is
safe to do to everybody's documents:

* **Structural** work — collecting unreferenced objects, deflating streams,
  subsetting fonts. Lossless: the file that comes out draws exactly the same
  as the one that went in. This is all "Basic" does.
* **Redrawing the images** at a lower resolution and quality. This is where the
  megabytes in a scanned or photo-heavy document actually are, and it is what
  "Balanced" and "Strong" add on top.

Text and vector drawings are never touched at any level. They cost almost
nothing to store, so degrading them would trade legibility for a rounding
error, and "compress" would become a word that makes documents worse.
"""

import logging
from dataclasses import dataclass
from enum import StrEnum

from app.services.pdf.operations import OutputFile, SourcePdf, open_pdf, stem_of

logger = logging.getLogger(__name__)


class CompressionLevel(StrEnum):
    BASIC = "basic"
    BALANCED = "balanced"
    STRONG = "strong"


@dataclass(frozen=True)
class ImageRule:
    """When an image is worth redrawing, and how far to push it.

    ``threshold_dpi`` is the resolution above which an image is considered
    larger than it needs to be on screen or in print; images already below it
    are left exactly as they are rather than being re-encoded for nothing.
    """

    threshold_dpi: int
    target_dpi: int
    quality: int


# Balanced targets 150 DPI, which prints acceptably and is well beyond what a
# screen shows. Strong targets 96 DPI - screen resolution - and accepts visible
# softening in photographs to get the file down.
IMAGE_RULES: dict[CompressionLevel, ImageRule | None] = {
    CompressionLevel.BASIC: None,
    CompressionLevel.BALANCED: ImageRule(threshold_dpi=200, target_dpi=150, quality=80),
    CompressionLevel.STRONG: ImageRule(threshold_dpi=130, target_dpi=96, quality=55),
}

# What counts as having worked. Both gates are needed, because either one alone
# lets through a result the user would not call smaller: a percentage alone
# calls 72 bytes off a small text document a 5% success, and a byte count alone
# calls 40KB off a 200MB scan a win. Below either, the original is kept.
MINIMUM_SAVED_FRACTION = 0.01
MINIMUM_SAVED_BYTES = 10 * 1024


@dataclass(frozen=True)
class CompressionOutcome:
    """What compressing produced, including the case where it produced nothing.

    ``output`` is ``None`` when the file could not be made meaningfully
    smaller. That is a real answer, and a common one: a PDF that is all text,
    or one that has already been through this, has nothing left to give. The
    alternative - handing back a copy that is the same size or larger and
    calling it a success - is a claim the user can check and find false.
    """

    output: OutputFile | None
    original_size: int
    final_size: int

    @property
    def shrank(self) -> bool:
        return self.output is not None

    @property
    def saved_bytes(self) -> int:
        return max(self.original_size - self.final_size, 0)

    @property
    def saved_fraction(self) -> float:
        if self.original_size <= 0:
            return 0.0
        return self.saved_bytes / self.original_size


def compress(source: SourcePdf, level: CompressionLevel) -> CompressionOutcome:
    """Rewrite a PDF as small as the chosen level allows.

    The size reported back is measured on the bytes that came out, never
    predicted from the level. Predicting it is not possible in any honest way:
    the same setting takes 70% off a phone-camera scan and 0% off a text
    document, and the only way to know which one this is, is to do the work.
    """
    original_size = len(source.data)
    rule = IMAGE_RULES[level]

    with open_pdf(source) as document:
        if rule is not None:
            document.rewrite_images(
                dpi_threshold=rule.threshold_dpi,
                dpi_target=rule.target_dpi,
                quality=rule.quality,
                # Bitonal images are left alone: a 1-bit image in a PDF is
                # almost always scanned text, which is exactly what we promised
                # not to make fuzzy.
                bitonal=False,
                set_to_gray=False,
            )
            document.subset_fonts()

        data = bytes(
            document.tobytes(
                # 4 is the most thorough garbage collection PyMuPDF offers: it
                # also merges objects that are duplicates of each other, which
                # is common in a document built by merging.
                garbage=4,
                clean=True,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
            )
        )
        page_count = int(document.page_count)

    final_size = len(data)
    saved = original_size - final_size
    worthwhile = (
        original_size > 0
        and saved >= MINIMUM_SAVED_BYTES
        and saved / original_size >= MINIMUM_SAVED_FRACTION
    )

    if not worthwhile:
        logger.info(
            "Compression at %s left %r at %d bytes (from %d); keeping the original",
            level,
            source.name,
            final_size,
            original_size,
        )
        return CompressionOutcome(
            output=None, original_size=original_size, final_size=original_size
        )

    output = OutputFile(
        filename=f"{stem_of(source.name)}-compressed.pdf",
        data=data,
        page_count=page_count,
    )
    return CompressionOutcome(output=output, original_size=original_size, final_size=final_size)
