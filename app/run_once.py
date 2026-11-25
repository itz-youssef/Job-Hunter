"""Run one monitoring scan, then exit."""

import logging
import os
import sys
import time

from app.db import db, init
from app.worker import scan


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    init()

    # Start with the two sources that returned real jobs in testing.
    company_names = {
        name.strip()
        for name in os.getenv(
            "MONITOR_COMPANIES", "Valeo,Microsoft"
        ).split(",")
        if name.strip()
    }

    with db() as connection:
        sources = [
            dict(row)
            for row in connection.execute("SELECT * FROM sources")
            if row["name"] in company_names
        ]

    found_names = {source["name"] for source in sources}
    unknown_names = company_names - found_names

    if unknown_names or not sources:
        logging.error(
            "Invalid company selection: %s",
            ", ".join(sorted(unknown_names)) or "empty selection",
        )
        return 1

    failures = 0
    skipped = 0

    for source in sources:
        # Respect a provider's rate-limit backoff across scheduled runs.
        if source.get('error') and float(source.get('next_check') or 0) > time.time():
            skipped += 1
            logging.warning('%s: deferred until source backoff expires', source['name'])
            continue
        logging.info("Checking %s", source["name"])
        scan(source)

        with db() as connection:
            result = connection.execute(
                "SELECT status, error FROM sources WHERE id = ?",
                (source["id"],),
            ).fetchone()

        if result["error"]:
            failures += 1
            logging.error(
                "%s: %s", source["name"], result["error"]
            )
        else:
            logging.info("%s: scan completed", source["name"])

    logging.info(
        "Finished: %s successful, %s failed, %s deferred",
        len(sources) - failures - skipped,
        failures,
        skipped,
    )

    # The workflow publishes partial success and marks failed sources honestly.
    return 1 if failures and failures == len(sources) - skipped else 0


if __name__ == "__main__":
    sys.exit(main())
