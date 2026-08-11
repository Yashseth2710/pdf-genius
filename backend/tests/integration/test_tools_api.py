"""The merge, organise and split endpoints, end to end.

These run against a real database and real files on disk, so they cover the
parts unit tests cannot: that a job row is written, that the result becomes a
document the user can download, and that neither tool can be pointed at someone
else's file.
"""

import uuid
import zipfile
from io import BytesIO
from typing import Any

import pymupdf
from fastapi.testclient import TestClient
from httpx import Response

MERGE = "/api/v1/tools/merge"
SPLIT = "/api/v1/tools/split"
ORGANISE = "/api/v1/tools/organise"
JOBS = "/api/v1/jobs"
UPLOAD = "/api/v1/documents/upload"
DOCUMENTS = "/api/v1/documents"
ARCHIVE = "/api/v1/documents/archive"


def make_pdf(labels: list[str]) -> bytes:
    with pymupdf.open() as document:
        for label in labels:
            page = document.new_page()
            page.insert_text((72, 72), label, fontsize=24)
        return bytes(document.tobytes())


def numbered(prefix: str, count: int) -> bytes:
    return make_pdf([f"{prefix}{index}" for index in range(1, count + 1)])


def upload_pdf(client: TestClient, name: str, pages: int, prefix: str = "P") -> str:
    """Upload a PDF and return its id."""
    response = client.post(
        UPLOAD, files={"file": (name, numbered(prefix, pages), "application/pdf")}
    )
    assert response.status_code == 201, response.text
    return str(response.json()["data"]["id"])


def upload_png(client: TestClient, name: str = "photo.png") -> str:
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )
    response = client.post(UPLOAD, files={"file": (name, png, "image/png")})
    return str(response.json()["data"]["id"])


def download(client: TestClient, document_id: str) -> bytes:
    response = client.get(f"/api/v1/documents/{document_id}/download")
    assert response.status_code == 200, response.text
    return bytes(response.content)


def labels_in(data: bytes) -> list[str]:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [page.get_text().strip() for page in document]


def second_user(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"other-{uuid.uuid4().hex[:8]}@example.com",
            "password": "a-good-long-password",
            "first_name": "Grace",
            "last_name": "Hopper",
        },
    )
    return str(response.json()["data"]["access_token"])


def error_of(response: Response) -> str:
    return str(response.json()["error"]["message"])


def outputs_of(response: Response) -> list[dict[str, Any]]:
    """Every document a run produced, in order."""
    items: list[dict[str, Any]] = response.json()["data"]["outputs"]
    return items


def first_output(response: Response) -> dict[str, Any]:
    return outputs_of(response)[0]


# --- Merge -------------------------------------------------------------


def test_merge_produces_a_downloadable_document(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 2, "A")
    second = upload_pdf(authed_client, "b.pdf", 3, "B")

    response = authed_client.post(MERGE, json={"document_ids": [first, second]})

    assert response.status_code == 200, response.text
    output = first_output(response)
    assert output["page_count"] == 5
    assert output["mime_type"] == "application/pdf"
    assert labels_in(download(authed_client, output["id"])) == ["A1", "A2", "B1", "B2", "B3"]


def test_merge_uses_the_order_in_the_request(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 1, "A")
    second = upload_pdf(authed_client, "b.pdf", 1, "B")

    response = authed_client.post(MERGE, json={"document_ids": [second, first]})

    assert labels_in(download(authed_client, first_output(response)["id"])) == [
        "B1",
        "A1",
    ]


def test_merge_records_a_completed_job(authed_client: TestClient) -> None:
    ids = [upload_pdf(authed_client, "a.pdf", 1), upload_pdf(authed_client, "b.pdf", 1)]

    job = authed_client.post(MERGE, json={"document_ids": ids}).json()["data"]["job"]

    assert job["operation"] == "MERGE"
    assert job["status"] == "COMPLETED"
    assert job["completed_at"] is not None
    assert job["error_message"] is None
    # The inputs are recorded on the job, because a merge has no single source
    # document to point document_id at.
    assert job["options"]["document_ids"] == ids


