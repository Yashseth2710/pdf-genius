"""Merging and splitting.

Every assertion reopens the produced bytes and looks at what is actually in
them. A merge that returns a plausible-looking PDF with the pages in the wrong
order would pass any test that only counted them, so page identity is checked
by writing a marker onto each page and reading it back.
"""

import pymupdf
import pytest

from app.core.errors import InvalidFileError, ProcessingError
from app.services.pdf import operations
from app.services.pdf.operations import PlannedPage, SourcePdf
from app.services.pdf.ranges import PageRange


def make_pdf(labels: list[str]) -> bytes:
    """A PDF with one page per label, each stamped with its own text."""
    with pymupdf.open() as document:
        for label in labels:
            page = document.new_page()
            page.insert_text((72, 72), label, fontsize=24)
        return bytes(document.tobytes())


def labels_in(data: bytes) -> list[str]:
    """The stamped text of each page, in order."""
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [page.get_text().strip() for page in document]


def numbered(prefix: str, count: int) -> bytes:
    return make_pdf([f"{prefix}{index}" for index in range(1, count + 1)])


def source(name: str, data: bytes) -> SourcePdf:
    return SourcePdf(name=name, data=data)


# --- Merge -------------------------------------------------------------


def test_merge_keeps_every_page() -> None:
    result = operations.merge(
        [source("a.pdf", numbered("A", 3)), source("b.pdf", numbered("B", 2))]
    )

    assert result.page_count == 5
    assert len(labels_in(result.data)) == 5


def test_merge_keeps_the_order_it_was_given() -> None:
    # The order is what the user dragged the files into, so it is the one
    # thing a merge must not quietly decide for itself.
    result = operations.merge(
        [source("b.pdf", numbered("B", 2)), source("a.pdf", numbered("A", 2))]
    )

    assert labels_in(result.data) == ["B1", "B2", "A1", "A2"]


def test_merge_accepts_the_same_document_twice() -> None:
    # Merging a cover page onto both ends of a report is a real thing to want.
    same = numbered("A", 1)
    result = operations.merge([source("a.pdf", same), source("a.pdf", same)])

    assert labels_in(result.data) == ["A1", "A1"]


def test_merge_handles_single_page_inputs() -> None:
    result = operations.merge(
        [source("a.pdf", numbered("A", 1)), source("b.pdf", numbered("B", 1))]
    )

    assert labels_in(result.data) == ["A1", "B1"]


def test_merge_handles_a_long_document() -> None:
    result = operations.merge(
        [source("long.pdf", numbered("L", 120)), source("short.pdf", numbered("S", 1))]
    )

    assert result.page_count == 121


def test_merge_refuses_a_single_file() -> None:
    with pytest.raises(ProcessingError, match="at least two"):
        operations.merge([source("a.pdf", numbered("A", 1))])


def test_merge_names_the_file_that_could_not_be_opened() -> None:
    # Naming it matters: with twenty inputs, "a file was corrupt" is useless.
    with pytest.raises(InvalidFileError, match=r"'broken\.pdf'"):
        operations.merge(
            [source("fine.pdf", numbered("A", 1)), source("broken.pdf", b"%PDF-1.7\nnonsense")]
        )


def test_merge_output_is_a_readable_pdf() -> None:
    result = operations.merge(
        [source("a.pdf", numbered("A", 1)), source("b.pdf", numbered("B", 1))]
    )

    assert result.data.startswith(b"%PDF-")
    assert result.filename == "merged.pdf"


# --- Split by ranges ---------------------------------------------------


def test_split_by_ranges_puts_the_right_pages_in_each_file() -> None:
    outputs = operations.split_by_ranges(
        source("report.pdf", numbered("P", 10)),
        [PageRange(1, 3), PageRange(5, 5), PageRange(8, 10)],
    )

    assert [labels_in(item.data) for item in outputs] == [
        ["P1", "P2", "P3"],
        ["P5"],
        ["P8", "P9", "P10"],
    ]


def test_split_by_ranges_names_files_after_the_pages_they_hold() -> None:
    outputs = operations.split_by_ranges(
        source("report.pdf", numbered("P", 10)), [PageRange(1, 3), PageRange(5, 5)]
    )

    assert [item.filename for item in outputs] == ["report-1-3.pdf", "report-5.pdf"]


