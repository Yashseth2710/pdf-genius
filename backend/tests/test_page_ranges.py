"""The page range parser.

This is free text typed by a user that decides what happens to their document,
so the tests care as much about the wording of a rejection as about the parse.
"""

import pytest

from app.services.pdf.ranges import (
    PageRange,
    PageRangeError,
    parse_page_numbers,
    parse_page_ranges,
)


def spans(spec: str, page_count: int = 20) -> list[tuple[int, int]]:
    return [(item.start, item.end) for item in parse_page_ranges(spec, page_count)]


# --- What it accepts ---------------------------------------------------


def test_reads_the_example_from_the_ui() -> None:
    assert spans("1-3, 5, 8-10") == [(1, 3), (5, 5), (8, 10)]


def test_a_single_page_is_a_range_of_one() -> None:
    assert spans("7") == [(7, 7)]


def test_ignores_spacing_people_actually_type() -> None:
    assert spans("  1 - 3 ,   5  ") == [(1, 3), (5, 5)]


def test_ignores_empty_items_from_a_trailing_comma() -> None:
    assert spans("1-2, 4,") == [(1, 2), (4, 4)]


def test_keeps_the_order_it_was_given() -> None:
    # Not sorted: the order is the order the output files come out in.
    assert spans("8-10, 1-3") == [(8, 10), (1, 3)]


def test_allows_a_range_that_covers_the_whole_document() -> None:
    assert spans("1-20") == [(1, 20)]


def test_allows_repeats_because_they_are_odd_rather_than_wrong() -> None:
    assert spans("1-2, 1-2") == [(1, 2), (1, 2)]


# --- What it refuses ---------------------------------------------------


def test_refuses_an_empty_selection() -> None:
    with pytest.raises(PageRangeError, match="at least one page"):
        parse_page_ranges("   ", 10)


def test_refuses_words() -> None:
    with pytest.raises(PageRangeError, match="'all' is not a page"):
        parse_page_ranges("all", 10)


def test_refuses_page_zero_with_an_explanation() -> None:
    with pytest.raises(PageRangeError, match="numbered from 1"):
        parse_page_ranges("0-3", 10)


def test_refuses_a_backwards_range_and_suggests_the_fix() -> None:
    with pytest.raises(PageRangeError, match=r"runs backwards.*5-9"):
        parse_page_ranges("9-5", 10)


def test_refuses_a_range_past_the_end_and_says_how_long_the_document_is() -> None:
    with pytest.raises(PageRangeError, match=r"past the end.*10 pages"):
        parse_page_ranges("8-12", 10)


def test_says_page_not_pages_for_a_one_page_document() -> None:
    with pytest.raises(PageRangeError, match="has 1 page"):
        parse_page_ranges("2", 1)


def test_refuses_an_absurd_number_of_ranges() -> None:
    with pytest.raises(PageRangeError, match="smaller jobs"):
        parse_page_ranges(",".join(["1"] * 300), 10)


def test_refuses_a_number_too_long_to_be_a_page() -> None:
    # Guards the regex itself: without the length cap this is a very large int.
    with pytest.raises(PageRangeError, match="not a page"):
        parse_page_ranges("1234567890", 10)


# --- Range helpers -----------------------------------------------------


def test_indices_convert_to_pymupdfs_zero_based_numbering() -> None:
    assert PageRange(start=1, end=3).indices() == (0, 2)


def test_a_range_knows_how_many_pages_it_covers() -> None:
    assert PageRange(start=8, end=10).page_count == 3
    assert PageRange(start=5, end=5).page_count == 1


def test_labels_read_the_way_they_were_written() -> None:
    assert PageRange(start=5, end=5).label == "5"
    assert PageRange(start=8, end=10).label == "8-10"


# --- Explicit page lists -----------------------------------------------


def test_keeps_selected_pages_in_the_order_given() -> None:
    assert parse_page_numbers([5, 1, 3], 10) == [5, 1, 3]


def test_drops_a_duplicate_rather_than_refusing_it() -> None:
    # Clicking the same page twice in a grid is a slip, not an instruction.
    assert parse_page_numbers([2, 2, 4], 10) == [2, 4]


def test_refuses_an_empty_page_list() -> None:
    with pytest.raises(PageRangeError, match="at least one page"):
        parse_page_numbers([], 10)


def test_refuses_a_page_that_does_not_exist() -> None:
    with pytest.raises(PageRangeError, match="no page 11"):
        parse_page_numbers([11], 10)
