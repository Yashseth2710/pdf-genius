# PDF Genius

**Everything PDF. One simple workspace.**

Merge, split, compress, convert, organise and understand PDF documents from a
single place, instead of hopping between five different websites to finish one
task.

> **Status: in development.** Accounts, uploads and the first two PDF tools —
> merge and split — work end to end. The remaining tools and the AI features are
> being built scope by scope; see the [roadmap](#roadmap).

---

## Why

A student finishing an assignment often has to merge a few PDFs, compress the
result, turn some photos into a document and drop a page. Doing that today
usually means several sites, repeated uploads, adverts, file-size limits and no
history of what happened. PDF Genius puts the whole workflow in one interface,
keeps documents private to the account that uploaded them, and remembers what
was done to them.

## Tech stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui          |
| Data layer | TanStack Query, React Hook Form, Zod                                 |
| Backend    | Python 3.12, FastAPI, Pydantic, SQLAlchemy 2, Alembic                |
| Database   | PostgreSQL 18 (Neon, free tier)                                      |
| PDF engine | PyMuPDF, pypdf, pdfplumber, Pillow                                   |
| Auth       | Custom JWT (PyJWT) with Argon2 password hashing                      |
| Testing    | Pytest + HTTPX, Vitest + Testing Library, Playwright                 |
| CI         | GitHub Actions                                                       |

Everything above is free and open source. The project is built to a ₹0
infrastructure budget: no paid APIs, no Redis, no cloud vendor lock-in.

## Getting started

**Prerequisites:** Node.js 20+, Python 3.12+, and a PostgreSQL connection string
(a free [Neon](https://neon.com) project takes about a minute to create).

```bash
git clone https://github.com/Yashseth2710/pdf-genius.git
cd pdf-genius
```

**Backend**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements-dev.txt

cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`, with interactive docs at
`http://localhost:8000/docs` (disabled in production).

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The app runs at `http://localhost:3000`.

There is no Docker setup: PostgreSQL is hosted, so starting the stack is just
those two commands. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the
reasoning and for troubleshooting.

## Environment variables

Both apps ship a `.env.example` listing every variable with a placeholder. Real
`.env` files are git-ignored and must never be committed.

| Backend                       | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `DATABASE_URL`                | PostgreSQL connection string                     |
| `JWT_SECRET`                  | Signing key for access tokens                    |
| `CORS_ORIGINS`                | Comma-separated list of allowed frontend origins |
| `STORAGE_ROOT`                | Where uploaded and processed files live          |
| `MAX_UPLOAD_SIZE_MB`          | Upload size limit, per file                      |
| `STORAGE_QUOTA_MB`            | Total storage per account, uploads and results   |
| `LOGIN_MAX_FAILURES`          | Failed sign-ins before an account is locked      |
| `LOGIN_LOCKOUT_MINUTES`       | How long that lock lasts                         |
| `AI_PROVIDER`                 | Unused. AI was dropped; leave it at `none`       |

| Frontend              | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API (browser-visible) |

## Testing

```bash
# Backend
cd backend
pytest                        # tests
ruff check . && mypy app tests  # lint and types

# Frontend
cd frontend
npm run test                  # unit tests (Vitest)
npm run e2e                   # end-to-end (Playwright)
npm run lint && npm run typecheck
```

CI runs all of the above on every push and pull request to `main`.

## Project structure

```
pdf-genius/
├── backend/
│   ├── app/
│   │   ├── api/v1/        # route modules, one per resource
│   │   ├── core/          # config, database, security, errors
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic request/response models
│   │   ├── services/      # pdf/, ai/, storage/ - the real work
│   │   └── repositories/  # database access
│   └── tests/
├── frontend/
│   ├── app/               # App Router pages
│   ├── components/        # ui/, pdf/, upload/, shared/
│   ├── lib/               # API client and helpers
│   ├── types/             # shared TypeScript types
│   └── e2e/               # Playwright specs
├── docs/
└── .github/workflows/
```

## API

All endpoints live under `/api/v1` and return a consistent envelope:

```jsonc
// success
{ "success": true, "data": { } }

// failure - never a stack trace
{ "success": false, "error": { "code": "INVALID_FILE", "message": "The uploaded file is not a valid PDF." } }
```

## Roadmap

Built in 12 vertical slices — see [docs/ROADMAP.md](docs/ROADMAP.md) for what
each one delivers and when it counts as finished.

- [x] **1** — Foundation: structure, configuration, database, error handling, health checks, CI
- [x] **2** — Data model and migrations
- [x] **3** — Authentication
- [x] **4** — File infrastructure: upload, validation, storage, download, delete
- [x] **5** — Merge and split
- [x] **6** — Page organisation: rotate, delete, reorder, extract, plus preview
- [x] **7** — Compression, and images into a PDF
- [ ] ~~**8** — Text watermark~~ — dropped; see [ROADMAP.md](docs/ROADMAP.md)
- [x] **9** — Dashboard and history
- [ ] ~~**10** — AI: summaries, ask-your-PDF~~ — dropped; see [ROADMAP.md](docs/ROADMAP.md)
- [x] **11** — Hardening: accessibility, security, performance
- [x] **12** — Deployment: both halves on Vercel, files on Vercel Blob — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Privacy

Documents belong to the account that uploaded them, and every endpoint that
touches one checks ownership first. Temporary processing files are deleted once
an operation finishes.

One honest qualification for the hosted deployment. Files there live in object
storage under a random UUID, and a download is a redirect to that address rather
than bytes served through the API — because the platform will not return a
response over 4.5MB, and documents are allowed to be 25MB. The address is
unguessable but unsigned, so **anyone who obtains a document's storage URL can
read it without signing in**, in the way an "anyone with the link" share works.
Run it yourself with `STORAGE_PROVIDER=local` and downloads are authorised in
full. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Nothing you upload is sent to a third party: every tool runs on our own
infrastructure, which is part of why the AI features were dropped rather than
built.
