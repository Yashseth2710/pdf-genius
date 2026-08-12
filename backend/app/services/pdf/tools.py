"""The tools as the API offers them.

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
from app.services.files.validation import EXTENSIONS, IMAGE_TYPES, PDF
from app.services.jobs import JobService
from app.services.pdf import images, operations
from app.services.pdf.compress import CompressionLevel, CompressionOutcome
from app.services.pdf.compress import compress as compress_pdf
from app.services.pdf.images import Orientation, PageSize, SourceImage
from app.services.pdf.operations import OutputFile, PlannedPage, SourcePdf
from app.services.pdf.ranges import parse_page_numbers, parse_page_ranges
from app.services.storage.base import Storage

logger = logging.getLogger(__name__)

# The extension each accepted image type is opened as. Taken from the same
# table the uploader names files with, so the two cannot drift apart.
_IMAGE_EXTENSIONS = {mime: EXTENSIONS[mime] for mime in IMAGE_TYPES}


@dataclass(frozen=True)
class ToolResult:
    """What a finished tool run produced: the job, and the documents it made.

    A list even when there is one: a split into twelve pages produces twelve
    documents, and giving the caller a different shape depending on how many
    came out only pushes the branching outwards.
    """

    job: ProcessingJob
    outputs: list[Document]


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
            document = self._store(user, output, filename=output_name)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, [document])

    # --- Split ---------------------------------------------------------

    def split_by_ranges(
        self, *, user: User, document_id: uuid.UUID, ranges_spec: str
    ) -> ToolResult:
        """One document per range, in the order the ranges were asked for."""
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
            stored = self._store_all(user, outputs)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, stored)

    def split_every_page(self, *, user: User, document_id: uuid.UUID) -> ToolResult:
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)
        page_count = self._page_count(document, source)

        if page_count < 2:
            # Splitting a one-page PDF just copies it, which is a waste of
            # everyone's time. Say so instead.
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
            stored = self._store_all(user, outputs)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, stored)

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
            stored = self._store(user, output, filename=output.filename)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, [stored])

    # --- Organise -------------------------------------------------------

    def organise(
        self,
        *,
        user: User,
        document_id: uuid.UUID,
        plan: Sequence[PlannedPage],
        output_name: str | None = None,
    ) -> ToolResult:
        """Rebuild a document from the pages the user kept, in their order."""
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)
        page_count = self._page_count(document, source)

        self._check_plan(plan, page_count)

        job = self.jobs.start(
            user=user,
            operation=OperationType.ORGANISE,
            document_id=document.id,
            options={
                "pages": [
                    {"number": planned.number, "rotation": planned.rotation} for planned in plan
                ],
                "source_page_count": page_count,
            },
        )
        try:
            output = operations.apply_page_plan(source, plan)
            stored = self._store(user, output, filename=output_name or output.filename)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, [stored])

    def _check_plan(self, plan: Sequence[PlannedPage], page_count: int) -> None:
        """Refuse a plan the document cannot satisfy.

        Checked before a job is started: a request that names page 40 of a
        20-page document never began processing, so recording it as a failed
        job would put noise in the user's history.
        """
        if not plan:
            raise ProcessingError("Keep at least one page.")

        # A page may legitimately appear twice - duplicating a page is a real
        # thing to want - so the cap is on the size of the result.
        if len(plan) > self.settings.max_organise_pages:
            raise ProcessingError(
                f"That would produce {len(plan)} pages, and the limit is "
                f"{self.settings.max_organise_pages}."
            )

        for planned in plan:
            if planned.number < 1 or planned.number > page_count:
                raise ProcessingError(
                    f"There is no page {planned.number}: the document has {page_count} "
                    f"{'page' if page_count == 1 else 'pages'}."
                )
            if planned.rotation % 90 != 0:
                raise ProcessingError("Pages can only be turned in quarter turns.")

    # --- Compress -------------------------------------------------------

    def compress(
        self, *, user: User, document_id: uuid.UUID, level: CompressionLevel
    ) -> tuple[ToolResult, CompressionOutcome]:
        """Make a PDF smaller, and report what that actually came to.

        Returns no output document when the file could not be made meaningfully
        smaller. The job still completes: it did everything it was asked to,
        and the answer - that there is nothing left to take out - is a real
        result rather than a failure. Storing a same-sized copy instead would
        put a second, pointless document in the user's list and let us call it
        a success.
        """
        document = self.documents.get_owned(document_id, user)
        source = self._as_source(document)

        job = self.jobs.start(
            user=user,
            operation=OperationType.COMPRESS,
            document_id=document.id,
            options={"level": level.value},
        )
        try:
            outcome = compress_pdf(source, level)
            stored = (
                [self._store(user, outcome.output, filename=outcome.output.filename)]
                if outcome.output is not None
                else []
            )
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        self.jobs.complete(
            job,
            outputs=stored,
            # Measured on the bytes that came out, never estimated from the
            # level. Stored so a reload does not lose the only number that says
            # whether this was worth doing.
            result={
                "original_size": outcome.original_size,
                "final_size": outcome.final_size,
                "saved_bytes": outcome.saved_bytes,
                "saved_percent": round(outcome.saved_fraction * 100, 1),
                "shrank": outcome.shrank,
            },
        )
        return ToolResult(job=job, outputs=stored), outcome

    # --- Convert --------------------------------------------------------

    def images_to_pdf(
        self,
        *,
        user: User,
        document_ids: Sequence[uuid.UUID],
        page_size: PageSize,
        orientation: Orientation,
        output_name: str,
    ) -> ToolResult:
        """Bind several images into one PDF, one page each, in the order given."""
        if not document_ids:
            raise ProcessingError("Choose at least one image.")

        if len(document_ids) > self.settings.max_images_per_pdf:
            raise ProcessingError(
                f"You can combine up to {self.settings.max_images_per_pdf} images at once."
            )

        sources = [
            self._as_image(self.documents.get_owned(document_id, user))
            for document_id in document_ids
        ]

        total_bytes = sum(len(source.data) for source in sources)
        if total_bytes > self.settings.max_images_total_bytes:
            raise ProcessingError(
                f"Those images come to more than {self.settings.max_images_total_mb}MB "
                "together. Combine them in smaller batches."
            )

        job = self.jobs.start(
            user=user,
            operation=OperationType.CONVERT,
            options={
                "direction": "images_to_pdf",
                "document_ids": [str(document_id) for document_id in document_ids],
                "page_size": page_size.value,
                "orientation": orientation.value,
            },
        )
        try:
            output = images.images_to_pdf(
                sources,
                page_size=page_size,
                orientation=orientation,
                output_name=output_name,
            )
            stored = self._store(user, output, filename=output_name)
        except Exception as exc:
            self.jobs.fail_from(job, exc)
            raise

        return self._finish(job, [stored])

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

    def _as_image(self, document: Document) -> SourceImage:
        """One of the user's documents as an image input.

        The extension comes from the stored MIME type, which was decided at
        upload by reading the file's leading bytes - never from the filename,
        which the uploader chose.
        """
        extension = _IMAGE_EXTENSIONS.get(document.mime_type)
        if extension is None:
            raise ProcessingError(f"'{document.original_filename}' is not an image.")
        return SourceImage(
            name=document.original_filename,
            data=self.documents.read_bytes(document),
            extension=extension,
        )

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

    def _store(
        self, user: User, output: OutputFile, *, filename: str, mime_type: str = PDF
    ) -> Document:
        return self.documents.store_output(
            user=user,
            data=output.data,
            filename=filename,
            mime_type=mime_type,
            page_count=output.page_count if mime_type == PDF else None,
        )

    def _store_all(self, user: User, outputs: list[OutputFile]) -> list[Document]:
        """Save every produced file as a document in its own right.

        Not an archive. A zip cannot be previewed, merged or organised, so
        bundling a split into one made the result the only dead end in the app.
        Downloading several at once still zips them - on the way out, in
        ``documents.archive``, rather than as something stored.
        """
        if not outputs:
            raise ProcessingError("That selection produced no pages.")

        return [self._store(user, output, filename=output.filename) for output in outputs]

    def _finish(self, job: ProcessingJob, outputs: list[Document]) -> ToolResult:
        self.jobs.complete(job, outputs=outputs)
        return ToolResult(job=job, outputs=outputs)
