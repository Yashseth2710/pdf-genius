"""Merge and split as the API offers them.

This layer sits between the routes and the pure functions in ``operations``:
it loads the user's documents, enforces the limits, records a job, stores the
result as a new document, and makes sure a failure is written to the job row
before it is raised.

Every tool added later follows the same five steps, which is the point of doing
it carefully here.
"""

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ProcessingError
from app.models import Document, ProcessingJob, User
from app.models.enums import OperationType
from app.services.files.service import DocumentService
from app.services.files.validation import PDF, ZIP
from app.services.jobs import JobService
from app.services.pdf import operations
from app.services.pdf.operations import OutputFile, SourcePdf
from app.services.pdf.ranges import parse_page_numbers, parse_page_ranges
from app.services.storage.base import Storage

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ToolResult:
    """What a finished tool run produced: the job, and the document it made."""

    job: ProcessingJob
    output: Document


class ToolService:
    def __init__(self, db: Session, storage: Storage, settings: Settings) -> None:
        self.db = db
        self.documents = DocumentService(db, storage)
        self.jobs = JobService(db)
        self.settings = settings

    # --- Merge ---------------------------------------------------------

    def merge(
        self, *, user: User, document_ids: Sequence[uuid.UUID], output_name: str
    ) -> ToolResult:
        """Join several PDFs into one, in the order the ids were given."""
        sources = self._load_pdfs(user, document_ids)

        total_bytes = sum(len(source.data) for source in sources)
        if total_bytes > self.settings.max_merge_total_bytes:
            # Checked after loading rather than before, because the sizes come
            # from the rows we just fetched - and refusing here still costs far
            # less than letting PyMuPDF hold it all at once.
            raise ProcessingError(
                f"Those files come to more than {self.settings.max_merge_total_mb}MB together. "
                "Merge them in smaller batches."
            )

        job = self.jobs.start(
            user=user,
            operation=OperationType.MERGE,
            options={
                "document_ids": [str(document_id) for document_id in document_ids],
                "output_name": output_name,
            },
        )

        try:
            output = operations.merge(sources)
            document = self._store(user, output, filename=output_name, mime_type=PDF)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        self.jobs.complete(job, output_key=document.storage_path)
        return ToolResult(job=job, output=document)

    # --- Split ---------------------------------------------------------

    def split_by_ranges(
        self, *, user: User, document_id: uuid.UUID, ranges_spec: str
    ) -> ToolResult:
        """One output file per range; a zip when there is more than one."""
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)
        page_count = self._page_count(document, source)

        ranges = parse_page_ranges(ranges_spec, page_count)
        self._check_output_count(len(ranges))

        job = self.jobs.start(
            user=user,
            operation=OperationType.SPLIT,
            document_id=document.id,
            options={"mode": "ranges", "ranges": ranges_spec},
        )
        try:
            outputs = operations.split_by_ranges(source, ranges)
            stored = self._store_many(user, outputs, source_name=document.original_filename)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        self.jobs.complete(job, output_key=stored.storage_path)
        return ToolResult(job=job, output=stored)

    def split_every_page(self, *, user: User, document_id: uuid.UUID) -> ToolResult:
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)
        page_count = self._page_count(document, source)

        if page_count < 2:
            # Splitting a one-page PDF returns the same document in a zip,
            # which is a waste of everyone's time. Say so instead.
            raise ProcessingError("That document has only one page, so there is nothing to split.")

        self._check_output_count(page_count)

        job = self.jobs.start(
            user=user,
            operation=OperationType.SPLIT,
            document_id=document.id,
            options={"mode": "every_page"},
        )
        try:
            outputs = operations.split_every_page(source)
            stored = self._store_many(user, outputs, source_name=document.original_filename)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        self.jobs.complete(job, output_key=stored.storage_path)
        return ToolResult(job=job, output=stored)

    def extract_pages(self, *, user: User, document_id: uuid.UUID, pages: list[int]) -> ToolResult:
        """Pull selected pages into a single new PDF."""
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)
        page_count = self._page_count(document, source)

        chosen = parse_page_numbers(pages, page_count)

        job = self.jobs.start(
            user=user,
            operation=OperationType.SPLIT,
            document_id=document.id,
            options={"mode": "pages", "pages": chosen},
        )
        try:
            output = operations.extract_pages(source, chosen)
            stored = self._store(user, output, filename=output.filename, mime_type=PDF)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        self.jobs.complete(job, output_key=stored.storage_path)
        return ToolResult(job=job, output=stored)

    # --- Shared ---------------------------------------------------------

    def _load_pdfs(self, user: User, document_ids: Sequence[uuid.UUID]) -> list[SourcePdf]:
        """Fetch each document, in the order asked for, refusing anything else.

        Ownership is checked per document by ``get_owned``, so a merge cannot
        be used to reach into someone else's file by listing its id alongside
        one of your own.
        """
        if len(document_ids) < 2:
            raise ProcessingError("Choose at least two PDFs to merge.")

        if len(document_ids) > self.settings.max_merge_files:
            raise ProcessingError(
                f"You can merge up to {self.settings.max_merge_files} files at once."
            )

        sources: list[SourcePdf] = []
        for document_id in document_ids:
            document = self.documents.get_owned(document_id, user)
            sources.append(self._as_source(document))
        return sources

    def _as_source(self, document: Document) -> SourcePdf:
        if document.mime_type != PDF:
            raise ProcessingError(
                f"'{document.original_filename}' is not a PDF. These tools work on PDFs only."
            )
        return SourcePdf(name=document.original_filename, data=self.documents.read_bytes(document))

    def _page_count(self, document: Document, source: SourcePdf) -> int:
        """The page count, preferring the stored one but never trusting it blindly.

        The column is filled in at upload time. If it is missing - an older row,
        or a file that changed on disk - the document is opened and counted
        rather than the request failing on a null.
        """
        if document.page_count is not None and document.page_count > 0:
            return document.page_count

        with operations.open_pdf(source) as opened:
            return int(opened.page_count)

    def _check_output_count(self, count: int) -> None:
        if count > self.settings.max_split_outputs:
            raise ProcessingError(
                f"That would produce {count} files, and the limit is "
                f"{self.settings.max_split_outputs}. Split it in smaller pieces."
            )

    def _store(self, user: User, output: OutputFile, *, filename: str, mime_type: str) -> Document:
        return self.documents.store_output(
            user=user,
            data=output.data,
            filename=filename,
            mime_type=mime_type,
            page_count=output.page_count if mime_type == PDF else None,
        )

    def _store_many(self, user: User, outputs: list[OutputFile], *, source_name: str) -> Document:
        """Store one output as a PDF, or several as a single zip.

        A split always produces exactly one document either way, which keeps
        the job's single ``output_path`` honest and means the result can be
        downloaded with the endpoint that already exists.
        """
        if not outputs:
            raise ProcessingError("That selection produced no pages.")

        if len(outputs) == 1:
            return self._store(user, outputs[0], filename=outputs[0].filename, mime_type=PDF)

        stem = operations.stem_of(source_name)
        archive = operations.to_zip(outputs, filename=f"{stem}-split.zip")
        return self._store(user, archive, filename=archive.filename, mime_type=ZIP)
