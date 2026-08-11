# API

Base path: `/api/v1`. Interactive docs at `/docs` in development (switched off
in production).

## Envelope

Every response uses one of two shapes.

```jsonc
// success
{ "success": true, "data": { } }

// failure
{ "success": false, "error": { "code": "INVALID_FILE", "message": "The uploaded file is not a valid PDF." } }
```

`code` is for the frontend to branch on; `message` is already safe to show a
user. Internal detail — stack traces, database errors, file paths — never
appears in either.

### Error codes

| Code                       | Status | Meaning                                  |
| -------------------------- | ------ | ---------------------------------------- |
| `VALIDATION_ERROR`         | 422    | Request body failed validation           |
| `UNAUTHENTICATED`          | 401    | Missing, expired or invalid token        |
| `INVALID_CREDENTIALS`      | 401    | Wrong email or password                  |
| `FORBIDDEN`                | 403    | Not yours                                |
| `NOT_FOUND`                | 404    | No such record                           |
| `EMAIL_ALREADY_REGISTERED` | 409    | Address already has an account           |
| `RATE_LIMITED`             | 429    | Too many attempts                        |
| `INTERNAL_ERROR`           | 500    | Something broke; details are in the logs |

Every response carries an `X-Request-ID` header, which also appears in the
server logs — quote it when reporting a problem.

## Authentication

Send the token as a bearer header:

```
Authorization: Bearer <access_token>
```

Tokens are signed with HS256 and expire after `ACCESS_TOKEN_EXPIRE_MINUTES`
(60 by default). `expires_in` is returned in seconds so the client can warn or
refresh before a session dies.

### `POST /auth/register`

Create an account and sign in. Rate limited to 5 requests a minute.

```jsonc
// request
{
  "email": "ada@example.com",
  "password": "a-good-long-password",   // 8-128 characters
  "first_name": "Ada",
  "last_name": "Lovelace"
}

// 201
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "0f5c...",
      "email": "ada@example.com",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "created_at": "2026-08-11T14:22:31Z"
    }
  }
}
```

Emails are lower-cased and trimmed, so `Ada@Example.com ` and
`ada@example.com` are one account. A duplicate returns 409
`EMAIL_ALREADY_REGISTERED`.

There is no upper-case/digit/symbol rule. Length is what matters, and fussy
composition rules mostly produce `Password1!`.

### `POST /auth/login`

Rate limited to 10 requests a minute.

```jsonc
// request
{ "email": "ada@example.com", "password": "a-good-long-password" }
```

Returns the same payload as register, with status 200.

A wrong password and an unknown address return **byte-for-byte the same
response**, and both take about the same time — otherwise the endpoint becomes
a way to discover which addresses have accounts.

### `GET /auth/me`

Requires a token. Returns the signed-in user.

```jsonc
{ "success": true, "data": { "id": "0f5c...", "email": "ada@example.com", "first_name": "Ada", "last_name": "Lovelace", "created_at": "..." } }
```

### `POST /auth/logout`

Requires a token. Returns `{ "message": "Signed out." }`.

Tokens are stateless and short-lived, so there is nothing to delete
server-side — the client discards the token. The endpoint exists so the
frontend has one call to make, and so revocation can be added here later
without changing the client.

## Documents

All of these require a token, and every one is scoped to the signed-in user.

### `POST /documents/upload`

`multipart/form-data` with a single `file` field. Rate limited to 30 a minute.

Accepts PDF, JPG and PNG up to `MAX_UPLOAD_SIZE_MB` (25 by default).

```jsonc
// 201
{
  "success": true,
  "data": {
    "id": "8c1f...",
    "original_filename": "report.pdf",
    "mime_type": "application/pdf",
    "file_size": 184320,
    "page_count": 12,
    "status": "READY",
    "created_at": "2026-08-11T16:40:02Z"
  }
}
```

**The file type is decided by reading the file, not by trusting the caller.**
The filename and the `Content-Type` header are both supplied by whoever is
uploading, so neither is consulted: a `.exe` renamed to `.pdf` is rejected with
415. A file that starts with `%PDF-` but does not open is rejected with 422, and
nothing is left on disk in either case.

| Failure | Status | Code |
| --- | --- | --- |
| Not a PDF/JPG/PNG | 415 | `UNSUPPORTED_FILE_TYPE` |
| Corrupt, empty or password-protected PDF | 422 | `INVALID_FILE` |
| Over the size limit | 413 | `FILE_TOO_LARGE` |

Note what the response does **not** contain: `storage_path`. Where a file
physically lives is internal.

### `GET /documents?limit=20&offset=0`

Newest first. `limit` is 1–100.

```jsonc
{ "success": true, "data": { "items": [ /* documents */ ], "total": 42, "limit": 20, "offset": 0 } }
```

### `GET /documents/{id}`

One document. Another user's document returns **404, not 403** — a 403 would
confirm the id exists.

### `GET /documents/{id}/download`

Streams the file back with `Content-Disposition: attachment`. The filename is
the user's original, stripped of anything that could carry a path or break the
header (`../../etc/passwd.pdf` becomes `passwd.pdf`).

The client asks for a document **by id and never names a path**.

### `DELETE /documents/{id}`

Removes the record, then the file.

```jsonc
{ "success": true, "data": { "id": "8c1f...", "deleted": true } }
```

## Tools

Both tools run **inside the request**. A merge of a handful of PDFs finishes in
well under a second, and a queue would mean Redis or Celery — a running cost
and a second process, for work that is already fast. A `ProcessingJob` row is
still written for every run, so history works and moving to a queue later
changes the execution, not the data.

