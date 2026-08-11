# Build roadmap

The project is built in 12 scopes. Each scope is a vertical slice — backend,
frontend, tests and docs together — so `main` is always in a working state and
every scope ends with CI green.

A scope is finished only when all of this is true (spec section 64):

- **Frontend:** UI built, responsive, with loading, error and empty states
- **Backend:** endpoints validated, authenticated, authorised, errors handled
- **Database:** schema and migration in place
- **Tests:** unit tests, integration tests where they apply, end-to-end for critical journeys
- **Security:** input validated, files validated, access control enforced
- **Docs:** API and README updated

| #  | Scope                     | Size | Depends on | Status |
| -- | ------------------------- | ---- | ---------- | ------ |
| 1  | Foundation                | M    | —          | ✅ Done |
| 2  | Data model and migrations | S    | 1          | Next   |
| 3  | Authentication            | L    | 2          |        |
| 4  | File infrastructure       | L    | 3          |        |
| 5  | Merge and split           | M    | 4          |        |
| 6  | Page organisation         | L    | 5          |        |
| 7  | Compression and conversion| M    | 4          |        |
| 8  | Watermark                 | S    | 4          |        |
| 9  | Dashboard and history     | M    | 5–8        |        |
| 10 | AI features               | L    | 4          |        |
| 11 | Hardening                 | M    | 2–10       |        |
| 12 | Deployment                | M    | 11         |        |

---

## 1. Foundation ✅

Project structure, settings, database connection, response envelope, error
handling, request logging, health checks, API client, test harnesses, CI.

**Shipped:** 22 backend tests, 6 frontend tests, 1 end-to-end smoke test, three
green CI jobs.

---

## 2. Data model and migrations

The whole schema from spec section 14, in one migration, so later scopes add
behaviour rather than reshaping tables.

- SQLAlchemy models: `users`, `documents`, `processing_jobs`, `ai_sessions`,
  `ai_messages`
- Enums for job status (`QUEUED`/`PROCESSING`/`COMPLETED`/`FAILED`) and
  operation type
- Foreign keys with cascade rules, plus indexes on `users.email`,
  `documents.user_id` and `processing_jobs.user_id`
- Alembic configured against `DATABASE_URL`, first revision applied to Neon
- Repository base class for database access

**Done when:** `alembic upgrade head` builds the schema on an empty database and
`alembic downgrade base` tears it down cleanly.

---

## 3. Authentication

The gate everything else sits behind, so it is worth doing carefully.

**Backend:** register, login, `/auth/me`, logout; Argon2 hashing; JWT issuing
and verification; a `current_user` dependency; rate limiting on the auth
endpoints.

**Frontend:** landing page (section 38), app shell with header and navigation,
register and login forms with React Hook Form + Zod, session handling, route
protection, logout.

**Tests:** password hashing and verification, token expiry and tampering,
protected routes rejecting missing/invalid/expired tokens, end-to-end
register → log in → land on dashboard → log out.

**Watch out for:** identical responses whether or not an email exists, so the
endpoint cannot be used to enumerate accounts.

---

## 4. File infrastructure

Every PDF tool depends on this, and it is where the security work concentrates
(sections 18, 19).

**Backend:** upload with size and MIME validation (sniffed from content, never
trusted from the filename), internally generated storage names, path-traversal
protection, page counting, metadata persisted to `documents`, list/get/delete,
download streaming, temp-file cleanup.

**Frontend:** drag-and-drop upload zone with progress, file cards, removal,
validation messages, PDF preview via PDF.js.

**Tests:** oversized files rejected, a `.exe` renamed to `.pdf` rejected,
corrupted PDFs rejected, `../../etc/passwd` as a filename rejected, and user A
receiving 404 rather than 403 when reaching for user B's document.

---

## 5. Merge and split

The first real tools, and the template every later tool copies.

- Merge: 2–20 PDFs, drag to reorder, corrupted-file detection
- Split: by page ranges (`1-3, 5, 8-10`), every page, or selected pages; ZIP when
  the result is multiple files
- A shared `ProcessingJob` lifecycle and the tool-page layout from section 37

**Tests:** page counts and order verified by reopening the output, single-page
input, 100+ page input, duplicate files.

---

## 6. Page organisation

Rotate, delete, reorder and extract pages — one interaction model, four tools.

- Thumbnail grid rendered with PDF.js, drag-and-drop reordering via dnd-kit,
  multi-select with keyboard support
- Rotate 90/180/270 on selected or all pages
- Delete and extract by selection; reorder writes a new document in the chosen order

**Watch out for:** thumbnail rendering for large documents — render lazily and
off the main thread, or a 200-page file will freeze the tab.

---

## 7. Compression and conversion

- Compress with Basic / Balanced / Strong, reporting the **actual** size and
  reduction after processing, never an estimate beforehand
- JPG/PNG → PDF with ordering, page size and orientation
- PDF → JPG/PNG for all or selected pages, ZIP when multiple

**Watch out for:** compression that cannot shrink a file must say so plainly
rather than returning a larger file and calling it a success.

---

## 8. Watermark

Text watermark with configurable text, font size, opacity, position and
rotation, applied to selected or all pages, with a live preview before
processing.

---

## 9. Dashboard and history

The screen that turns a pile of tools into a product.

- Dashboard: quick tools, recent documents, recent activity
- History: filter by operation, date and status; paginated; delete entries
- Empty states for a brand-new account

---

## 10. AI features

Built last of the functional scopes, and strictly optional: with
`AI_PROVIDER=none` every tool above keeps working and AI surfaces show an
unavailable state (section 68).

- Text extraction with PyMuPDF and pdfplumber, including page boundaries
- `AIService` abstraction — `summarize()`, `answer_question()`,
  `generate_embedding()` — so the provider is configurable, not hard-coded
- Summaries structured as Overview / Key points / Important information / Conclusion
- Ask-your-PDF with retrieval over the document, answers grounded in its
  contents, page references, and an explicit "not found in this document" when
  the text does not support an answer
- Sessions and messages persisted

**Open decision:** which provider. A local model keeps documents on our own
infrastructure but means a multi-gigabyte download; an external API is lighter
but sends document text off-site and needs a free tier to stay within budget.
Worth deciding before this scope starts, not during it.

---

## 11. Hardening

- Accessibility pass: keyboard navigation, focus states, labels, contrast,
  screen-reader behaviour
- Security pass: the checklist in section 55, dependency audit, rate limits
- Performance: pagination, lazy loading, memory use on large documents,
  measured rather than guessed
- Coverage gaps closed; end-to-end tests for every critical journey

---

## 12. Deployment

- Frontend to Vercel; backend to a free host; database already on Neon
- Production environment variables, CORS locked to the real origin, HTTPS
- Migrations run against production
- `DEPLOYMENT.md`, plus screenshots in the README

**Watch out for:** free backend hosts sleep when idle, so the first request
after a quiet spell is slow. Document it rather than pretending otherwise.

---

## Deliberately out of scope

OCR, table extraction, DOCX/PPTX/XLSX conversion, image watermarks, password
protection, annotations, signing, redaction, document comparison, translation,
batch processing, browser extension, mobile app, team workspaces and a public
developer API are all future work (spec section 9). They are not started until
the twelve scopes above are finished.
