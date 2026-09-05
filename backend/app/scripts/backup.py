from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy.engine import make_url

from app.config import PROJECT_DIR, get_settings


def backup() -> Path:
    url = make_url(get_settings().resolved_database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        raise RuntimeError("Backup command supports the current SQLite database only.")
    source_path = Path(url.database).resolve()
    if not source_path.exists(): raise FileNotFoundError(f"Database not found: {source_path}")
    backup_dir = PROJECT_DIR / "backups"; backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(ZoneInfo(get_settings().app_timezone)).strftime("%Y-%m-%d_%H%M%S")
    destination = backup_dir / f"zhelezny_ryurik_{stamp}.db"
    with sqlite3.connect(source_path) as source, sqlite3.connect(destination) as target:
        source.backup(target)
    print(destination)
    return destination


if __name__ == "__main__": backup()