Every run produces **exactly one output document**, saved like any upload: it
appears in `GET /documents`, downloads through `GET /documents/{id}/download`,
and is deleted the same way. Where several files come out of a split, they are
bundled into one ZIP.

### `POST /tools/merge`

```jsonc
{ "document_ids": ["8c1f...", "3a90..."], "output_name": "assignment.pdf" }
```

Two to twenty PDFs. **The order of `document_ids` is the order of the pages** —
it is what the user dragged the files into, and the server does not reorder it.
`output_name` is optional and defaults to `merged.pdf`.

```jsonc
{
  "success": true,
  "data": {
    "job": { "id": "…", "operation": "MERGE", "status": "COMPLETED", "options": { }, "error_message": null },
    "output": { "id": "…", "original_filename": "assignment.pdf", "mime_type": "application/pdf", "page_count": 12 }
  }
}
```

| Failure | Status | Code |
| --- | --- | --- |
| Fewer than 2, or more than 20 | 422 | `VALIDATION_ERROR` / `PROCESSING_FAILED` |
| A document is not a PDF | 422 | `PROCESSING_FAILED` |
| A document is not yours, or does not exist | 404 | `NOT_FOUND` |
| Inputs over 100MB together | 422 | `PROCESSING_FAILED` |
| A stored file is damaged | 422 | `INVALID_FILE` |

A document belonging to someone else returns **404**, exactly as it does
elsewhere: listing an id alongside your own must not confirm it exists.

### `POST /tools/organise`

```jsonc
{
  "document_id": "8c1f...",
  "pages": [
    { "number": 3, "rotation": 90 },
    { "number": 1, "rotation": 0 }
  ],
  "output_name": "report-organised.pdf"
}
```

**One request covers rotating, reordering and deleting**, because from the
document's point of view they are the same edit: `pages` is the list of pages
to keep, its order is the order of the result, a page left out is a page
deleted, and `rotation` is clockwise degrees **added to however the page
already sits** — so a scan already at 90 with `rotation: 90` ends up at 180.

Four separate endpoints would each rebuild the whole document, so a user who
turned one page and dropped another would pay for two passes and get two
entries in their history for one edit.

Pages are 1-based. A page may appear more than once — duplicating a cover sheet
is a real request — so the limit is on the size of the result, not the original.
`output_name` is optional and defaults to `<original>-organised.pdf`.

| Failure | Status | Code |
| --- | --- | --- |
| A page the document does not have | 422 | `PROCESSING_FAILED` |
| An empty `pages` list | 422 | `VALIDATION_ERROR` |
| A rotation that is not 0, 90, 180 or 270 | 422 | `VALIDATION_ERROR` |
| More than 500 pages in the result | 422 | `PROCESSING_FAILED` |
| Not your document, or not a PDF | 404 / 422 | `NOT_FOUND` / `PROCESSING_FAILED` |

The plan is checked **before a job starts**, so a request naming page 40 of a
20-page document leaves no failed job behind: it never began processing.

Jobs are recorded as `ORGANISE`, with the plan and the original page count in
`options`.

### `POST /tools/split`

```jsonc
{ "document_id": "8c1f...", "mode": "ranges", "ranges": "1-3, 5, 8-10" }
```

`mode` decides which other field is used:

| mode | field | result |
| --- | --- | --- |
| `ranges` | `ranges` — `"1-3, 5, 8-10"` | one PDF per range; a ZIP when there is more than one |
| `every_page` | — | one PDF per page, always a ZIP |
| `pages` | `pages` — `[2, 5, 9]` | a single PDF holding those pages, in that order |

Ranges are 1-based and inclusive, may overlap, and come out in the order
written. Rejections name the problem rather than reporting "invalid format":

| Input | Message |
| --- | --- |
| `all` | `'all' is not a page or a range. Use numbers like 5, or ranges like 8-10.` |
| `9-5` | `'9-5' runs backwards. Write the lower page first, as 5-9.` |
| `8-12` on a 10-page PDF | `'8-12' goes past the end of the document, which has 10 pages.` |
| `0-3` | `Pages are numbered from 1, so there is no page 0.` |

All of these return **422** with code `INVALID_PAGE_RANGE`. Splitting a
one-page document with `every_page`, or asking for more than 100 output files,
returns 422 with `PROCESSING_FAILED`.

## Jobs

### `GET /jobs?limit=20&offset=0&operation=MERGE`

Your processing history, newest first. `operation` is optional.

```jsonc
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "…",
        "operation": "SPLIT",
        "status": "COMPLETED",
        "document_id": "8c1f...",
        "options": { "mode": "ranges", "ranges": "1-3, 5" },
        "error_message": null,
        "created_at": "2026-08-11T21:04:00Z",
        "completed_at": "2026-08-11T21:04:01Z"
      }
    ],
    "total": 1, "limit": 20, "offset": 0
  }
}
```

`document_id` is the input, and is `null` for a merge, which has several — the
inputs are recorded in `options` instead. As with documents, **`output_path` is
never returned**: the result is reached by its document id.

### `GET /jobs/{id}`

One job. Someone else's job returns 404.

## Health

### `GET /health`

Liveness. Touches nothing external, so it never flaps.

```jsonc
{ "success": true, "data": { "status": "ok", "version": "0.1.0", "environment": "development", "ai_enabled": false } }
```

`ai_enabled` lets the frontend hide AI features rather than letting a user
click something that cannot work.

### `GET /health/ready`

Readiness. Runs `SELECT 1`; returns 503 with `"database": "unavailable"` when
the database cannot be reached.

## Coming in later scopes

`/tools/compress`, `/tools/convert`, `/tools/rotate`, `/tools/watermark` and
`/ai/*` — see [ROADMAP.md](ROADMAP.md).
