"""Turning a chosen date into the range a query can use.

The whole point of these two helpers is that a date range reads to a person the
way it is written: "the 3rd to the 5th" includes the 5th. A naive
``created_at <= 2026-08-05`` means midnight, and silently loses a day of work -
the kind of bug nobody reports because nobody can see it.
"""

from datetime import UTC, datetime, timedelta, timezone

from app.api.v1.jobs import _end_of_day, _start_of_day


def test_a_day_starts_at_midnight() -> None:
    result = _start_of_day(datetime(2026, 8, 5, 14, 30, tzinfo=UTC))

    assert result == datetime(2026, 8, 5, 0, 0, 0, tzinfo=UTC)


def test_a_day_ends_at_the_last_instant_of_it() -> None:
    result = _end_of_day(datetime(2026, 8, 5, 9, 0, tzinfo=UTC))

    assert result is not None
    assert result.date() == datetime(2026, 8, 5).date()
    assert (result.hour, result.minute, result.second) == (23, 59, 59)


def test_a_job_at_the_very_end_of_the_last_day_is_included() -> None:
    """The bug this exists to prevent: an entry from 11pm falling out of range."""
    end = _end_of_day(datetime(2026, 8, 5, tzinfo=UTC))
    late_that_evening = datetime(2026, 8, 5, 23, 15, tzinfo=UTC)

    assert end is not None
    assert late_that_evening <= end


def test_the_first_moment_of_the_first_day_is_included() -> None:
    start = _start_of_day(datetime(2026, 8, 3, tzinfo=UTC))
    just_after_midnight = datetime(2026, 8, 3, 0, 0, 1, tzinfo=UTC)

    assert start is not None
    assert just_after_midnight >= start


def test_a_date_with_no_timezone_is_read_as_utc() -> None:
    # The column stores UTC, so a bare date has to mean UTC or the range slides
    # by however many hours the server happens to be offset.
    result = _start_of_day(datetime(2026, 8, 5))

    assert result is not None
    assert result.tzinfo is not None
    assert result.utcoffset() == timedelta(0)


def test_a_date_that_carries_a_timezone_keeps_it() -> None:
    # Someone in Singapore asking for "the 5th" means their 5th.
    singapore = timezone(timedelta(hours=8))
    result = _start_of_day(datetime(2026, 8, 5, 14, 0, tzinfo=singapore))

    assert result is not None
    assert result.utcoffset() == timedelta(hours=8)
    assert result.hour == 0


def test_no_date_means_no_bound() -> None:
    assert _start_of_day(None) is None
    assert _end_of_day(None) is None
