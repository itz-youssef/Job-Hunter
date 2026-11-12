"""Offline contract tests for expanded public job boards and rename safety."""
import json
from app import custom_sources as cs
from app import custom_monitor as cm


def test_recruitee_public_offers(monkeypatch):
    url = "https://example.recruitee.com/"
    assert cs._ats(url)[0] == "recruitee"
    monkeypatch.setattr(cs, "_json", lambda endpoint: {
        "offers": [{
            "title": "Junior Backend Engineer", "slug": "backend",
            "locations": [{"city": "Cairo", "country": "Egypt"}],
            "description": "Python, 0-2 years experience",
            "careers_url": "https://example.recruitee.com/o/backend"
        }]
    })
    jobs = cs._board_jobs("Example", url)
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["url"] == "https://example.recruitee.com/o/backend"


def test_bamboohr_public_list(monkeypatch):
    url = "https://example.bamboohr.com/careers"
    assert cs._ats(url)[0] == "bamboohr"
    def fake_json(endpoint):
        if endpoint.endswith("/careers/list"):
            return {"result": [{
                "id": 20, "jobOpeningName": "Junior Software Engineer",
                "atsLocation": {"city": "Cairo", "country": "Egypt"},
                "employmentStatusLabel": "Full-time"
            }]}
        return {"description": "Python 0-2 years"}
    monkeypatch.setattr(cs, "_json", fake_json)
    jobs = cs._board_jobs("Example", url)
    assert len(jobs) == 1
    assert "0-2 years" in jobs[0]["description"]


def test_breezy_public_listing(monkeypatch):
    url = "https://example.breezy.hr"
    assert cs._ats(url)[0] == "breezy"
    monkeypatch.setattr(cs, "_json", lambda _: [
        {"name": "Junior AI Engineer", "friendly_id": "42-ai", "location": {"city": "Giza", "country": "Egypt"}}
    ])
    jobs = cs._board_jobs("Example", url)
    assert len(jobs) == 1
    assert jobs[0]["url"].endswith("/p/42-ai")


def test_embedded_ats_board_detected(monkeypatch):
    page = "https://example.com/careers"
    monkeypatch.setattr(cs, "_bytes", lambda _: (
        '<html><script>const board="https://jobs.ashbyhq.com/example";</script></html>'
    ).encode())
    monkeypatch.setattr(cs, "_board_jobs", lambda *args: [
        cs._job("Example", "Junior Software Engineer", "Cairo, Egypt",
                "https://jobs.ashbyhq.com/example/one", "0-2 years Python")
    ])
    jobs, status, reason = cs._discover("Example", page)
    assert status == "monitoring"
    assert len(jobs) == 1


def test_rename_preserves_identity_and_does_not_queue_existing_job(tmp_path, monkeypatch):
    url = "https://example.com/careers"
    joburl = "https://example.com/jobs/1"
    reg = tmp_path / "companies.json"
    snapshot = tmp_path / "data.json"
    state = tmp_path / "seen.json"
    status = tmp_path / "status.json"
    reg.write_text(json.dumps([{"name": "Old Name", "url": url}]))
    snapshot.write_text(json.dumps({"jobs": [], "sources": []}))
    monkeypatch.setattr(cm, "_smtp_ready", lambda: False)
    name = ["Old Name"]
    def mock_scan(_):
        return ([{
            "id": "custom-" + name[0].lower().replace(" ","-") + "-1",
            "company": name[0], "title": "Junior Software Engineer",
            "location": "Cairo, Egypt", "description": "0-2 years Python",
            "url": joburl, "source": "Custom Careers"
        }], "monitoring", "1 job")
    monkeypatch.setattr(cm, "scan_company", mock_scan)
    cm.run(reg,snapshot,state,status)
    oldid=json.loads(snapshot.read_text())["jobs"][0]["id"]
    name[0]="New Name"
    reg.write_text(json.dumps([{"name": "New Name", "url": url}]))
    cm.run(reg,snapshot,state,status)
    current=json.loads(snapshot.read_text())["jobs"]
    assert current[0]["id"] == oldid
    assert current[0]["company"] == "New Name"
    assert json.loads(state.read_text())["pending"] == {}
    stats=json.loads(status.read_text())["companies"][0]
    assert stats["parsed_jobs"] == 1
    assert stats["matched_jobs"] == 1
