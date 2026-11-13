"""Latency telemetry without SMTP/network calls."""
import json
from app import custom_monitor as monitor


def test_email_includes_employer_date_and_first_seen_time(monkeypatch):
    messages = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self): pass
        def login(self, *args): pass
        def send_message(self, message): messages.append(message)

    monkeypatch.setattr(monitor.smtplib, "SMTP", SMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "sender")
    monkeypatch.setenv("SMTP_PASSWORD", "password")
    monkeypatch.setenv("SMTP_FROM", "sender@example.com")
    monkeypatch.setenv("ALERT_EMAIL", "alerts@example.com")
    job = {
        "title":"Software Engineering Intern", "company":"Example",
        "location":"Cairo, Egypt", "match_score":12,
        "url":"https://example.com/positions/1",
        "published_at":"2026-11-13T00:00:00Z",
        "discovered_at":"2026-11-13T07:30:00Z",
    }
    assert monitor._send_email(job) is True
    text = messages[0].get_content()
    assert "Employer posting date: 2026-11-13T00:00:00Z" in text
    assert "First detected by Job Hunter (UTC): 2026-11-13T07:30:00Z" in text
    assert "Alert prepared (UTC):" in text


def test_custom_scan_writes_alert_timing_counters(tmp_path, monkeypatch):
    r, snap, state, status = [tmp_path/p for p in ("companies.json","data.json","state.json","status.json")]
    r.write_text(json.dumps([{"name":"Example","url":"https://example.com/careers"}]))
    snap.write_text(json.dumps({"jobs":[],"sources":[]}))
    monkeypatch.setattr(monitor, "scan_company", lambda company: (
        [{"id":"i1","company":"Example","title":"Software Engineering Intern",
          "location":"Cairo, Egypt","url":"https://example.com/1",
          "description":"Python and FastAPI","source":"Custom Careers"}],
        "monitoring","1 verified role",
    ))
    monkeypatch.setattr(monitor,"_smtp_ready", lambda:False)
    monitor.run(r,snap,state,status)
    parsed=json.loads(status.read_text())
    assert parsed["scan_started_at"].endswith("+00:00")
    assert parsed["emails_accepted_by_smtp"] == 0
    assert parsed["pending_alerts"] == 0
    assert len(parsed["companies"])==1
