"""Remove document rows whose file is not in storage.

A row and its bytes live in two different systems, so they can disagree. The
usual cause is not a bug but an environment: point a development machine at the
same database as production and every local upload writes a row here while its
file lands on a laptop's disk. Deploy, and those rows are still listed - and
every tool answers "That document is no longer available", because that is
exactly what has happened.

There is no way to repair such a row. The file is gone; the row is a pointer to
nothing. This deletes them.

Reports by default and changes nothing:

    python scripts/purge_orphans.py

Deletes, having shown you what it will delete first:

    python scripts/purge_orphans.py --delete

Reads DATABASE_URL and the storage settings from the environment, so it acts on
whichever database that names. Check it before adding --delete.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.services.storage import LocalStorage, Storage, VercelBlobStorage


def build_storage() -> Storage:
    """The same choice the application makes, from the same settings."""
    settings = get_settings()
    provider = settings.storage_provider.lower()
    if provider == "local":
        return LocalStorage(settings.storage_root)
    if provider == "blob":
        return VercelBlobStorage(settings.blob_read_write_token)
    raise SystemExit(f"Unknown STORAGE_PROVIDER: {settings.storage_provider!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--delete",
        action="store_true",
        help="actually delete. Without it, nothing is written.",
    )
    args = parser.parse_args()

    settings = get_settings()
    storage = build_storage()

    # The host, never the credentials: this is the one line that tells you
    # whether you are about to delete from the database you meant.
    host = settings.database_url.split("@")[-1].split("/")[0]
    print(f"database: {host}")
    print(f"storage:  {settings.storage_provider}\n")

    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        rows = connection.execute(
            text("SELECT id, original_filename, storage_path FROM documents ORDER BY created_at")
        ).fetchall()

    # Checked one at a time rather than against a listing, so the answer comes
    # from the same code path the application uses to find a file.
    orphans = [row for row in rows if not storage.exists(row.storage_path)]

    print(f"{len(rows)} documents, {len(orphans)} with no file in storage")
    for row in orphans:
        print(f"  {row.original_filename}")

    if not orphans:
        return

    if not args.delete:
        print("\nNothing written. Pass --delete to remove these rows.")
        return

    # Jobs and AI sessions cascade from the document, so one delete is enough.
    with engine.begin() as connection:
        for row in orphans:
            connection.execute(text("DELETE FROM documents WHERE id = :id"), {"id": row.id})

    print(f"\nDeleted {len(orphans)} rows.")


if __name__ == "__main__":
    main()
