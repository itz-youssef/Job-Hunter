"""Existing rows should receive verified posting dates without resetting first-seen history."""
from app import db as database


def test_posting_date_backfill_preserves_history(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH",str(tmp_path/"jobs.db"))
    database.init()
    with database.db() as conn:
        conn.execute(
            "INSERT INTO sources(name,url,kind,enabled,approved,baseline) VALUES (?,?,?,?,?,?)",
            ("Sample","https://sample.example/jobs","workday",1,1,1),
        )
        source=dict(conn.execute("SELECT * FROM sources WHERE name='Sample'").fetchone())
    job={
        "external_id":"REQ123", "title":"Junior Software Engineer",
        "location":"Cairo, Egypt", "description":"Python 0-2 years",
        "published":None,"url":"https://sample.example/jobs/REQ123",
        "employment":"Full time"
    }
    score=lambda j:(8,["Target role"])
    database.ingest(source,[job],score)
    with database.db() as conn:
        before=dict(conn.execute("SELECT * FROM jobs WHERE external_id='REQ123'").fetchone())
    assert before["published"] is None
    database.ingest(source,[{**job,"published":"2026-09-28"}],score)
    with database.db() as conn:
        after=dict(conn.execute("SELECT * FROM jobs WHERE external_id='REQ123'").fetchone())
    assert after["published"]=="2026-09-28"
    assert after["id"]==before["id"]
    assert after["detected"]==before["detected"]
    database.ingest(source,[{**job,"published":""}],score)
    with database.db() as conn:
        final=dict(conn.execute("SELECT * FROM jobs WHERE external_id='REQ123'").fetchone())
    assert final["published"]=="2026-09-28"
    assert final["detected"]==before["detected"]
