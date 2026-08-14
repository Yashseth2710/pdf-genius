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
| 7  | Compression and conversion| M    | 4          | ✅ Done |
| 8  | Watermark                 | S    | 4          | Dropped |
| 9  | Dashboard and history     | M    | 5–7        | ✅ Done |
| 10 | AI features               | L    | 4          | Dropped |
| 11 | Hardening                 | M    | 2–9        | Next   |
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

## 7. Compression and conversion ✅

**Shipped — backend:** `POST /tools/compress` with Basic, Balanced and Strong,
and `POST /tools/images-to-pdf`.

Compression is two different jobs wearing one name. Basic is lossless — unused
objects collected, streams deflated — while Balanced and Strong redraw the
*images* at lower resolutions, which is where the megabytes in a scan actually
are. Text and vector drawings are never touched at any level, and neither are
1-bit images, which in a PDF are almost always scanned text. Degrading those
would trade legibility for a rounding error.

**The warning above was right, and pointed at the wrong file.** A PDF that
cannot be made smaller now returns a completed job with *no output* and the
measured sizes on it, rather than a copy of the same size called a success. To
count as smaller a file must lose at least 1% **and** at least 10KB: a
percentage alone calls 70 bytes off a tiny document a 5% win, and a byte count
alone calls 40KB off a 200MB scan one.

Nothing anywhere estimates the saving beforehand. The same level takes 90% off
a photographed scan and nothing off a page of text, and the only honest way to
know which one this is, is to do the work and measure.

**Dropped from this scope: PDF → images.** It was built and then taken back
out, deliberately. Every other tool here takes documents and gives documents
back; exporting pages as JPGs produces files the rest of the app can only hand
straight back to you, and it made the ZIP question — settled in scope 5 —
awkward all over again. Cutting it also removed the one operation whose output
could dwarf its input, and with it a megapixel budget the user could hit
without understanding why.

The original plan's third bullet, "PDF → JPG/PNG … ZIP when multiple", is
therefore not shipped, and the ZIP half of it was wrong regardless: scope 5
removed stored archives, and reintroducing one here would have rebuilt the dead
end.

**Images → PDF takes what the rest of the industry takes**, not just the two
formats scope 4 happened to accept: JPG, PNG, GIF, BMP, TIFF, WEBP and HEIC.
That set was chosen by checking Smallpdf, Adobe Acrobat and iLovePDF rather
than by guessing. HEIC is the one that matters — it is what an iPhone writes by
default, so refusing it turns away the commonest photo there is over a
container format. It costs one dependency, `pillow-heif`.

PyMuPDF reads five of the seven itself. WEBP and HEIC go through Pillow and are
handed on re-encoded — as PNG when the image has transparency and JPEG when it
does not, because JPEG has no alpha channel and flattening a cut-out onto black
is a silent way to ruin one. A test caught exactly that, on the first attempt.

Two of the seven cannot be **previewed**, only converted: no browser outside
Safari draws a TIFF or a HEIC. Rather than offer a button that opens an empty
box, those files simply have no preview, and the document page says why.

**Shipped — frontend:** two tool pages, plus the first **image** picker in the
app — every other one filters to PDFs. Ordering, previewing and the picker
placeholders are now shared components rather than a second copy each: merge
and images → PDF ask the same question, so they use the same list.

**Images became previewable**, in the document list, on the document page and
in the picker. Uploading a JPG has been possible since scope 4, but nothing
could show you one, so choosing the right photo meant downloading it first —
the same dead end as an archive, in a different shape.

**One migration**, which the plan had not foreseen: jobs gained
`result_metadata`. `input_metadata` holds what a job was asked to do, and
writing a measured result into it would have made the name a lie — and a number
that lives only in the response is lost on the next page load.

**Also fixed here:** PyMuPDF's `keep_proportion` does not, in this version —
a square photo came out as a full-bleed A4 oblong whatever the flag said. The
fitted rectangle is now worked out in our own code. A stretched face is the
first thing anyone notices and the last thing anything reports.

**Shipped — tests:** 29 backend unit tests that reopen the produced bytes and
measure them, 26 backend integration, 23 frontend and 5 end to end. Totals:
**172 backend unit, 127 backend integration, 129 frontend, 40 Playwright.**

