# Deployment

Live at **https://pdf-genius.vercel.app**

PDF Genius runs as **one Vercel project containing two services**, plus a Neon
database and a Vercel Blob store.

| Piece | Where | Region |
| --- | --- | --- |
| `web` service | `frontend/`, Next.js | `sin1` |
| `api` service | `backend/`, FastAPI | `sin1` |
| Database | Neon | `ap-southeast-1` |
| Files | Vercel Blob store `pdf-genius`, public | `sin1` |

Services are what make one project possible: each builds independently with its
own runtime and dependencies, and the top-level rewrites in `vercel.json` decide
which one answers a request.

```json
"rewrites": [
  { "source": "/api/v1/(.*)", "destination": { "service": "api" } },
  { "source": "/(.*)",        "destination": { "service": "web" } }
]
```

The order matters. `/api/v1/…` is matched first so that `/api/blob/upload` — a
Next.js route handler, not an API endpoint — falls through to `web`.

**Everything shares one origin, so there is no CORS.** The browser fetches
`/api/v1/documents` from the page it already loaded. `NEXT_PUBLIC_API_URL` is
the relative string `/api/v1`, and `CORS_ORIGINS` is set only so that a
misconfiguration cannot silently open the API to another origin.

**Everything sits in Singapore**, because the database does. The Blob store was
first created in `iad1` and moved: a function in Washington calling a database
in Singapore pays roughly 230ms per round trip, several times per request.

---

## What serverless changed, and why

The backend was written for a long-running process with a disk. Vercel gives it
neither, and three things had to change as a result. They are worth
understanding before touching any of them.

### Uploads no longer pass through the API

A Vercel function refuses any request body over **4.5MB**. The upload limit is
**25MB**. Posting a file to the API therefore fails for most real documents,
and no amount of configuration changes that — it is enforced before the
function runs.

So the browser writes to Blob itself, in three steps:

1. `POST /documents/upload-ticket` — the API checks quota and reserves a key
   under `documents/<user id>/`.
2. The browser calls `/api/blob/upload` on the **frontend**, which verifies the
   caller against `/auth/me` and mints a token scoped to that one pathname,
   then uploads directly to Blob.
3. `POST /documents/record` — the API reads the bytes that actually landed,
   sniffs the real file type, re-checks the size against the quota, and only
   then writes the row. Anything that fails is deleted from the store before
   the error is returned.

The type sniffing is the point of step 3. The browser's claimed content type is
not evidence, and on this path the API never sees the upload happen — so the
check that used to run mid-stream now runs against the stored object instead.

Set `NEXT_PUBLIC_DIRECT_UPLOADS=true` to use this path. Left `false`, uploads
go through the API exactly as they do locally.

### Downloads redirect instead of streaming

The same 4.5MB cap applies to responses. `GET /documents/{id}/download` still
authorises the request, but then answers **307** to the object's URL rather
than copying bytes through the function.

**This is weaker than what it replaces, and knowingly so.** The Blob URL needs
no signature and does not expire. Its security is that the last path segment is
a random UUID — 122 bits, unguessable, the same model as an "anyone with the
link" share. Someone who obtains a URL can fetch that file without signing in.

The alternative was capping downloads at 4.5MB, which would make most documents
undownloadable.

Blob does now offer **private** stores, whose objects are not readable by URL.
They are not used here because a private object has to be delivered *through* a
function — which puts the 4.5MB response cap straight back. Moving to one would
mean serving small files privately and large ones some other way, and that is a
piece of work, not a setting.

### Rate limits need somewhere shared to count

`slowapi` and the account lockout keep counters in memory. That is correct for
one process and wrong for several: "five failures buys fifteen minutes" becomes
"five failures per instance, until that instance is recycled."

Fluid compute — on by default — reuses a warm instance across requests, so this
is less broken than classic serverless would be. It is still not a limit: the
platform scales out under load, which is exactly when a limit matters.

Set **`REDIS_URL`** and the rate limits are enforced across every instance.
Without it they are approximate, and the login lockout from scope 11 is close
to decorative. Any Redis works; Vercel sells Upstash through its own
marketplace on a free tier.

> **The account lockout is still per-instance even with `REDIS_URL` set.**
> Only the rate limiter reads that setting. Moving the lockout to a shared
> store is outstanding work, not a solved problem.

### The backend talks to Blob over an undocumented interface

Vercel publishes a JavaScript SDK for Blob and no REST API. `blob.py` calls the
same HTTP endpoints that SDK calls, with `x-api-version` pinned.

Reading is safe and always will be — a public blob is a plain HTTPS GET with no
authentication involved. **Writing, deleting and listing are not.** They work,
but they rely on a private interface that Vercel has not promised to keep.

If they break, the supported route is to move those three operations into the
Next.js app, which runs the real SDK, and have the API call it.

---

## First deployment

### 1. The database

Already on Neon. Migrations run from a machine with the production URL — never
from the function, which has no business holding schema authority:

