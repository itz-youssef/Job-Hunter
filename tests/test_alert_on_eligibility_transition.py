"""Historical employer-verified eligibility must trigger exactly one alert."""
from app import db as database

def test_reclassified_siemens_job_queues_one_email_and_preserves_identity(tmp_path,monkeypatch):
    monkeypatch.setenv("DB_PATH",str(tmp_path/"jobs.db"))
    database.init()
    with database.db() as conn:
        conn.execute(
           "INSERT INTO sources(name,url,kind,enabled,approved,baseline) VALUES (?,?,?,?,?,?)",
           ("Siemens","https://jobs.siemens.com/en_US/externaljobs","avature",1,1,1),
        )
        source=dict(conn.execute("SELECT * FROM sources WHERE name='Siemens'").fetchone())
    job={"external_id":"527985","title":"Software Development Engineer",
         "location":"Cairo, Egypt","description":"C++ programming",
         "published":"2026-11-03",
         "url":"https://jobs.siemens.com/en_US/externaljobs/JobDetail/527985",
         "employment":"Full time"}
    classifier=lambda j:((8,["Egypt", "Early Professional"]) if "Employer career level: Early Professional" in j["description"] else (0,["Early-career not confirmed"]))
    database.ingest(source,[job],classifier)
    with database.db() as conn:
        original=dict(conn.execute("SELECT * FROM jobs WHERE external_id='527985'").fetchone())
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0]==0
    eligible={**job,"description":"Employer career level: Early Professional. C++ programming"}
    database.ingest(source,[eligible],classifier)
    database.ingest(source,[eligible],classifier)
    with database.db() as conn:
        current=dict(conn.execute("SELECT * FROM jobs WHERE external_id='527985'").fetchone())
        queued=[dict(row) for row in conn.execute("SELECT * FROM outbox")]
    assert current["id"]==original["id"]
    assert current["detected"]==original["detected"]
    assert current["score"]==8
    assert len(queued)==1 and queued[0]["job_id"]==current["id"]
    assert queued[0]["state"]=="pending"


def test_new_source_baseline_does_not_email_existing_positions(tmp_path,monkeypatch):
    monkeypatch.setenv("DB_PATH",str(tmp_path/"jobs.db"))
    database.init()
    with database.db() as conn:
        source=dict(conn.execute("SELECT * FROM sources WHERE name='Siemens'").fetchone())
    job={"external_id":"527985","title":"Software Development Engineer",
         "location":"Cairo, Egypt","description":"Employer career level: Early Professional",
         "published":"2026-11-03","url":"https://jobs.siemens.com/en_US/externaljobs/JobDetail/527985","employment":"Full time"}
    database.ingest(source,[job],lambda j:(8,["early role"]))
    with database.db() as conn:
        assert conn.execute("SELECT count(*) FROM outbox").fetchone()[0]==0
