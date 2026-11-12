"""Export public job data for the website. Never export credentials."""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    database = Path(os.getenv("DB_PATH", "data/jobs.db")).resolve()
    if not database.is_file():
        raise RuntimeError("Job database is missing.")

    monitored = {
        name.strip()
        for name in os.getenv(
            "MONITOR_COMPANIES", "Valeo,Microsoft"
        ).split(",")
        if name.strip()
    }

    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row

    try:
        sources = [
            dict(row)
            for row in connection.execute(
                """
                SELECT id, name, url, kind, status, last_check
                FROM sources
                ORDER BY id
                """
            )
        ]

        jobs = [
            dict(row)
            for row in connection.execute(
                """
                SELECT
                    j.id, j.source_id, j.title, j.location,
                    j.description, j.published, j.url,
                    j.employment, j.detected, j.last_seen,
                    j.score, j.reasons, s.name AS company
                FROM jobs j
                JOIN sources s ON s.id = j.source_id
                ORDER BY j.detected DESC, j.id DESC
                """
            )
        ]

        # Export only these non-sensitive preferences.
        public_settings = {
            "keywords": "",
            "locations": "",
            "min_score": 3,
        }
        for key in public_settings:
            row = connection.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            ).fetchone()
            if row:
                public_settings[key] = json.loads(row["value"])

    finally:
        connection.close()

    for source in sources:
        source["enabled"] = source["name"] in monitored
        if not source["enabled"]:
            source["status"] = "Not monitored"

    payload = {
        "mode": "snapshot",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "jobs": jobs,
        "settings": public_settings,
    }

    output = Path("dist/data.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )
    temporary.replace(output)

    print(f"Exported {len(jobs)} jobs for the website.")


if __name__ == "__main__":
    main()