```bash
cd backend
DATABASE_URL='postgresql+psycopg://...neon.tech/neondb?sslmode=require' \
  .venv/Scripts/python -m alembic upgrade head
```

Use the **direct** endpoint, the host *without* `-pooler`. PgBouncer and
migration DDL do not mix.

### 2. The Blob store

Vercel dashboard → **Storage** → **Create Database** → **Blob** → name it
`pdf-genius`.

Connect it to **both** projects. The frontend needs it to mint upload tokens;
the backend needs it to read, delete and enumerate. Vercel sets
`BLOB_READ_WRITE_TOKEN` in each automatically.

### 3. The project

One project, linked to the **repository root** — not to `frontend/` or
`backend/`. The root is where `vercel.json` lives, and that file is what
declares both services.

```bash
vercel link --project pdf-genius
vercel git connect
```

`vercel git connect` is what makes pushes deploy themselves. Without it the
project works but the dashboard offers "Connect Git Repository", because a CLI
deploy uploads files without associating a repo.

Environment variables, all on this one project:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Neon **direct** URL, host without `-pooler` |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `STORAGE_PROVIDER` | `blob` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `https://pdf-genius.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `/api/v1` — relative, because it is the same origin |
| `NEXT_PUBLIC_DIRECT_UPLOADS` | `true` |
| `REDIS_URL` | your Redis URL, if you added one |
| `BLOB_READ_WRITE_TOKEN` | set by Vercel when the store is linked |

`ENVIRONMENT=production` also closes `/docs` and `/openapi.json`.

The two `NEXT_PUBLIC_` values are compiled into the browser bundle, so changing
either needs a redeploy rather than a restart. Neither is a secret.
`BLOB_READ_WRITE_TOKEN` **is** one, which is exactly why it has no prefix.

### 4. Check it

```bash
curl https://pdf-genius.vercel.app/api/v1/health/ready
```

Then sign up on the frontend, upload something over 5MB, and download it. That
one round trip exercises everything the serverless move touched: the ticket,
the token route, the direct upload, the type sniff, and the redirect.

---

## Things that will surprise you

**Cold starts.** An idle function eventually stops. The first request afterwards
pays the import cost of PyMuPDF and SQLAlchemy — a few seconds. Fluid compute is
on by default and reuses a warm instance across requests, so this is rarer than
it would once have been, but it still happens. Nothing is wrong.

**Memory.** Hobby gives every function 2GB, fixed — it is not configurable
below Pro, which is why `vercel.json` does not try. Measured worst case is a
20-document merge at 58MB (`backend/scripts/measure.py`). Comfortable, and only
because the organise path was fixed in scope 11: before that a 500-page plan
peaked at 2.5GB and would have been killed here.

**60 seconds.** Hobby allows up to 300s; the 60 in `vercel.json` is our own
ceiling, not the platform's. Every measured operation finishes well under a
second, so anything approaching a minute is a bug rather than a big document.
There is no background worker — work that cannot finish inside a request has
nowhere to go.

**Orphaned objects.** A browser that uploads and then never calls
`/documents/record` leaves an object with no row. Nothing collects these yet.

**Orphaned rows, which are worse.** A row whose file is missing is listed in the
interface and then fails on use — every tool answers "That document is no
longer available", which is precisely true and completely unhelpful.

This is not usually a bug. It is what happens when a development machine points
at the production database: the upload writes a row here and puts the file on a
laptop's disk. 116 of 120 rows were in that state on the first deploy, from
local sessions and e2e runs.

```bash
cd backend
STORAGE_PROVIDER=blob python scripts/purge_orphans.py            # report
STORAGE_PROVIDER=blob python scripts/purge_orphans.py --delete   # remove
```

It prints the database host before it does anything, because it acts on
whatever `DATABASE_URL` names.

**The real fix is a separate production database.** While one Neon database
serves both, every local upload and every test run puts another dead row in
front of your users, and this script is a broom rather than a solution.

**The bundle, and the dependency list that is not `requirements.txt`.** The
ceiling in services mode is **225MB**, not the 500MB the Python runtime docs
quote for a standalone function. Installing `requirements.lock.txt` produced
259MB and failed the deploy, because that file is the *development* environment
— pytest, ruff and mypy included.

So `[project].dependencies` in `backend/pyproject.toml` is the deployed set,
pinned to the same versions the tests ran against. Four things are missing from
it on purpose, each confirmed by grep to be unimported by `app/`:

| Left out | Why |
| --- | --- |
| `uvicorn` | runs the app locally; the platform provides the ASGI server |
| `alembic` | migrations run from a developer machine, never from a request |
| `pypdf` | not imported anywhere |
| `pdfplumber` | likewise, and it pulls in pdfminer, cryptography and pypdfium2 |

Adding a runtime import means adding it there too. `requirements.txt` and the
lock file are unchanged and still describe development and CI.
