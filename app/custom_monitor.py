
"""Monitor companies and publish matching jobs.

Reads:
- companies.json
- dist/data.json

Writes:
- dist/data.json
- dist/custom-status.json
- data/custom_seen.json

Run:
python -m app.custom_monitor
"""

from __future__ import annotations

import argparse
import json
import os
import smtplib

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from app.custom_sources import scan_company
from app.filters import relevance


def _now():
    return datetime.now(
        timezone.utc
    ).isoformat()


def _read(path: Path, default):

    if not path.exists():
        return default

    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def _write(path: Path, data):

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporary = path.with_name(
        path.name + ".tmp"
    )

    temporary.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )

    temporary.replace(path)


def _id(job):

    return str(
        job.get("id")
        or job.get("url")
        or (
            f"{job.get('company')}:"
            f"{job.get('title')}:"
            f"{job.get('location')}"
        )
    )


def _enrich(job):

    # Existing filters.py controls Egypt,
    # targeted roles and junior eligibility.
    score, reasons = relevance(
        job, {}
    )

    if score <= 0:
        return None

    result = dict(job)

    result.update({
        "score": score,
        "match_score": score,
        "relevance_score": score,
        "matched": True,
        "reasons": reasons,
        "match_reasons": reasons,
        "url": (
            result.get("url")
            or result.get("apply_url")
            or result.get("link")
            or ""
        ),
        "discovered_at": (
            result.get("discovered_at")
            or _now()
        ),
    })

    result["apply_url"] = result["url"]
    result["link"] = result["url"]

    return result


def _smtp_ready():

    return all(
        os.getenv(k)
        for k in (
            "SMTP_USER",
            "SMTP_PASSWORD",
            "SMTP_FROM",
            "ALERT_EMAIL",
        )
    )


def _send_email(job):

    message = EmailMessage()

    message["From"] = os.environ[
        "SMTP_FROM"
    ]

    message["To"] = os.environ[
        "ALERT_EMAIL"
    ]

    message["Subject"] = (
        "New Egypt junior job: "
        f"{job['title']} - {job['company']}"
    )

    message.set_content(
        "\n".join([
            "New matching job found by Job Hunter",
            "",
            f"Company: {job['company']}",
            f"Position: {job['title']}",
            f"Location: {job['location']}",
            f"Match score: {job['match_score']}",
            f"Apply: {job['url']}",
        ])
    )

    host = (
        os.getenv("SMTP_HOST")
        or "smtp.gmail.com"
    )

    port = int(
        os.getenv("SMTP_PORT")
        or "587"
    )

    try:

        if port == 465:

            with smtplib.SMTP_SSL(
                host,
                port,
                timeout=20
            ) as smtp:

                smtp.login(
                    os.environ["SMTP_USER"],
                    os.environ["SMTP_PASSWORD"]
                )

                smtp.send_message(message)

        else:

            with smtplib.SMTP(
                host,
                port,
                timeout=20
            ) as smtp:

                smtp.starttls()

                smtp.login(
                    os.environ["SMTP_USER"],
                    os.environ["SMTP_PASSWORD"]
                )

                smtp.send_message(message)

        return True

    except (
        OSError,
        smtplib.SMTPException
    ) as exc:

        print(
            "Email delivery failed:",
            type(exc).__name__
        )

        return False


