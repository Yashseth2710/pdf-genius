# Development guide

How to run PDF Genius locally, and why the setup looks the way it does.

## Prerequisites

| Tool       | Version | Notes                                        |
| ---------- | ------- | -------------------------------------------- |
| Node.js    | 20+     | Developed on 24                               |
| Python     | 3.12+   |                                               |
| PostgreSQL | 18      | Hosted on Neon — nothing to install locally   |
| Git        | any     |                                               |

Docker is **not** required. Tesseract (OCR) and LibreOffice (office
conversions) are only needed for future-scope features and can be ignored for
now.

## Why there is no Docker setup

The specification originally called for `docker-compose` to run Next.js,
FastAPI and PostgreSQL together. Two of those three need nothing more than a
command — `next dev` and `uvicorn` — so Docker was really only there to provide
a database. With PostgreSQL hosted on Neon's free tier, that reason disappears,
and dropping Docker removes a heavy dependency (Docker Desktop, an admin
install and a reboot) from getting started.

What this costs and how it is covered:

| Docker gave us                | Instead                                                  |
| ----------------------------- | -------------------------------------------------------- |
| One-command local stack       | Two commands, documented below                            |
| Reproducible environments     | Pinned dependencies (`requirements.lock.txt`, `package-lock.json`) |
| A database for CI             | GitHub Actions service containers, when integration tests need one |
| A deployment artefact         | Hosts build from source; a Dockerfile is added only if a host requires one, and the host builds it |

## First-time setup

### 1. Database

Create a free project at [neon.com](https://neon.com). Choose the region
closest to you — this project uses `ap-southeast-1` (Singapore). Leave **Neon
Auth off**: authentication is handled by our own FastAPI code, and Neon Auth
would create a competing set of user tables.

Copy the connection string from the dashboard.

**Use the direct endpoint, not the pooled one.** Neon offers two hostnames that
differ only by a `-pooler` suffix. The pooled one runs through PgBouncer, which
suits short-lived serverless functions but complicates prepared statements and
migration DDL. Our backend is a long-running process with its own SQLAlchemy
connection pool, so the direct endpoint is the right choice:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb   ← pooled, skip
postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb          ← use this
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements-dev.txt
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — the Neon string. The scheme is rewritten to
  `postgresql+psycopg://` automatically, so pasting it as-is works.
  Keep `?sslmode=require`: Neon refuses plain-text connections.
- `JWT_SECRET` — generate one with:

  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

Then run it:

```bash
uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Docs: <http://localhost:8000/docs> (disabled when `ENVIRONMENT=production`)
- Liveness: <http://localhost:8000/api/v1/health>
- Readiness, including a database check: <http://localhost:8000/api/v1/health/ready>

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

App: <http://localhost:3000>

## Everyday commands

**Backend** (from `backend/`, with the virtualenv active)

| Command                    | What it does                          |
| -------------------------- | ------------------------------------- |
| `uvicorn app.main:app --reload` | Run the API with hot reload      |
| `pytest`                   | Run the test suite                    |
| `ruff check . --fix`       | Lint and auto-fix                     |
| `ruff format .`            | Format                                |
| `mypy app tests`           | Type check (strict)                   |
| `alembic upgrade head`     | Apply migrations                      |
| `alembic revision --autogenerate -m "..."` | Generate a migration from model changes |
| `alembic check`            | Detect drift between models and database |

Integration tests need a real database and are skipped without one. Point
`TEST_DATABASE_URL` at a **disposable** database — the tests build the schema and
drop it again. See [DATABASE.md](DATABASE.md).

**Frontend** (from `frontend/`)

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Dev server                          |
| `npm run build`     | Production build                    |
| `npm run test`      | Unit tests (Vitest)                 |
| `npm run test:watch`| Unit tests in watch mode            |
| `npm run e2e`       | End-to-end tests (Playwright)       |
| `npm run lint`      | ESLint                              |
| `npm run typecheck` | Generate route types, then `tsc`    |
| `npm run format`    | Prettier                            |

## Conventions

- **Commits** follow `feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`
  and describe the actual change, not the feature in the abstract.
- **Backend layering:** routes in `api/v1/` stay thin and delegate to
  `services/`; database access lives in `repositories/`. Nothing substantial
  belongs in `main.py`.
- **Responses** always use the envelope in
  [`app/schemas/common.py`](../backend/app/schemas/common.py). Raise the errors
  in [`app/core/errors.py`](../backend/app/core/errors.py) rather than building
  ad-hoc responses; the registered handlers do the formatting and keep internal
  detail out of the reply.
- **Secrets** live in `.env` files, which are git-ignored. Never put a secret in
  frontend code — anything named `NEXT_PUBLIC_*` is shipped to the browser.

## Troubleshooting

**`ModuleNotFoundError` when running pytest or uvicorn**
The virtualenv is not active, or dependencies were installed globally. Activate
it and reinstall with `pip install -r requirements-dev.txt`.

**Backend fails to start with a validation error about `jwt_secret`**
`.env` is missing or incomplete. Settings are strict on purpose: the app
refuses to boot rather than run without a signing key.

**Readiness returns `"database": "unavailable"`**
Usually the Neon compute is waking from idle — retry after a couple of seconds.
Otherwise check that `DATABASE_URL` still carries `?sslmode=require` and that
the password has not been rotated.

**The first request after a quiet period is slow**
Expected. Neon's free tier scales computes to zero when idle; the next
connection wakes it.

**Playwright cannot find a browser**
Run `npx playwright install chromium` from `frontend/`.

**VS Code shows two repositories in Source Control**
Stale state from before the repos were merged. Reload the window
(`Ctrl+Shift+P` → *Developer: Reload Window*).