def test_split_by_ranges_reports_the_page_count_of_each_part() -> None:
    outputs = operations.split_by_ranges(source("report.pdf", numbered("P", 10)), [PageRange(2, 6)])

    assert outputs[0].page_count == 5


def test_overlapping_ranges_each_get_their_own_file() -> None:
    outputs = operations.split_by_ranges(
        source("report.pdf", numbered("P", 5)), [PageRange(1, 3), PageRange(2, 4)]
    )

    assert [labels_in(item.data) for item in outputs] == [
        ["P1", "P2", "P3"],
        ["P2", "P3", "P4"],
    ]


# --- Split every page --------------------------------------------------


def test_every_page_produces_one_file_per_page() -> None:
    outputs = operations.split_every_page(source("report.pdf", numbered("P", 4)))

    assert len(outputs) == 4
    assert [labels_in(item.data) for item in outputs] == [["P1"], ["P2"], ["P3"], ["P4"]]


def test_every_page_pads_numbers_so_they_sort_correctly() -> None:
    # Without padding a file manager shows 1, 10, 11, 2 - which looks broken.
    outputs = operations.split_every_page(source("report.pdf", numbered("P", 12)))

    assert outputs[0].filename == "report-page-01.pdf"
    assert outputs[11].filename == "report-page-12.pdf"


def test_every_page_of_a_single_page_document_is_that_one_page() -> None:
    outputs = operations.split_every_page(source("one.pdf", numbered("P", 1)))

    assert len(outputs) == 1
    assert outputs[0].filename == "one-page-1.pdf"


# --- Extract selected pages --------------------------------------------


def test_extract_returns_one_file_holding_the_chosen_pages() -> None:
    result = operations.extract_pages(source("report.pdf", numbered("P", 10)), [2, 7, 9])

    assert labels_in(result.data) == ["P2", "P7", "P9"]
    assert result.page_count == 3


def test_extract_respects_the_order_of_the_selection() -> None:
    result = operations.extract_pages(source("report.pdf", numbered("P", 5)), [4, 1])

    assert labels_in(result.data) == ["P4", "P1"]


def test_extract_names_the_output_after_the_source() -> None:
    result = operations.extract_pages(source("report.pdf", numbered("P", 5)), [1])

    assert result.filename == "report-selected-pages.pdf"


# --- Page plans --------------------------------------------------------


def rotations_in(data: bytes) -> list[int]:
    """How each page of the produced document sits, in order."""
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [page.rotation for page in document]


def plan(*pages: int | tuple[int, int]) -> list[PlannedPage]:
    """Shorthand: plan(3, (1, 90)) keeps page 3, then page 1 turned right."""
    return [
        PlannedPage(number=page[0], rotation=page[1])
        if isinstance(page, tuple)
        else PlannedPage(number=page)
        for page in pages
    ]


def test_a_plan_keeps_only_the_pages_it_names() -> None:
    # Deleting a page is that page being absent from the plan.
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 5)), plan(1, 2, 4, 5))

    assert labels_in(result.data) == ["P1", "P2", "P4", "P5"]
    assert result.page_count == 4


def test_a_plan_reorders_pages_into_the_order_given() -> None:
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 3)), plan(3, 1, 2))

    assert labels_in(result.data) == ["P3", "P1", "P2"]


def test_a_plan_rotates_the_pages_it_marks() -> None:
    result = operations.apply_page_plan(
        source("report.pdf", numbered("P", 3)), plan(1, (2, 90), (3, 180))
    )

    assert rotations_in(result.data) == [0, 90, 180]


def test_rotation_adds_to_how_a_page_already_sits() -> None:
    # A scan that arrives at 90 and is turned once more belongs at 180.
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "P1", fontsize=24)
        page.set_rotation(90)
        sideways = bytes(document.tobytes())

    result = operations.apply_page_plan(source("scan.pdf", sideways), plan((1, 90)))

    assert rotations_in(result.data) == [180]


def test_rotation_wraps_rather_than_running_past_a_full_turn() -> None:
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "P1", fontsize=24)
        page.set_rotation(270)
        sideways = bytes(document.tobytes())

    result = operations.apply_page_plan(source("scan.pdf", sideways), plan((1, 180)))

    assert rotations_in(result.data) == [90]


def test_rotating_moves_the_page_without_losing_its_content() -> None:
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 2)), plan((1, 90), 2))

    assert labels_in(result.data) == ["P1", "P2"]


