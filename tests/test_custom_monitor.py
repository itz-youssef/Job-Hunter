"""Regression tests for the custom careers snapshot, without network or SMTP."""
import json

from app import custom_monitor as monitor
from app import custom_sources as sources
from app.filters import relevance


def make_job(key, title="Junior Software Engineer", location="Cairo, Egypt"):
    return {
        "id": key,
        "company": "Example",
        "title": title,
        "location": location,
        "description": "Python, FastAPI and Docker; 0-2 years experience",
        "employment": "Full-time",
        "url": f"https://example.com/jobs/{key}",
        "source": "Custom Careers",
    }


def test_location_level_and_role_are_hard_requirements():
    assert relevance(make_job("1"), {})[0] > 0
    assert relevance(make_job("2", location="Berlin, Germany"), {})[0] == 0
    assert relevance(make_job("3", title="Senior Software Engineer"), {})[0] == 0
    assert relevance(make_job("4", title="Junior Sales Engineer"), {})[0] == 0
    assert relevance(make_job("5", title="Software Engineer"), {})[0] > 0


def test_first_scan_creates_baseline_and_explains_exclusions(tmp_path, monkeypatch):
    registry = tmp_path / "companies.json"
    snapshot = tmp_path / "dist" / "data.json"
    state = tmp_path / "data" / "custom_seen.json"
    status = tmp_path / "dist" / "custom-status.json"

    registry.write_text(
        json.dumps([{"name": "Example", "url": "https://example.com/careers"}]),
        encoding="utf-8",
    )
    snapshot.parent.mkdir(parents=True)
    snapshot.write_text(
        json.dumps({"mode": "snapshot", "jobs": [], "sources": []}),
        encoding="utf-8",
    )
    # Never send mail during unit tests.
    monkeypatch.setattr(monitor, "_smtp_ready", lambda: False)
    monkeypatch.setattr(
        monitor, "scan_company",
        lambda _: (
            [
                make_job("eligible"),
                make_job("overseas", location="Berlin, Germany"),
                make_job("senior", title="Senior Software Engineer"),
            ],
            "monitoring",
            "3 jobs parsed",
        ),
    )

    monitor.run(registry, snapshot, state, status)

    report = json.loads(status.read_text(encoding="utf-8"))
    row = report["companies"][0]
    assert row["parsed_jobs"] == 3
    assert row["matched_jobs"] == 1
    assert row["excluded_jobs"] == 2
    assert len(row["exclusion_reasons"]) == 2
    assert len(json.loads(snapshot.read_text())["jobs"]) == 1
    saved = json.loads(state.read_text())
    assert saved["companies"]["https://example.com/careers"]["initialized"]
    assert saved["pending"] == {}


def test_new_job_is_queued_only_after_initial_scan(tmp_path, monkeypatch):
    registry = tmp_path / "companies.json"
    snapshot = tmp_path / "dist" / "data.json"
    state = tmp_path / "data" / "custom_seen.json"
    status = tmp_path / "dist" / "custom-status.json"

    registry.write_text(
        json.dumps([{"name": "Example", "url": "https://example.com/careers"}]),
        encoding="utf-8",
    )
    snapshot.parent.mkdir(parents=True)
    snapshot.write_text(json.dumps({"jobs": [], "sources": []}), encoding="utf-8")

    jobs = [make_job("first")]
    monkeypatch.setattr(monitor, "_smtp_ready", lambda: False)
    monkeypatch.setattr(
        monitor, "scan_company",
        lambda _: (list(jobs), "monitoring", f"{len(jobs)} jobs parsed"),
    )

    monitor.run(registry, snapshot, state, status)
    assert json.loads(state.read_text())["pending"] == {}
    jobs.append(make_job("second"))
    monitor.run(registry, snapshot, state, status)
    assert list(json.loads(state.read_text())["pending"]) == ["second"]


def test_structured_jobposting_extraction_is_deduplicated():
    page = '''<html><script type="application/ld+json">
    {"@graph":[{"@type":"JobPosting","title":"Junior Software Engineer",
    "jobLocation":{"address":{"addressLocality":"Cairo","addressCountry":"EG"}},
    "description":"Python 0-2 years","url":"https://example.com/job/42"}]}
    </script></html>'''
    jobs = sources._dedupe(
        sources._structured_jobs("Example", "https://example.com/careers", page)
        * 2
    )
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["url"] == "https://example.com/job/42"
