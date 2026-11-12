"""Send pending alerts with durable checkpoints on GitHub."""

import logging
import os
import sqlite3
import subprocess
from pathlib import Path

from .mail import deliver


def git(*args: str) -> None:
    subprocess.run(["git", *args], check=True)


def checkpoint() -> None:
    database = Path(os.getenv("DB_PATH", "data/jobs.db"))
    if not database.is_file():
        raise RuntimeError("Job database is missing. Stopping.")

    state = Path("state")
    state.mkdir(exist_ok=True)
    temporary = state / "history.tmp.sqlite"

    with sqlite3.connect(database) as source:
        with sqlite3.connect(temporary) as destination:
            source.backup(destination)
            result = destination.execute(
                "PRAGMA integrity_check"
            ).fetchone()[0]
            if result != "ok":
                raise RuntimeError("Database backup failed integrity check.")

    temporary.replace(state / "history.sqlite")
    (state / "initialized").write_text(
        "Job history initialized\n", encoding="utf-8"
    )

    git("add", "state/history.sqlite", "state/initialized")
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        check=False,
    )
    if result.returncode == 1:
        git("commit", "-m", "Save email notification state")
    elif result.returncode != 0:
        raise RuntimeError("Could not inspect database changes.")

    # Failure here stops delivery. Never send before the push succeeds.
    git("push", "origin", "HEAD:main")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    required = ("SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "ALERT_EMAIL")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing secrets: " + ", ".join(missing))

    git("config", "user.name", "github-actions[bot]")
    git(
        "config",
        "user.email",
        "41898282+github-actions[bot]@users.noreply.github.com",
    )

    deliver(checkpoint=checkpoint)
    logging.info("Email notification check completed.")


if __name__ == "__main__":
    main()
