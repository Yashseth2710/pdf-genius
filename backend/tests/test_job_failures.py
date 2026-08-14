"""What a failed job tells the person who ran it.

The guarantee being tested is a security one as much as a usability one: a job
that crashes must report something written for a human, and must not leak the
exception it actually hit. A `psycopg.OperationalError` carrying a connection
string, or an `OSError` carrying a storage path, is exactly the sort of thing
that ends up in a screenshot on a forum.
"""

from typing import Any

import pytest

from app.core.errors import AppError, ProcessingError
from app.models import ProcessingJob
from app.models.enums import JobStatus, OperationType
from app.services.jobs.service import JobService


class FakeSession:
    """Just enough Session for the failure paths, which only ever commit."""

    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1

    def add(self, _: Any) -> None:  # pragma: no cover - not reached here
        raise AssertionError("the failure paths should not add rows")


@pytest.fixture
def service() -> JobService:
    return JobService(FakeSession())  # type: ignore[arg-type]


def job() -> ProcessingJob:
    return ProcessingJob(operation=OperationType.MERGE, status=JobStatus.PROCESSING)


def test_our_own_errors_keep_their_message(service: JobService) -> None:
    """These were written for the user in the first place."""
    record = job()

    service.fail_from(record, ProcessingError("That PDF is password protected."))

    assert record.status is JobStatus.FAILED
    assert record.error_message == "That PDF is password protected."


def test_an_unexpected_error_says_nothing_about_itself(service: JobService) -> None:
    record = job()
    leaky = RuntimeError("psycopg.OperationalError: password authentication failed for user 'app'")

    service.fail_from(record, leaky)

    assert record.status is JobStatus.FAILED
    assert record.error_message == "Something went wrong while processing this document."
    assert "psycopg" not in (record.error_message or "")
    assert "password" not in (record.error_message or "")


@pytest.mark.parametrize(
    "exc",
    [
        OSError("[Errno 13] Permission denied: '/srv/storage/documents/secret.pdf'"),
        KeyError("AWS_SECRET_ACCESS_KEY"),
        ValueError("invalid literal for int() with base 10: 'x'"),
    ],
)
def test_no_kind_of_internal_failure_leaks(service: JobService, exc: Exception) -> None:
    record = job()

    service.fail_from(record, exc)

    assert record.error_message == "Something went wrong while processing this document."


def test_a_very_long_message_is_cut_to_fit_the_column(service: JobService) -> None:
    """error_message is 500 characters. A message that overflows it would fail
    the insert, turning a handled failure into an unhandled one."""
    record = job()

    service.fail(record, "x" * 900)

    assert record.error_message is not None
    assert len(record.error_message) == 500


def test_failing_records_when_it_happened(service: JobService) -> None:
    record = job()

    service.fail(record, "No good.")

    assert record.completed_at is not None


def test_every_error_we_raise_deliberately_is_treated_as_ours() -> None:
    """`fail_from` branches on AppError, so a new subclass must inherit that
    behaviour without anyone remembering to add it here."""
    session = FakeSession()
    service = JobService(session)  # type: ignore[arg-type]

    class NewKindOfError(AppError):
        message = "A tidy explanation."

    record = job()
    service.fail_from(record, NewKindOfError())

    assert record.error_message == "A tidy explanation."