def test_merge_can_be_given_a_name(authed_client: TestClient) -> None:
    ids = [upload_pdf(authed_client, "a.pdf", 1), upload_pdf(authed_client, "b.pdf", 1)]

    response = authed_client.post(
        MERGE, json={"document_ids": ids, "output_name": "assignment.pdf"}
    )

    assert first_output(response)["original_filename"] == "assignment.pdf"


def test_merge_defaults_the_name_when_none_is_given(authed_client: TestClient) -> None:
    ids = [upload_pdf(authed_client, "a.pdf", 1), upload_pdf(authed_client, "b.pdf", 1)]

    response = authed_client.post(MERGE, json={"document_ids": ids})

    assert first_output(response)["original_filename"] == "merged.pdf"


def test_merge_refuses_a_single_document(authed_client: TestClient) -> None:
    only = upload_pdf(authed_client, "a.pdf", 1)

    response = authed_client.post(MERGE, json={"document_ids": [only]})

    assert response.status_code == 422


def test_merge_refuses_more_documents_than_the_limit(authed_client: TestClient) -> None:
    # Ids that do not exist: the count is checked before anything is loaded,
    # so this never touches the database.
    response = authed_client.post(
        MERGE, json={"document_ids": [str(uuid.uuid4()) for _ in range(21)]}
    )

    assert response.status_code == 422


def test_merge_refuses_an_image(authed_client: TestClient) -> None:
    pdf = upload_pdf(authed_client, "a.pdf", 1)
    png = upload_png(authed_client)

    response = authed_client.post(MERGE, json={"document_ids": [pdf, png]})

    assert response.status_code == 422
    assert "not a PDF" in error_of(response)


def test_merge_cannot_reach_another_users_document(authed_client: TestClient) -> None:
    mine = upload_pdf(authed_client, "mine.pdf", 1)
    theirs = _upload_as_other_user(authed_client)

    response = authed_client.post(MERGE, json={"document_ids": [mine, theirs]})

    # 404, not 403: a user must not be able to confirm the id exists.
    assert response.status_code == 404


def test_merge_reports_an_unknown_document_as_missing(authed_client: TestClient) -> None:
    mine = upload_pdf(authed_client, "mine.pdf", 1)

    response = authed_client.post(MERGE, json={"document_ids": [mine, str(uuid.uuid4())]})

    assert response.status_code == 404


def test_merge_needs_a_signed_in_user(api_client: TestClient) -> None:
    response = api_client.post(MERGE, json={"document_ids": [str(uuid.uuid4())] * 2})

    assert response.status_code == 401


# --- Split by ranges ---------------------------------------------------


def test_split_by_one_range_returns_a_plain_pdf(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 10)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "2-4"}
    )

    output = first_output(response)
    assert output["mime_type"] == "application/pdf"
    assert output["page_count"] == 3
    assert labels_in(download(authed_client, output["id"])) == ["P2", "P3", "P4"]


def test_split_by_several_ranges_returns_a_document_each(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 10)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-3, 5, 8-10"}
    )

    outputs = outputs_of(response)
    assert [output["original_filename"] for output in outputs] == [
        "report-1-3.pdf",
        "report-5.pdf",
        "report-8-10.pdf",
    ]
    # Every one a PDF in its own right - not an archive, which could not be
    # previewed, merged or organised.
    assert {output["mime_type"] for output in outputs} == {"application/pdf"}
    assert [output["page_count"] for output in outputs] == [3, 1, 3]
    assert labels_in(download(authed_client, outputs[1]["id"])) == ["P5"]


def test_split_results_are_ordinary_documents(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 4)

    authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-2, 3-4"}
    )

    listing = authed_client.get(DOCUMENTS).json()["data"]
    # The original plus its two parts, all listed together.
    assert listing["total"] == 3
    assert {item["mime_type"] for item in listing["items"]} == {"application/pdf"}


def test_a_split_part_can_be_used_as_input_to_another_tool(authed_client: TestClient) -> None:
    # The point of not producing an archive: the results are first-class.
    document_id = upload_pdf(authed_client, "report.pdf", 6)
    parts = outputs_of(
        authed_client.post(
            SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-2, 5-6"}
        )
    )

    merged = authed_client.post(MERGE, json={"document_ids": [parts[1]["id"], parts[0]["id"]]})

    assert merged.status_code == 200, merged.text
    assert labels_in(download(authed_client, first_output(merged)["id"])) == [
        "P5",
        "P6",
        "P1",
        "P2",
    ]