def test_a_plan_can_do_all_three_things_at_once() -> None:
    # The reason this is one operation rather than three: the user turned a
    # page, moved it and dropped another, and expects one new document.
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 4)), plan((4, 90), 1, 2))

    assert labels_in(result.data) == ["P4", "P1", "P2"]
    assert rotations_in(result.data) == [90, 0, 0]


def test_a_plan_may_repeat_a_page() -> None:
    # Duplicating a page - a cover sheet at both ends - is a real request.
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 3)), plan(1, 2, 1))

    assert labels_in(result.data) == ["P1", "P2", "P1"]


def test_repeating_a_page_does_not_repeat_what_it_contains() -> None:
    """A plan naming one page two hundred times must not write two hundred
    copies of that page's images.

    This is a regression guard with a measurement behind it. The obvious
    implementation - one `insert_pdf` per planned page - re-copies the images
    every time, because PyMuPDF shares objects within a single call and not
    across several. On a 20-page scan built into a 500-page plan that came to a
    941MB file and a 2.5GB peak, which on a free host is not a slow response
    but a killed process.

    Asserted as a ratio rather than a byte count, so it survives a change of
    fixture or a new PyMuPDF: what matters is that the cost of a repeat is the
    page reference, not the picture on it.
    """
    with pymupdf.open() as document:
        page = document.new_page()
        # A block of pseudo-random colour, so the page carries real weight
        # rather than something a compressor can wish away.
        pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 400, 400), False)
        for x in range(0, 400, 3):
            pixmap.set_rect((x, 0, x + 2, 400), ((x * 7) % 256, (x * 31) % 256, (x * 97) % 256))
        page.insert_image(page.rect, pixmap=pixmap)
        heavy = bytes(document.tobytes(deflate=True))

    repeated = operations.apply_page_plan(source("scan.pdf", heavy), plan(*([1] * 200)))

    assert repeated.page_count == 200
    # Two hundred references to one page, so the file stays close to the size
    # of the one page. Ten times the source is generous; the broken version was
    # nearer two hundred times.
    assert len(repeated.data) < len(heavy) * 10


def test_an_empty_plan_is_refused() -> None:
    with pytest.raises(ProcessingError, match="at least one page"):
        operations.apply_page_plan(source("report.pdf", numbered("P", 3)), [])


def test_a_plan_names_its_output_after_the_source() -> None:
    result = operations.apply_page_plan(source("report.pdf", numbered("P", 2)), plan(1))

    assert result.filename == "report-organised.pdf"


# --- Opening sources ---------------------------------------------------


def test_refuses_a_file_that_is_not_a_pdf() -> None:
    with pytest.raises(InvalidFileError, match="could not be opened"):
        operations.open_pdf(source("notes.pdf", b"this is not a pdf at all"))


def test_refuses_a_pdf_with_no_pages() -> None:
    # Written by hand rather than built: PyMuPDF refuses to save a document
    # with zero pages, but it will happily open one, and a file like this can
    # arrive from another tool.
    empty = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n"
        b"trailer<</Root 1 0 R>>\n"
        b"%%EOF\n"
    )

    with pytest.raises(InvalidFileError, match="no pages"):
        operations.open_pdf(source("empty.pdf", empty))


def test_refuses_a_password_protected_pdf() -> None:
    with pymupdf.open() as document:
        document.new_page()
        # PyMuPDF exposes its encryption constants without annotations.
        encryption = pymupdf.PDF_ENCRYPT_AES_256  # type: ignore[attr-defined]
        locked = bytes(document.tobytes(encryption=encryption, user_pw="secret"))

    with pytest.raises(InvalidFileError, match="password protected"):
        operations.open_pdf(source("locked.pdf", locked))


# --- Filenames ---------------------------------------------------------


def test_output_names_never_inherit_a_path_from_the_source() -> None:
    # The source name comes from whatever the user called their upload.
    stem = operations.stem_of("../../etc/passwd.pdf")

    assert "/" not in stem
    assert ".." not in stem


def test_a_source_with_no_extension_still_gives_a_usable_stem() -> None:
    assert operations.stem_of("scan") == "scan"


def test_an_unusable_name_falls_back_rather_than_producing_an_empty_one() -> None:
    assert operations.stem_of("///") == "document"
