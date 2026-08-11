"""Turning "1-3, 5, 8-10" into page ranges.

This is the one place in the app where a user types free text that decides what
happens to their document, so every rejection says what was wrong with *their*
input rather than "invalid format". Pages are 1-based here, as written on the
page; the conversion to PyMuPDF's 0-based indices happens at the point of use.
"""

import re
from dataclasses import dataclass

from fastapi import status

from app.core.errors import AppError

# One item: a number, or two numbers with a hyphen between them. Spaces around
# the hyphen are allowed, because people type "1 - 3".
_ITEM = re.compile(r"^(\d{1,6})(?:\s*-\s*(\d{1,6}))?$")

MAX_ITEMS = 200


class PageRangeError(AppError):
    """The page selection could not be understood or does not fit the document."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "INVALID_PAGE_RANGE"
    message = "That page selection could not be understood."


@dataclass(frozen=True)
class PageRange:
    """An inclusive, 1-based span of pages."""

    start: int
    end: int

    @property
    def is_single(self) -> bool:
        return self.start == self.end

    @property
    def label(self) -> str:
        """How this range is written in an output filename."""
        return str(self.start) if self.is_single else f"{self.start}-{self.end}"

    def indices(self) -> tuple[int, int]:
        """The same span as PyMuPDF wants it: 0-based and inclusive."""
        return self.start - 1, self.end - 1

    @property
    def page_count(self) -> int:
        return self.end - self.start + 1


def parse_page_ranges(spec: str, page_count: int) -> list[PageRange]:
    """Parse a range specification against a document of ``page_count`` pages.

    Ranges are returned in the order they were written, and are allowed to
    overlap or repeat: each one becomes its own output file, so asking for
    "1-3, 1-3" twice is a strange request but not an invalid one.
    """
    items = [item.strip() for item in spec.split(",")]
    items = [item for item in items if item]

    if not items:
        raise PageRangeError("Enter at least one page or range, for example 1-3, 5.")

    if len(items) > MAX_ITEMS:
        raise PageRangeError(f"That is more than {MAX_ITEMS} ranges. Split it into smaller jobs.")

    ranges: list[PageRange] = []
    for item in items:
        match = _ITEM.match(item)
        if match is None:
            raise PageRangeError(
                f"'{item}' is not a page or a range. Use numbers like 5, or ranges like 8-10."
            )

        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) is not None else start

        if start == 0 or end == 0:
            raise PageRangeError("Pages are numbered from 1, so there is no page 0.")

        if start > end:
            raise PageRangeError(
                f"'{item}' runs backwards. Write the lower page first, as {end}-{start}."
            )

        if end > page_count:
            raise PageRangeError(
                f"'{item}' goes past the end of the document, which has {page_count} "
                f"{'page' if page_count == 1 else 'pages'}."
            )

        ranges.append(PageRange(start=start, end=end))

    return ranges


def parse_page_numbers(pages: list[int], page_count: int) -> list[int]:
    """Validate an explicit list of page numbers, keeping the order given.

    Duplicates are dropped rather than rejected: selecting the same page twice
    in a grid is a slip, not an instruction to include it twice.
    """
    if not pages:
        raise PageRangeError("Select at least one page.")

    seen: set[int] = set()
    ordered: list[int] = []
    for page in pages:
        if page < 1:
            raise PageRangeError("Pages are numbered from 1, so there is no page 0.")
        if page > page_count:
            raise PageRangeError(
                f"There is no page {page}: the document has {page_count} "
                f"{'page' if page_count == 1 else 'pages'}."
            )
        if page not in seen:
            seen.add(page)
            ordered.append(page)

    return ordered
