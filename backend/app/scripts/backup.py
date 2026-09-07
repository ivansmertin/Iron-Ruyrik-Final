from __future__ import annotations

import argparse
from datetime import datetime
import logging
from pathlib import Path
import sqlite3
import sys
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from app.config import get_settings
from app.database import expected_schema_heads

logger = logging.getLogger("app.scripts.backup")


def verify_backup_integrity(source_path: Path, backup_path: Path) -> dict[str, int]:
    """Verify a self-contained SQLite snapshot without comparing it to a changing live source."""
    del source_path  # Retained in the public signature for existing callers.
    if not backup_path.exists() or backup_path.stat().st_size == 0:
        raise RuntimeError(f"Backup verification failed: file {backup_path} is empty or missing.")

    b_conn = sqlite3.connect(f"file:{backup_path.as_posix()}?mode=ro", uri=True)
    try:
        # 1. PRAGMA integrity_check
        cursor = b_conn.cursor()
        integrity_row = cursor.execute("PRAGMA integrity_check").fetchone()
        if not integrity_row or integrity_row[0] != "ok":
            raise RuntimeError(f"Backup integrity check failed: {integrity_row}")

        # 2. Check alembic_version table
        tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "alembic_version" not in tables:
            raise RuntimeError("Backup verification failed: 'alembic_version' table is missing.")

        b_version = cursor.execute("SELECT version_num FROM alembic_version").fetchone()
        if not b_version or not b_version[0]:
            raise RuntimeError("Backup verification failed: alembic_version is empty.")
        expected = expected_schema_heads()
        if {b_version[0]} != expected:
            raise RuntimeError(
                f"Backup schema mismatch: expected {sorted(expected)}, found {[b_version[0]]}."
            )

        foreign_key_errors = cursor.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise RuntimeError(f"Backup foreign key check failed: {foreign_key_errors[:5]}")

        # 3. Read key row counts
        row_counts: dict[str, int] = {}
        for table in ("users", "app_settings", "health_measurements", "bookings"):
            if table in tables:
                count = cursor.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                row_counts[table] = count
    finally:
        b_conn.close()

    return row_counts


def create_sqlite_snapshot(source_path: Path, destination: Path) -> None:
    """Create an atomic, WAL-aware snapshot with SQLite's Online Backup API."""
    temporary = destination.with_name(f"{destination.name}.tmp")
    if temporary.exists():
        temporary.unlink()
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        try:
            target = sqlite3.connect(temporary)
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()
        temporary.replace(destination)
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise


def create_backup(
    destination_dir: Path | str | None = None,
    source_database: Path | str | None = None,
    verify: bool = True,
) -> Path:
    """Creates a consistent online backup of the SQLite database using sqlite3.Connection.backup().

    Safe to run concurrently with active reads and writes in WAL mode.
    """
    settings = get_settings()
    if source_database:
        source_path = Path(source_database).resolve()
    else:
        url = make_url(settings.resolved_database_url)
        if url.get_backend_name() != "sqlite" or not url.database:
            raise RuntimeError(f"Backup command supports SQLite only; current database is '{url.get_backend_name()}'.")
        source_path = Path(url.database).resolve()

    if not source_path.exists():
        raise FileNotFoundError(f"Database source file not found: {source_path}")

    backup_dir = Path(destination_dir).resolve() if destination_dir else settings.resolved_backup_dir
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp_str = datetime.now(ZoneInfo(settings.app_timezone)).strftime("%Y-%m-%d_%H%M%S")
    base_name = f"zhelezny_ryurik_{timestamp_str}"
    destination = backup_dir / f"{base_name}.db"

    # Ensure no overwriting of existing backups
    counter = 1
    while destination.exists():
        destination = backup_dir / f"{base_name}_{counter}.db"
        counter += 1

    temp_destination = backup_dir / f"{destination.name}.tmp"

    try:
        create_sqlite_snapshot(source_path, destination)

        if verify:
            counts = verify_backup_integrity(source_path, destination)
            size_kb = round(destination.stat().st_size / 1024, 1)
            print(f"[OK] Backup created and verified: {destination.name} ({size_kb} KB, tables: {counts})")
        else:
            print(f"[OK] Backup created (unverified): {destination.name}")

        return destination

    except Exception as exc:
        # Clean up partial/temporary file on failure
        if temp_destination.exists():
            try:
                temp_destination.unlink()
            except OSError:
                pass
        if destination.exists():
            try:
                destination.unlink()
            except OSError:
                pass
        print(f"[ERROR] Backup failed: {exc}", file=sys.stderr)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Create verified online backup of SQLite database.")
    parser.add_argument("--dest", type=Path, default=None, help="Custom destination directory")
    parser.add_argument("--no-verify", action="store_true", help="Skip integrity and schema verification")
    args = parser.parse_args()

    try:
        dest = create_backup(destination_dir=args.dest, verify=not args.no_verify)
        print(dest)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