def run(
    registry_path: Path,
    snapshot_path: Path,
    state_path: Path,
    status_path: Path
):

    registry = _read(
        registry_path, []
    )

    if isinstance(registry, dict):
        registry = registry.get(
            "companies", []
        )

    if not isinstance(registry, list):
        raise ValueError(
            "companies.json must contain "
            "a list of companies"
        )

    companies = [
        c
        for c in registry[:100]
        if (
            isinstance(c, dict)
            and c.get("name")
            and c.get("url")
        )
    ]

    state = _read(
        state_path,
        {
            "companies": {},
            "pending": {},
        }
    )

    state.setdefault(
        "companies", {}
    )

    state.setdefault(
        "pending", {}
    )

    snapshot = _read(
        snapshot_path,
        {
            "mode": "snapshot",
            "jobs": [],
            "sources": [],
        }
    )

    if (
        not isinstance(snapshot, dict)
        or not isinstance(
            snapshot.get("jobs"), list
        )
    ):
        raise ValueError(
            "dist/data.json must "
            "contain a jobs array"
        )

    previous_custom = {
        _id(j): j
        for j in snapshot["jobs"]
        if (
            isinstance(j, dict)
            and j.get("source") == "Custom Careers"
        )
    }

    # A company rename must not create a new identity for the same URL.
    # Historic snapshots contain IDs derived from the old display name.
    previous_by_url = {
        str(j.get("url") or ""): j
        for j in previous_custom.values()
        if j.get("url")
    }

    regular_jobs = [
        j
        for j in snapshot["jobs"]
        if (
            isinstance(j, dict)
            and j.get("source") != "Custom Careers"
        )
    ]

    custom_jobs = {}
    statuses = []

    # Scan up to four companies simultaneously.
    with ThreadPoolExecutor(
        max_workers=4
    ) as pool:

        scan_results = list(
            pool.map(
                scan_company,
                companies
            )
        )

    for company, (
        jobs,
        status,
        message
    ) in zip(companies, scan_results):

        name = str(
            company["name"]
        ).strip()

        url = str(
            company["url"]
        ).strip()

        matches = [
            j
            for raw in jobs
            if (
                j := _enrich(raw)
            ) is not None
        ]

        statuses.append({
            "name": name,
            "url": url,
            "status": status,
            "message": message,
            "matched_jobs": len(matches),
            "checked_at": _now(),
        })

        record = state[
            "companies"
        ].setdefault(
            url,
            {
                "initialized": False,
                "seen_ids": [],
            }
        )

        if status != "monitoring":

            # Preserve historical jobs if a
            # previously monitored site fails.
            for key, old in previous_custom.items():

                if (
                    old.get("careers_url") == url
                    or (
                        not old.get("careers_url")
                        and old.get("company") == name
                    )
                ):
                    custom_jobs[key] = old

            continue

        previous_ids = set(
            record.get("seen_ids") or []
        )

        first_success = not record.get(
            "initialized", False
        )

        for job in matches:

            # Preserve job identity when only the company display name changes.
            old = previous_by_url.get(str(job.get("url") or ""))
            if old:
                job["id"] = old.get("id") or job.get("id")

            key = _id(job)
            job["careers_url"] = url

            if old:
                job["discovered_at"] = (
                    old.get("discovered_at") or job["discovered_at"]
                )

            custom_jobs[key] = job

            # First successful scan only
            # creates the notification baseline.
            if (
                not first_success
                and key not in previous_ids
            ):
                state["pending"][key] = job

        record["seen_ids"] = sorted(
            previous_ids
            | {
                _id(job)
                for job in matches
            }
        )[-3000:]

        record["initialized"] = True

    # Remove state for deleted companies.
    active_urls = {
        str(c["url"]).strip()
        for c in companies
    }

    active_names = {
        str(c["name"]).strip()
        for c in companies
    }

    for url in list(
        state["companies"]
    ):

        if url not in active_urls:
            del state["companies"][url]

    # Do not email deleted companies' jobs.
    state["pending"] = {
        key: job
        for key, job in state[
            "pending"
        ].items()
        if (
            job.get("careers_url") in active_urls
            or (
                not job.get("careers_url")
                and job.get("company") in active_names
            )
        )
    }

    merged = {}

    # Apply strict filter to custom and
    # previously discovered regular jobs.
    for raw in (
        regular_jobs
        + list(custom_jobs.values())
    ):

        item = _enrich(raw)

        if item is not None:
            merged[_id(item)] = item

    snapshot["jobs"] = list(
        merged.values()
    )

    snapshot["generated_at"] = _now()

    snapshot["custom_sources"] = statuses

    # Email only new matching jobs.
    sent = 0

    if _smtp_ready():

        for key, job in list(
            state["pending"].items()
        )[:10]:

            if _send_email(job):

                del state["pending"][key]

                sent += 1

            else:
                # Retain failed alerts for next run.
                break

    elif state["pending"]:

        print(
            "SMTP settings are missing; "
            "pending alerts retained"
        )

    # Publish dashboard and monitoring status.
    _write(
        snapshot_path,
        snapshot
    )

    _write(
        state_path,
        state
    )

    _write(
        status_path,
        {
            "checked_at": _now(),
            "companies": statuses,
        }
    )

    print(
        f"Checked {len(statuses)} custom companies; "
        f"{len(custom_jobs)} matched jobs; "
        f"{sent} emails sent"
    )

    return snapshot


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--registry",
        type=Path,
        default=Path(
            "companies.json"
        )
    )

    parser.add_argument(
        "--snapshot",
        type=Path,
        default=Path(
            "dist/data.json"
        )
    )

    parser.add_argument(
        "--state",
        type=Path,
        default=Path(
            "data/custom_seen.json"
        )
    )

    parser.add_argument(
        "--status",
        type=Path,
        default=Path(
            "dist/custom-status.json"
        )
    )

    args = parser.parse_args()

    run(
        args.registry,
        args.snapshot,
        args.state,
        args.status
    )


if __name__ == "__main__":
    main()