Three of them found real bugs before anyone else could: the fitted rectangle,
the transparent WEBP flattened onto black, and the multi-page TIFF that lost
two of its three pages in one of the two page modes.

---

## 8. Watermark — dropped

Text watermarking was planned here: configurable text, size, opacity, position
and rotation, with a live preview. It is not being built.

Not because it is hard - it was the smallest scope left, `WATERMARK` already
exists in `OperationType` from scope 2, and it needed no migration and no new
dependency. It is dropped because of what it is worth next to what follows.
Eight tools already cover what people come to a PDF app to do; what separates
this from a half-finished project now is the dashboard, the hardening pass and
*being deployed*. A ninth tool adds less to a finished product than the product
being live.

Nothing depends on it. `WATERMARK` stays in the enum unused, which costs
nothing and leaves the door open. Scope 9 simply has one fewer operation to
filter a history by.

---

## 9. Dashboard and history ✅

The screen that turns a pile of tools into a product.

**Shipped — backend:** `GET /jobs` gained status and date filters alongside the
operation one, and they combine. Both dates are inclusive, because that is how
a range reads to the person choosing it: "the 3rd to the 5th" includes the 5th.
Comparing against the bare date means midnight and silently drops a day's work.
`DELETE /jobs/{id}` removes one entry — **the record only**; whatever the job
produced stays in the user's documents, because tidying a history is not a
request to lose the work.

The list and its total are built from one set of conditions. Two queries that
narrowed differently would hand the paginator pages that are not there.

**The migration this scope needed, which the plan had not foreseen:**
`processing_jobs.document_id` cascaded. Deleting a PDF deleted every job that
mentioned it — harmless while jobs were a debugging aid, wrong for a screen
whose whole purpose is *what happened*. It is `SET NULL` now: the entry
survives having forgotten which document it started from, which is the shape a
merge has always had. Nobody notices a history that is quietly missing entries,
which is exactly why it was worth fixing before the screen existed.

**Shipped — frontend:** a history screen with all four filters, pagination and
per-entry delete, and a dashboard carrying every tool as a shortcut plus the
last five things you did.

Each entry says *what the run did*, not just which tool it was: "Split pages
1-3 into 2 files", "Compressed strong — 75% smaller (3.8 MB → 977 KB)",
"12 pages into 9". That reading lives in one pure module with its own tests,
because it is the only real logic on the screen — and because it has to survive
options written by older versions of the app. A history that throws on last
month's job is worse than one that says a little less about it.

**Two empty states, not one.** An account that has never run anything and a
filter that matched nothing look identical if you only count rows. Telling
somebody to "try a tool" when they have used five reads as an app that is not
paying attention.

**Shipped — tests:** 7 for the date-range helpers, 11 backend integration,
26 frontend, 8 end to end.

---

## 10. AI features — dropped

Text extraction, structured summaries, and ask-your-PDF with retrieval, page
references and an explicit "not found in this document". It is not being built.

The open question here was always which provider, and it never had a good
answer. A local model meant a multi-gigabyte download for a free app; an
external API meant every document someone uploaded leaving our infrastructure
to be read by a third party. But the provider was the wrong thing to be stuck
on, because the feature underneath it does not belong here.

This is a PDF utility. People arrive with a file and a problem — too big to
email, pages in the wrong order, five scans that should be one document — and
they leave when it is solved. Nobody comes to a tool like this to have a
conversation with a document. Bolting a chat panel onto it would have been the
largest scope in the project, the only part that sends user files off-site, and
the only part that could be wrong while looking confident. Nine tools that do
exactly what they say is a better product than nine tools and an assistant.

Nothing depends on it. The scaffolding from scope 2 stays exactly as
`WATERMARK` does: `ai_sessions` and `ai_messages` remain as empty tables, along
with the `ai_session_type` and `message_role` enums, the `AISession` and
`AIMessage` models, the `AI_PROVIDER` and `AI_MODEL` settings, and the
`ai_enabled` field on `GET /health`, which now simply always reads `false`.
None of it costs anything to keep, and it leaves the door open.

Hardening is next, and it inherits one less surface to secure.

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
