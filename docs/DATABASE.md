# Database

PostgreSQL 18, hosted on Neon. Schema changes go through Alembic — never by
hand, and never with `create_all`.

## Relationships

```
User
 ├── Document
 │     ├── ProcessingJob
 │     └── AISession
 │           └── AIMessage
 └── (ProcessingJob and AISession also reference the user directly)
```

Every document, job and AI session belongs to a user. Deleting a user removes
everything they own; deleting a document removes its jobs and sessions.

## Tables

### `users`

| Column          | Type          | Notes                                  |
| --------------- | ------------- | -------------------------------------- |
| `id`            | `uuid` PK     |                                        |
| `email`         | `varchar(320)`| Unique, indexed, stored lower-cased    |
| `password_hash` | `varchar(255)`| Argon2 hash — never a password         |
| `first_name`    | `varchar(100)`|                                        |
| `last_name`     | `varchar(100)`|                                        |
| `created_at`    | `timestamptz` | Database default `now()`               |
| `updated_at`    | `timestamptz` | Updated on write                       |

320 characters is the RFC 5321 maximum for an email address.

### `documents`

| Column              | Type            | Notes                                      |
| ------------------- | --------------- | ------------------------------------------ |
| `id`                | `uuid` PK       |                                            |
| `user_id`           | `uuid` FK       | → `users.id`, `ON DELETE CASCADE`, indexed |
| `original_filename` | `varchar(255)`  | Display only — never used as a path        |
| `storage_path`      | `varchar(512)`  | Unique. The name *we* generated            |
| `mime_type`         | `varchar(127)`  | Sniffed from content, not the extension    |
| `file_size`         | `bigint`        |                                            |
| `page_count`        | `integer` null  | Unknown until the file is opened           |
| `status`            | `document_status` | `UPLOADED` / `READY` / `FAILED`          |

`storage_path` is unique so two rows can never point at one file — otherwise
deleting one document would break the other.

### `processing_jobs`

| Column           | Type              | Notes                                        |
| ---------------- | ----------------- | -------------------------------------------- |
| `id`             | `uuid` PK         |                                              |
| `user_id`        | `uuid` FK         | → `users.id`, cascade, indexed                |
| `document_id`    | `uuid` FK null    | → `documents.id`, cascade, indexed            |
| `operation`      | `operation_type`  | `MERGE`, `SPLIT`, `COMPRESS`, `CONVERT`, `ROTATE`, `EXTRACT`, `WATERMARK`, `OCR` |
| `status`         | `job_status`      | `QUEUED` / `PROCESSING` / `COMPLETED` / `FAILED`, indexed |
| `input_metadata` | `jsonb`           | The options the job ran with                  |
| `output_path`    | `varchar(512)` null |                                             |
| `error_message`  | `text` null       | Phrased for the user, never a stack trace     |
| `completed_at`   | `timestamptz` null|                                              |

`document_id` is nullable because a merge has several inputs and no single
source document; those inputs are recorded in `input_metadata`.

### `ai_sessions`

| Column         | Type              | Notes                            |
| -------------- | ----------------- | -------------------------------- |
| `id`           | `uuid` PK         |                                  |
| `user_id`      | `uuid` FK         | → `users.id`, cascade, indexed   |
| `document_id`  | `uuid` FK         | → `documents.id`, cascade, indexed |
| `session_type` | `ai_session_type` | `SUMMARY` / `Q_AND_A`            |

### `ai_messages`

| Column       | Type            | Notes                              |
| ------------ | --------------- | ---------------------------------- |
| `id`         | `uuid` PK       |                                    |
| `session_id` | `uuid` FK       | → `ai_sessions.id`, cascade, indexed |
| `role`       | `message_role`  | `USER` / `ASSISTANT`               |
| `content`    | `text`          |                                    |
| `created_at` | `timestamptz`   | No `updated_at` — append only      |

## Decisions

**UUID primary keys, not auto-incrementing integers.** These ids appear in URLs.
A sequential id tells anyone who sees `/documents/123` that `/documents/124`
exists, which is a poor starting point for a product where documents are
private.

**Cascade deletes in the database, not just the ORM.** `ON DELETE CASCADE` means
a deleted account cannot leave orphaned rows behind, even if something deletes
a user outside the application.

**`jsonb` for job options.** Every operation takes different settings — page
ranges, rotation angle, watermark text — and a column per option would be
unmanageable.

**Native enum types.** The database rejects a status it has never heard of,
rather than accepting any string.

**Indexes on `user_id` everywhere.** Every list query filters by user, so this is
the access pattern that matters.

## Migrations

Run from `backend/` with the virtualenv active.

```bash
alembic upgrade head                      # apply everything
alembic revision --autogenerate -m "..."  # generate from model changes
alembic downgrade -1                      # undo the last migration
alembic current                           # which revision is applied
alembic check                             # do models and database disagree?
```

**Always read a generated migration before applying it.** Autogenerate is a
starting point, not an answer. The first migration needed a correction by hand:
it created the enum types on the way up but did not drop them on the way down,
and because a PostgreSQL type outlives the table that used it, a downgrade
followed by an upgrade failed with *type already exists*.

Autogenerate also cannot see a model that is never imported, which is why
`app/models/__init__.py` imports all of them.

The connection string comes from `DATABASE_URL` via `migrations/env.py`;
`alembic.ini` deliberately holds no URL, so no password is ever committed.

## Testing against a real database

Unit tests read the mapper metadata and need no database. The integration tests
in `backend/tests/integration/` need a real PostgreSQL: they apply the
migrations, run each test inside a transaction that is rolled back, and drop the
schema at the end.

Set `TEST_DATABASE_URL` to a **disposable** database — never one with real data.
On Neon, create a second database on the same project rather than reusing
`neondb`:

```sql
CREATE DATABASE pdf_genius_test;
```

Leave `TEST_DATABASE_URL` unset and those tests skip. CI sets it to a throwaway
PostgreSQL service container.
