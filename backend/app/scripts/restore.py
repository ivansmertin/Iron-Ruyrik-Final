from __future__ import annotations

import argparse
from datetime import datetime
import logging
from pathlib import Path
import shutil
import sqlite3
import sys
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from app.config import get_settings
from app.database import SQLiteDatabaseLock
from app.scripts.backup import create_sqlite_snapshot

logger = logging.getLogger("app.scripts.restore")


def verify_sqlite_file(file_path: Path) -> str:
    """Verify SQLite integrity and return alembic version."""
    if not file_path.exists() or file_path.stat().st_size == 0:
        raise RuntimeError(f"Database file {file_path} is empty or missing.")

    conn = sqlite3.connect(f"file:{file_path.as_posix()}?mode=ro", uri=True)
    try:
        cursor = conn.cursor()
        res = cursor.execute("PRAGMA integrity_check").fetchone()
        if not res or res[0] != "ok":
            raise RuntimeError(f"Integrity check failed for {file_path}: {res}")

        tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "alembic_version" not in tables:
            raise RuntimeError(f"Missing alembic_version table in {file_path}")

        v = cursor.execute("SELECT version_num FROM alembic_version").fetchone()
        if not v or not v[0]:
            raise RuntimeError(f"alembic_version is empty in {file_path}")
        return v[0]
    finally:
        conn.close()


def restore_database(
    backup_path: Path | str,
    target_path: Path | str | None = None,
    confirm: bool = False,
) -> Path:
    """Safely restores a verified SQLite backup over the target database.
    
    Requires confirm=True to prevent accidental data destruction.
    Creates a pre-restore safety copy of the existing target database and cleans up stale WAL/SHM files.
    """
    if not confirm:
        raise RuntimeError(
            "RESTORE ABORTED: Restoring a database replaces current data. "
            "Pass --confirm (or confirm=True) to proceed."
        )

    b_path = Path(backup_path).resolve()
    if not b_path.exists():
        raise FileNotFoundError(f"Backup file not found: {b_path}")

    # 1. Pre-validate backup integrity
    b_version = verify_sqlite_file(b_path)
    print(f"Verified backup: {b_path.name} (alembic version: {b_version})")

    # 2. Determine target path
    if target_path:
        t_path = Path(target_path).resolve()
    else:
        url = make_url(get_settings().resolved_database_url)
        if url.get_backend_name() != "sqlite" or not url.database:
            raise RuntimeError(f"Target database is not SQLite: '{url.get_backend_name()}'.")
        t_path = Path(url.database).resolve()

    t_path.parent.mkdir(parents=True, exist_ok=True)
    database_lock = SQLiteDatabaseLock(t_path)
    database_lock.acquire()

    staged_restore = t_path.with_name(f"{t_path.name}.restore.tmp")
    try:
        if staged_restore.exists():
            staged_restore.unlink()
        shutil.copy2(b_path, staged_restore)
        staged_version = verify_sqlite_file(staged_restore)
        if staged_version != b_version:
            raise RuntimeError(f"Staged restore version mismatch: expected {b_version}, got {staged_version}")

        # 3. Create a WAL-aware pre-restore safety snapshot of the current target.
        if t_path.exists():
            stamp = datetime.now(ZoneInfo(get_settings().app_timezone)).strftime("%Y-%m-%d_%H%M%S")
            safety_copy = t_path.parent / f"{t_path.stem}.pre_restore_{stamp}.db"
            counter = 1
            while safety_copy.exists():
                safety_copy = t_path.parent / f"{t_path.stem}.pre_restore_{stamp}_{counter}.db"
                counter += 1
            create_sqlite_snapshot(t_path, safety_copy)
            verify_sqlite_file(safety_copy)
            print(f"Created pre-restore safety copy: {safety_copy.name}")

        # 4. Remove stale WAL and SHM files to prevent replaying old transactions
        wal_file = Path(f"{t_path.as_posix()}-wal")
        shm_file = Path(f"{t_path.as_posix()}-shm")
        for f in (wal_file, shm_file):
            if f.exists():
                try:
                    f.unlink()
                    print(f"Removed stale file: {f.name}")
                except PermissionError as exc:
                    raise RuntimeError(
                        f"Cannot restore database: '{f.name}' is locked by another process. "
                        "Please stop the backend application before restoring."
                    ) from exc

        # 5. Atomically replace the target with the staged, verified backup.
        staged_restore.replace(t_path)

        # 6. Verify restored database in place
        restored_version = verify_sqlite_file(t_path)
        if restored_version != b_version:
            raise RuntimeError(f"Restored version mismatch: expected {b_version}, got {restored_version}")
    finally:
        if staged_restore.exists():
            staged_restore.unlink()
        database_lock.release()

    print(f"[OK] Successfully restored {t_path.name} from {b_path.name} (version: {restored_version})")
    return t_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safely restore SQLite database from a verified backup."
    )
    parser.add_argument("backup_file", type=Path, help="Path to verified backup .db file")
    parser.add_argument("--target", type=Path, default=None, help="Target SQLite database file path")
    parser.add_argument("--confirm", action="store_true", help="Explicit confirmation to replace target database")
    args = parser.parse_args()

    try:
        restore_database(args.backup_file, target_path=args.target, confirm=args.confirm)
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
