"""SQLite state. One worker; short transactions, WAL, durable outbox."""
import os, sqlite3, json
from contextlib import contextmanager
from datetime import datetime, timezone

def now(): return datetime.now(timezone.utc).isoformat()
@contextmanager
def db():
    path=os.environ.get('DB_PATH','data/jobs.db'); os.makedirs(os.path.dirname(path) or '.',exist_ok=True)
    c=sqlite3.connect(path, timeout=20); c.row_factory=sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL'); c.execute('PRAGMA foreign_keys=ON')
    try: yield c; c.commit()
    except Exception: c.rollback(); raise
    finally: c.close()

def init():
    with db() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS sources(id INTEGER PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,enabled INTEGER DEFAULT 0,approved INTEGER DEFAULT 0,baseline INTEGER DEFAULT 0,last_check TEXT,status TEXT DEFAULT 'Needs review',error TEXT,next_check REAL DEFAULT 0,failures INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,source_id INTEGER REFERENCES sources(id),external_id TEXT,title TEXT,location TEXT,description TEXT,published TEXT,url TEXT,employment TEXT,detected TEXT,last_seen TEXT,score INTEGER,reasons TEXT,saved INTEGER DEFAULT 0,UNIQUE(source_id,external_id));
        CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,job_id INTEGER UNIQUE REFERENCES jobs(id),state TEXT DEFAULT 'pending',error TEXT,created TEXT);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
        CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY,source_id INTEGER,started TEXT,ended TEXT,count INTEGER,new_count INTEGER,status TEXT,error TEXT);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);''')
        seeds=[('Vodafone / VOIS','https://jobs.vodafone.com/careers?filter_country=Egypt','eightfold'),('Siemens','https://jobs.siemens.com/en_US/externaljobs','avature'),('Valeo','https://valeo.wd3.myworkdayjobs.com/en-US/valeo_jobs','workday'),('Microsoft','https://apply.careers.microsoft.com/careers','microsoft'),('Fawry','https://www.fawry.com/jobs/','jsonld')]
        c.executemany('INSERT OR IGNORE INTO sources(name,url,kind) VALUES (?,?,?)',seeds)
        for k,v in {'interval':30,'email':'','email_enabled':False,'paused':False,'keywords':'python,software,backend,machine learning,computer vision,deep learning,mlops,data scientist,artificial intelligence','locations':'egypt,cairo,giza','min_score':3}.items():
            c.execute('INSERT OR IGNORE INTO settings VALUES (?,?)',(k,json.dumps(v)))

def settings():
    with db() as c:return {r['key']:json.loads(r['value']) for r in c.execute('SELECT * FROM settings')}

def ingest(source,jobs,score_fn):
    fresh=0
    with db() as c:
        for j in jobs:
            score,reasons=score_fn(j); stamp=now()
            old=c.execute('SELECT id, score FROM jobs WHERE source_id=? AND external_id=?',(source['id'],j['external_id'])).fetchone()
            if old:
                c.execute('UPDATE jobs SET title=?,location=?,description=?,last_seen=?,score=?,reasons=?,published=COALESCE(NULLIF(?, \'\'),published) WHERE id=?',(j['title'],j['location'],j['description'],stamp,score,json.dumps(reasons),j.get('published'),old['id']))
                # A previously rejected role can gain employer-verified junior
                # evidence later. Alert once when it first becomes eligible.
                # UNIQUE(outbox.job_id) also prevents duplicate queue entries.
                if source['baseline'] and (old['score'] or 0)<settings()['min_score'] and score>=settings()['min_score']:
                    c.execute('INSERT OR IGNORE INTO outbox(job_id,created) VALUES (?,?)',(old['id'],stamp))
                continue
            cur=c.execute('INSERT INTO jobs(source_id,external_id,title,location,description,published,url,employment,detected,last_seen,score,reasons) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(source['id'],j['external_id'],j['title'],j['location'],j['description'],j.get('published'),j['url'],j.get('employment','Not provided'),stamp,stamp,score,json.dumps(reasons)))
            fresh+=1
            if source['baseline'] and score>=settings()['min_score']:
                c.execute('INSERT INTO outbox(job_id,created) VALUES (?,?)',(cur.lastrowid,stamp))
        c.execute('UPDATE sources SET baseline=1 WHERE id=?',(source['id'],))
    return fresh
