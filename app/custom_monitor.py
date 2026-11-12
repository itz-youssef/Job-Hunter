
"""Scan custom careers and publish Egypt junior matches."""
from __future__ import annotations

import argparse
import json
import os
import smtplib

from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from app.custom_sources import scan_company
from app.filters import relevance


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default: Any):
    if not path.exists():
        return default

    with path.open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)

    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def email_ready():
    return all(
        os.getenv(key)
        for key in (
            "SMTP_USER",
            "SMTP_PASSWORD",
            "SMTP_FROM",
            "ALERT_EMAIL",
        )
    )


def send_email(job):
    if not email_ready():
        return False

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT") or "587")

    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = os.environ["ALERT_EMAIL"]
    message["Subject"] = (
        f"New Egypt junior job: "
        f"{job['title']} — {job['company']}"
    )

    message.set_content("\n".join([
        f"Company: {job['company']}",
        f"Role: {job['title']}",
        f"Location: {job['location']}",
        f"Match score: {job['match_score']}",
        f"Source: {job['source']}",
        f"Apply: {job['url']}",
    ]))

    try:
        if port == 465:
            with smtplib.SMTP_SSL(
                host, port, timeout=15
            ) as client:
                client.login(
                    os.environ["SMTP_USER"],
                    os.environ["SMTP_PASSWORD"],
                )
                client.send_message(message)
        else:
            with smtplib.SMTP(
                host, port, timeout=15
            ) as client:
                client.starttls()
                client.login(
                    os.environ["SMTP_USER"],
                    os.environ["SMTP_PASSWORD"],
                )
                client.send_message(message)

        return True

    except (OSError, smtplib.SMTPException) as error:
        print("Email failed:", type(error).__name__)
        return False


def enrich(job):
    score, reasons = relevance(job, {})

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
        "apply_url": result.get(
            "url", result.get("apply_url", "")
        ),
        "link": result.get(
            "url", result.get("link", "")
        ),
        "discovered_at": result.get(
            "discovered_at"
        ) or now(),
    })

    return result


def job_key(job):
    return str(
        job.get("id")
        or job.get("url")
        or (
            f"{job.get('company','')}:"
            f"{job.get('title','')}:"
            f"{job.get('location','')}"
        )
    )


def run(
    registry_path,
    snapshot_path,
    state_path,
    status_path,
):
    registry = read_json(registry_path, [])

    if isinstance(registry, dict):
        registry = registry.get("companies", [])

    if not isinstance(registry, list):
        raise ValueError("companies.json must contain an array")

    state = read_json(
        state_path,
        {"companies": {}, "pending": {}},
    )

    state.setdefault("companies", {})
    state.setdefault("pending", {})

    snapshot = read_json(
        snapshot_path,
        {"mode": "snapshot", "jobs": [], "sources": []},
    )

    if (
        not isinstance(snapshot, dict)
        or not isinstance(snapshot.get("jobs"), list)
    ):
        raise ValueError("Invalid job snapshot")

    old_custom = {
        job_key(job): job
        for job in snapshot["jobs"]
        if (
            isinstance(job, dict)
            and job.get("source") == "Custom Careers"
        )
    }

    regular = [
        job
        for job in snapshot["jobs"]
        if (
            isinstance(job, dict)
            and job.get("source") != "Custom Careers"
        )
    ]

    custom = {}
    statuses = []
    active_urls = set()

    for company in registry[:100]:
        if not isinstance(company, dict):
            continue

        url = str(company.get("url", "")).strip()
        name = str(company.get("name", "")).strip()

        if not url or not name:
            continue

        active_urls.add(url)

        jobs, status, explanation = scan_company(company)

        eligible = [
            item
            for item in (enrich(job) for job in jobs)
            if item is not None
        ]

        statuses.append({
            "name": name,
            "url": url,
            "status": status,
            "message": explanation,
            "matched_jobs": len(eligible),
            "checked_at": now(),
        })

        record = state["companies"].setdefault(
            url,
            {
                "initialized": False,
                "seen_ids": [],
            },
        )

        if status != "monitoring":
            for job_id, previous in old_custom.items():
                if previous.get("company") == name:
                    custom[job_id] = previous
            continue

        previous_ids = set(record.get("seen_ids", []))

        for job in eligible:
            job_id = job_key(job)
            custom[job_id] = job

            if (
                record.get("initialized")
                and job_id not in previous_ids
            ):
                state["pending"][job_id] = job

        current_ids = {
            job_key(job) for job in eligible
        }

        record["seen_ids"] = sorted(
            previous_ids | current_ids
        )[-3000:]

        record["initialized"] = True

    for url in list(state["companies"]):
        if url not in active_urls:
            del state["companies"][url]

    active_names = {
        str(c.get("name", "")).strip()
        for c in registry
        if isinstance(c, dict)
    }

    state["pending"] = {
        key: value
        for key, value in state["pending"].items()
        if value.get("company") in active_names
    }

    all_jobs = regular + list(custom.values())

    strict_matches = [
        match
        for raw in all_jobs
        if (match := enrich(raw)) is not None
    ]

    unique = {
        job_key(job): job
        for job in strict_matches
    }

    snapshot["jobs"] = list(unique.values())
    snapshot["generated_at"] = now()
    snapshot["custom_sources"] = statuses

    sent = 0

    if email_ready():
        for job_id, job in list(
            state["pending"].items()
        )[:10]:
            if send_email(job):
                del state["pending"][job_id]
                sent += 1
            else:
                break
    elif state["pending"]:
        print("SMTP configuration missing; emails queued")

    write_json(snapshot_path, snapshot)
    write_json(state_path, state)

    write_json(status_path, {
        "checked_at": now(),
        "companies": statuses,
    })

    print(
        f"Custom careers: {len(statuses)} sources, "
        f"{len(custom)} matches, {sent} emails sent"
    )

    return snapshot


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("companies.json"),
    )

    parser.add_argument(
        "--snapshot",
        type=Path,
        default=Path("dist/data.json"),
    )

    parser.add_argument(
        "--state",
        type=Path,
        default=Path("data/custom_seen.json"),
    )

    parser.add_argument(
        "--status",
        type=Path,
        default=Path("dist/custom-status.json"),
    )

    args = parser.parse_args()

    run(
        args.registry,
        args.snapshot,
        args.state,
        args.status,
    )


if __name__ == "__main__":
    main()