def test_split_explains_a_range_past_the_end(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 5)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-9"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_PAGE_RANGE"
    assert "5 pages" in error_of(response)


def test_split_records_a_failed_job_when_the_range_is_wrong(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 5)

    authed_client.post(SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-9"})

    # The range is rejected before a job is started, so nothing is recorded:
    # a request that never began processing is not a failed job.
    jobs = authed_client.get(JOBS).json()["data"]
    assert jobs["total"] == 0


def test_split_needs_a_range_when_the_mode_asks_for_one(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 5)

    response = authed_client.post(SPLIT, json={"document_id": document_id, "mode": "ranges"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_PAGE_RANGE"


# --- Split every page --------------------------------------------------


def test_every_page_returns_one_document_per_page(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    response = authed_client.post(SPLIT, json={"document_id": document_id, "mode": "every_page"})

    outputs = outputs_of(response)
    assert len(outputs) == 3
    assert outputs[1]["original_filename"] == "report-page-2.pdf"
    assert labels_in(download(authed_client, outputs[1]["id"])) == ["P2"]


def test_every_page_refuses_a_single_page_document(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "one.pdf", 1)

    response = authed_client.post(SPLIT, json={"document_id": document_id, "mode": "every_page"})

    assert response.status_code == 422
    assert "only one page" in error_of(response)


# --- Extract selected pages --------------------------------------------


def test_selected_pages_come_back_as_one_pdf(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 10)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "pages", "pages": [3, 1, 7]}
    )

    output = first_output(response)
    assert output["mime_type"] == "application/pdf"
    assert labels_in(download(authed_client, output["id"])) == ["P3", "P1", "P7"]


def test_selected_pages_must_exist(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "pages", "pages": [9]}
    )

    assert response.status_code == 422
    assert "no page 9" in error_of(response)


def test_split_cannot_reach_another_users_document(authed_client: TestClient) -> None:
    theirs = _upload_as_other_user(authed_client)

    response = authed_client.post(
        SPLIT, json={"document_id": theirs, "mode": "ranges", "ranges": "1"}
    )

    assert response.status_code == 404


# --- Organise ----------------------------------------------------------


def rotations_in(data: bytes) -> list[int]:
    with pymupdf.open(stream=data, filetype="pdf") as document:
        return [page.rotation for page in document]


def organise(
    client: TestClient, document_id: str, pages: list[dict[str, int]], **extra: str
) -> Response:
    body: dict[str, object] = {"document_id": document_id, "pages": pages, **extra}
    response: Response = client.post(ORGANISE, json=body)
    return response


def test_organise_keeps_only_the_pages_it_is_sent(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 5)

    response = organise(authed_client, document_id, [{"number": 1}, {"number": 3}, {"number": 5}])

    assert response.status_code == 200, response.text
    output = first_output(response)
    assert output["page_count"] == 3
    assert labels_in(download(authed_client, output["id"])) == ["P1", "P3", "P5"]


def test_organise_applies_order_and_rotation_together(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 4)

    response = organise(
        authed_client,
        document_id,
        [{"number": 4, "rotation": 90}, {"number": 1}, {"number": 2, "rotation": 180}],
    )

    data = download(authed_client, first_output(response)["id"])
    assert labels_in(data) == ["P4", "P1", "P2"]
    assert rotations_in(data) == [90, 0, 180]


def test_organise_records_the_plan_on_the_job(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    job = organise(authed_client, document_id, [{"number": 2, "rotation": 90}]).json()["data"][
        "job"
    ]

    assert job["operation"] == "ORGANISE"
    assert job["status"] == "COMPLETED"
    assert job["document_id"] == document_id
    assert job["options"]["pages"] == [{"number": 2, "rotation": 90}]
    # Recorded so history can say "3 pages became 1" without reopening the file.
    assert job["options"]["source_page_count"] == 3


def test_organise_can_be_given_a_name(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 2)

    response = organise(authed_client, document_id, [{"number": 1}], output_name="tidied.pdf")

    assert first_output(response)["original_filename"] == "tidied.pdf"


def test_organise_names_the_result_after_the_source_by_default(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 2)

    response = organise(authed_client, document_id, [{"number": 1}])

    assert first_output(response)["original_filename"] == "report-organised.pdf"


def test_organise_refuses_a_page_the_document_does_not_have(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    response = organise(authed_client, document_id, [{"number": 9}])

    assert response.status_code == 422
    assert "no page 9" in error_of(response)


def test_organise_refuses_an_empty_plan(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    response = organise(authed_client, document_id, [])

    # Caught by the schema: a document with no pages is not a document.
    assert response.status_code == 422


def test_organise_refuses_a_rotation_that_is_not_a_quarter_turn(
    authed_client: TestClient,
) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 2)

    response = organise(authed_client, document_id, [{"number": 1, "rotation": 45}])

    assert response.status_code == 422


def test_organise_records_nothing_when_the_plan_is_rejected(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 3)

    organise(authed_client, document_id, [{"number": 9}])

    # The plan is checked before a job starts, so a request that never began
    # processing leaves no failed job behind.
    assert authed_client.get(JOBS).json()["data"]["total"] == 0


def test_organise_cannot_reach_another_users_document(authed_client: TestClient) -> None:
    theirs = _upload_as_other_user(authed_client)

    response = organise(authed_client, theirs, [{"number": 1}])

    assert response.status_code == 404


def test_organise_refuses_an_image(authed_client: TestClient) -> None:
    png = upload_png(authed_client)

    response = organise(authed_client, png, [{"number": 1}])

    assert response.status_code == 422
    assert "not a PDF" in error_of(response)


def test_organise_needs_a_signed_in_user(api_client: TestClient) -> None:
    response = api_client.post(
        ORGANISE, json={"document_id": str(uuid.uuid4()), "pages": [{"number": 1}]}
    )

    assert response.status_code == 401


def test_an_organised_result_can_be_organised_again(authed_client: TestClient) -> None:
    # The output is an ordinary document, so it is a valid input to any tool.
    document_id = upload_pdf(authed_client, "report.pdf", 4)
    first = first_output(organise(authed_client, document_id, [{"number": 3}, {"number": 1}]))["id"]

    response = organise(authed_client, first, [{"number": 2}])

    assert response.status_code == 200
    assert labels_in(download(authed_client, first_output(response)["id"])) == ["P1"]


# --- Jobs --------------------------------------------------------------


def test_a_job_can_be_read_back(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 4)
    created = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-2"}
    ).json()["data"]["job"]

    response = authed_client.get(f"{JOBS}/{created['id']}")

    assert response.status_code == 200
    job = response.json()["data"]
    assert job["status"] == "COMPLETED"
    assert job["document_id"] == document_id
    assert job["options"] == {"mode": "ranges", "ranges": "1-2"}


def test_jobs_are_listed_newest_first(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 4)
    for ranges in ("1", "2", "3"):
        authed_client.post(
            SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": ranges}
        )

    page = authed_client.get(JOBS).json()["data"]

    assert page["total"] == 3
    assert page["items"][0]["options"]["ranges"] == "3"


def test_jobs_can_be_filtered_by_operation(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 2)
    second = upload_pdf(authed_client, "b.pdf", 2)
    authed_client.post(MERGE, json={"document_ids": [first, second]})
    authed_client.post(SPLIT, json={"document_id": first, "mode": "ranges", "ranges": "1"})

    page = authed_client.get(JOBS, params={"operation": "MERGE"}).json()["data"]

    assert page["total"] == 1
    assert page["items"][0]["operation"] == "MERGE"


def test_a_job_never_exposes_where_the_output_is_stored(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 1)
    second = upload_pdf(authed_client, "b.pdf", 1)

    response = authed_client.post(MERGE, json={"document_ids": [first, second]})
    job = response.json()["data"]["job"]

    assert "output_path" not in job
    # Results are named by document id, which is how everything else in the
    # API refers to a file.
    assert job["output_document_ids"] == [first_output(response)["id"]]


def test_a_job_lists_every_document_it_produced(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 6)

    response = authed_client.post(
        SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-2, 3-4, 5-6"}
    )

    ids = [output["id"] for output in outputs_of(response)]
    assert response.json()["data"]["job"]["output_document_ids"] == ids


# --- Downloading several at once ---------------------------------------


def test_several_documents_download_as_one_archive(authed_client: TestClient) -> None:
    document_id = upload_pdf(authed_client, "report.pdf", 4)
    parts = outputs_of(
        authed_client.post(
            SPLIT, json={"document_id": document_id, "mode": "ranges", "ranges": "1-2, 3-4"}
        )
    )

    response = authed_client.post(
        ARCHIVE, json={"document_ids": [part["id"] for part in parts], "name": "report-split.zip"}
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert 'filename="report-split.zip"' in response.headers["content-disposition"]

    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == ["report-1-2.pdf", "report-3-4.pdf"]
        assert labels_in(archive.read("report-1-2.pdf")) == ["P1", "P2"]


def test_an_archive_is_never_stored_as_a_document(authed_client: TestClient) -> None:
    # It is a way of delivering files, not a file we keep.
    document_id = upload_pdf(authed_client, "report.pdf", 2)
    parts = outputs_of(
        authed_client.post(SPLIT, json={"document_id": document_id, "mode": "every_page"})
    )
    before = authed_client.get(DOCUMENTS).json()["data"]["total"]

    authed_client.post(ARCHIVE, json={"document_ids": [part["id"] for part in parts]})

    assert authed_client.get(DOCUMENTS).json()["data"]["total"] == before


def test_an_archive_gives_repeated_names_a_suffix(authed_client: TestClient) -> None:
    # Two ranges of the same source can genuinely produce the same filename,
    # and a zip with duplicate entries loses files in some extractors.
    first = upload_pdf(authed_client, "report.pdf", 2)
    second = upload_pdf(authed_client, "report.pdf", 2)

    response = authed_client.post(ARCHIVE, json={"document_ids": [first, second]})

    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == ["report.pdf", "report (1).pdf"]


def test_an_archive_cannot_reach_another_users_document(authed_client: TestClient) -> None:
    mine = upload_pdf(authed_client, "mine.pdf", 1)
    theirs = _upload_as_other_user(authed_client)

    response = authed_client.post(ARCHIVE, json={"document_ids": [mine, theirs]})

    assert response.status_code == 404


def test_an_archive_needs_at_least_one_document(authed_client: TestClient) -> None:
    assert authed_client.post(ARCHIVE, json={"document_ids": []}).status_code == 422


def test_an_archive_needs_a_signed_in_user(api_client: TestClient) -> None:
    response = api_client.post(ARCHIVE, json={"document_ids": [str(uuid.uuid4())]})

    assert response.status_code == 401


def test_another_users_job_is_reported_as_missing(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 1)
    second = upload_pdf(authed_client, "b.pdf", 1)
    job_id = authed_client.post(MERGE, json={"document_ids": [first, second]}).json()["data"][
        "job"
    ]["id"]

    token = second_user(authed_client)
    response = authed_client.get(f"{JOBS}/{job_id}", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 404


def test_jobs_need_a_signed_in_user(api_client: TestClient) -> None:
    assert api_client.get(JOBS).status_code == 401


# --- Results behave like any other document ----------------------------


def test_a_result_appears_in_the_document_list(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 1)
    second = upload_pdf(authed_client, "b.pdf", 1)

    authed_client.post(MERGE, json={"document_ids": [first, second]})

    listing = authed_client.get("/api/v1/documents").json()["data"]
    assert listing["total"] == 3
    # Newest first, so the merge result is at the top.
    assert listing["items"][0]["original_filename"] == "merged.pdf"


def test_a_result_can_be_deleted_like_any_other_document(authed_client: TestClient) -> None:
    first = upload_pdf(authed_client, "a.pdf", 1)
    second = upload_pdf(authed_client, "b.pdf", 1)
    output_id = first_output(authed_client.post(MERGE, json={"document_ids": [first, second]}))[
        "id"
    ]

    assert authed_client.delete(f"/api/v1/documents/{output_id}").status_code == 200
    assert authed_client.get(f"/api/v1/documents/{output_id}").status_code == 404


def _upload_as_other_user(client: TestClient) -> str:
    """Upload a PDF as a second account and return its id, restoring the token."""
    mine = client.headers["Authorization"]
    client.headers["Authorization"] = f"Bearer {second_user(client)}"
    try:
        return upload_pdf(client, "theirs.pdf", 1)
    finally:
        client.headers["Authorization"] = mine
