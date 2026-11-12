import json
from app import custom_monitor as monitor


def test_new_job_alert_only_after_first_success(tmp_path, monkeypatch):
    registry = tmp_path / "companies.json"
    snapshot = tmp_path / "data.json"
    state = tmp_path / "state.json"
    status = tmp_path / "status.json"
    company = {"name": "Example", "url": "https://example.com/careers"}
    registry.write_text(json.dumps([company]), encoding="utf-8")
    snapshot.write_text(json.dumps({"jobs": [], "sources": []}), encoding="utf-8")

    def job(identifier):
        return {
            "id": identifier, "company": "Example",
            "title": "Junior Software Engineer",
            "location": "Cairo, Egypt",
            "description": "Python, 0-2 years experience",
            "url": f"https://example.com/job/{identifier}",
            "source": "Custom Careers",
        }

    current = [job("first")]
    monkeypatch.setattr(monitor, "scan_company",
                        lambda _: (list(current), "monitoring", f"{len(current)} jobs"))
    monkeypatch.setattr(monitor, "_smtp_ready", lambda: False)

    monitor.run(registry, snapshot, state, status)
    assert json.loads(state.read_text())["pending"] == {}
    assert len(json.loads(snapshot.read_text())["jobs"]) == 1
    assert json.loads(status.read_text())["companies"][0]["matched_jobs"] == 1

    current.append(job("second"))
    monitor.run(registry, snapshot, state, status)
    second = json.loads(state.read_text())
    assert list(second["pending"]) == ["second"]
    assert len(json.loads(snapshot.read_text())["jobs"]) == 2

    monitor.run(registry, snapshot, state, status)
    assert list(json.loads(state.read_text())["pending"]) == ["second"]
