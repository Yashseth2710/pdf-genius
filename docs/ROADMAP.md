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
| 2  | Data model and migrations | S    | 1          | ✅ Done |
| 3  | Authentication            | L    | 2          | ✅ Done |
| 4  | File infrastructure       | L    | 3          | ✅ Done |
| 5  | Merge and split           | M    | 4          | ✅ Done |
| 6  | Page organisation         | L    | 5          | ✅ Done |
| 7  | Compression and conversion| M    | 4          | Next   |
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

## 2. Data model and migrations ✅

The whole schema from spec section 14 in one migration, so later scopes add
behaviour rather than reshaping tables.

**Shipped:** five tables with UUID primary keys, five native enum types,
cascade deletes enforced by the database, `jsonb` for job options, indexes on
every `user_id`; Alembic reading `DATABASE_URL` so no password lives in
`alembic.ini`; a repository base class whose `get_for_user` returns `None`
rather than someone else's record; 12 metadata tests and 8 integration tests
against real PostgreSQL.

Applied to Neon and round-tripped: `upgrade head` → `downgrade base` →
`upgrade head`, with `alembic check` reporting no drift.

See [DATABASE.md](DATABASE.md).

---

## 3. Authentication ✅

The gate everything else sits behind.

**Shipped — backend:** register, login, `/auth/me`, logout; Argon2id hashing
with automatic rehash on sign-in; JWTs with a pinned algorithm; a
`current_user` dependency; rate limiting (5/min register, 10/min login).

**Shipped — frontend:** landing page, app shell, register and login forms
(React Hook Form + Zod mirroring the backend rules), session restore on load,
client-side route protection, account menu, and light/dark/system theming.

**Shipped — tests:** 73 backend, 21 frontend, 6 end-to-end including the full
register → dashboard → sign out → sign back in journey against a real API and
database.

See [SECURITY.md](SECURITY.md) for the decisions, including why the token
currently lives in `localStorage` and what replaces that in scope 11.

---

## 4. File infrastructure ✅

Every PDF tool depends on this, and it is where the security work concentrated
(sections 18, 19).

**Shipped — backend:** upload, list, fetch, download and delete. File type is
decided by reading the file's leading bytes, never from the filename or the
`Content-Type` header. PDFs are then opened to prove there is a document behind
the header. Storage keys are generated, validated, and resolved against the
storage root. Uploads stream to disk in chunks and abort at the size limit.

**Shipped — frontend:** drag-and-drop upload with real progress (via
XMLHttpRequest, since fetch cannot report upload progress), per-file error
rows, paginated document list, download and delete, with loading, error and
empty states.

**Shipped — tests:** 55 backend tests weighted towards what must not happen,
plus 5 end-to-end covering upload, reload, delete and one account being unable
to see another's documents.

**Not included:** PDF preview via PDF.js. It belongs with the thumbnail grid in
scope 6, where the same rendering work is needed for page selection, rather
than being built twice.

---

## 5. Merge and split ✅

The first real tools, and the template every later tool copies.

**Shipped — backend:** merge (2–20 PDFs, in the order given), split by page
ranges, into every page, or into a selection — every output saved as a document
of its own.
A `ProcessingJob` row for every run, with `GET /jobs` to read them back. The
page-range parser explains what is wrong with the text a user typed rather than
reporting "invalid format".

**Shipped — frontend:** a tools index and the tool-page layout from section 37
that every later tool copies — numbered steps, then the result. Merge has
drag-to-reorder (dnd-kit) with move-up/down buttons so it works from a keyboard
too. Results are documents like any other, downloadable straight from the
result panel.

**Shipped — tests:** 27 unit tests that reopen the produced bytes and check
which pages actually came out, 22 for the range parser, 29 end to end against a
real database, 17 frontend and 9 Playwright.

**Decided:** jobs run inside the request. A queue would mean Redis or Celery —
a running cost and a second process — for work that takes under a second. The
job row is written either way, so moving to a queue later changes the execution
and not the data.

**Also fixed here:** `created_at` used PostgreSQL's `now()`, which is the time
the *transaction* began and does not advance while it runs. Two rows written by
one request got identical timestamps and "newest first" between them was
arbitrary. Now `clock_timestamp()`.

---

## 6. Page organisation ✅

Rotate, delete, reorder and extract pages — one interaction model, as the scope
asked, and in the end one screen rather than four.

**Shipped — backend:** a single `POST /tools/organise` taking a *page plan*:
the pages to keep, in order, each with a rotation. Rotating, reordering and
deleting are the same edit to a document, so four endpoints would have meant
four passes and four history entries for one thing the user did once. Rotation
is added to how a page already sits, so a sideways scan turns from where it is
rather than from zero. New `ORGANISE` operation type, with a migration.

**Shipped — frontend:** a thumbnail grid drawn by PDF.js, dragging via dnd-kit,
and move/turn/remove buttons on every card so none of it needs a mouse.
Removed pages stay visible and greyed rather than vanishing, so they can be put
back and the pages around them do not renumber under the cursor. Turning is CSS
on the canvas, so it is instant — the document is only rewritten on save.

**Also shipped: preview, everywhere.** Clicking a document opens it page by
page, using the same renderer — it was deferred from scope 4 precisely so it
could share this code rather than be built twice. Clicking a page opens it full
screen with next/previous, arrow keys, Escape and zoom.

The page is scaled so the **whole page fits**, the way a PDF reader opens.
Fitting the width instead — which is how it shipped first — draws an A4 page
over a metre tall on a wide monitor and leaves you scrolling through a single
page.

A preview button then went everywhere a document is chosen or produced: both
pickers, every card in the organiser, the document list, and the result panel
of every tool. Being able to check the output before downloading it is the
point of having a preview at all. Each one loads its document only when
pressed, so a list of twenty PDFs does not fetch twenty PDFs.

**Shipped — tests:** 23 for the plan module (pure state, no canvas), 14 for the
organiser, 11 end to end including one that asserts a real `<canvas>` per page
and one that measures the full-screen canvas is wider than a thumbnail — a
worker that fails to resolve leaves skeletons behind and would pass any test
that only checked the grid rendered.

**The large-document trap was real.** Every thumbnail waits for an
IntersectionObserver before drawing, with a screen of margin, so a 200-page
document draws the dozen pages you can see rather than all 200. Rendering runs
on the PDF.js worker thread; without `workerSrc` set it silently falls back to
the main thread and freezes the tab.

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
