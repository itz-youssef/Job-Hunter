import json,os,pytest
from fastapi.testclient import TestClient
from app.db import init,db,ingest,settings
from app.filters import relevance
from app.sources import validate_url,SourceError,workday,microsoft
from app import mail

@pytest.fixture(autouse=True)
def isolated(tmp_path,monkeypatch):
    monkeypatch.setenv('DB_PATH',str(tmp_path/'jobs.db'));monkeypatch.setenv('ADMIN_PASSWORD','test-password-long-enough');init()
def source():
    with db() as c:return dict(c.execute("SELECT * FROM sources WHERE name='Valeo'").fetchone())
def job(key='one'):
    return dict(external_id=key,title='Graduate Engineer',location='Cairo, Egypt',description='Build Python computer vision models',published=None,url='https://example.com/job/'+key,employment='Internship')
def score(j):return relevance(j,settings())
def test_baseline_and_dedup():
    s=source();ingest(s,[job()],score)
    with db() as c:assert c.execute('SELECT count(*) FROM outbox').fetchone()[0]==0
    s=source();j=job();j['title']='Updated title';j['published']='2026-11-12';ingest(s,[j,job('two')],score);ingest(s,[j,job('two')],score)
    with db() as c:
        assert c.execute('SELECT count(*) FROM jobs').fetchone()[0]==2
        assert c.execute('SELECT count(*) FROM outbox').fetchone()[0]==1
        assert c.execute("SELECT published FROM jobs WHERE external_id='one'").fetchone()[0] is None

def test_description_and_location():
    assert score(job())[0]>=3
    j=job();j['location']='Berlin, Germany';assert score(j)[0]==0
    j=job();j['description']='Civil bridge construction';assert score(j)[0]==0

def test_private_urls_rejected():
    for url in ['http://example.com','https://127.0.0.1','https://169.254.169.254','https://user:pass@example.com','https://[::1]']:
        with pytest.raises(SourceError):validate_url(url)

def test_api_security_and_persistence():
    from app.main import app
    with TestClient(app) as c:
        assert c.get('/api/state').status_code==401
        c.auth=('admin','test-password-long-enough')
        assert c.get('/api/state').json()['settings']['interval']==30
        data=settings();data['interval']=60
        assert c.put('/api/settings',json=data).status_code==403
        assert c.put('/api/settings',json=data,headers={'X-Job-Hunter':'1','Origin':'https://evil.test'}).status_code==403
        assert c.put('/api/settings',json=data,headers={'X-Job-Hunter':'1'}).status_code==200
        assert c.get('/api/state').json()['settings']['interval']==60
        assert c.post('/api/email/test',headers={'X-Job-Hunter':'1'}).status_code==422
        assert c.get('/').status_code==200
    init();assert settings()['interval']==60

def test_uncertain_mail_not_retried(monkeypatch):
    s=source();ingest(s,[job()],score);ingest(source(),[job('two')],score)
    with db() as c:
        c.execute('UPDATE settings SET value=? WHERE key=?',(json.dumps(True),'email_enabled'))
        c.execute('UPDATE settings SET value=? WHERE key=?',(json.dumps('test@example.com'),'email'))
    monkeypatch.setattr(mail,'ready',lambda:True);calls=[]
    def send(*args):calls.append(args);raise TimeoutError()
    monkeypatch.setattr(mail,'send',send);mail.deliver();mail.deliver()
    assert len(calls)==1
    with db() as c:assert c.execute('SELECT state FROM outbox').fetchone()[0]=='uncertain'

def test_success_mail_not_repeated(monkeypatch):
    ingest(source(),[job()],score);ingest(source(),[job('two')],score)
    with db() as c:
        c.execute('UPDATE settings SET value=? WHERE key=?',(json.dumps(True),'email_enabled'))
        c.execute('UPDATE settings SET value=? WHERE key=?',(json.dumps('test@example.com'),'email'))
    calls=[];monkeypatch.setattr(mail,'ready',lambda:True);monkeypatch.setattr(mail,'send',lambda *args:calls.append(args));mail.deliver();mail.deliver();assert len(calls)==1

def test_failed_source_does_not_baseline(monkeypatch):
    from app import worker
    def fail(_):raise SourceError('blocked')
    monkeypatch.setattr(worker,'fetch',fail);worker.scan(source())
    assert source()['baseline']==0
    assert source()['failures']==1
    assert source()['error']

def test_microsoft_incomplete_page_rejected():
    class Response:
        def json(self):return {'data':{'positions':[],'count':3}}
    class Client:
        def get(self,*args):return Response()
    with pytest.raises(SourceError):microsoft(source(),Client())

def test_robots_longest_match():
    from app.sources import robots_allowed
    text='User-agent: *\nDisallow: /\nAllow: /careers\nAllow: /api/pcsx\nDisallow: /careers/private'
    assert robots_allowed(text,'https://example.com/careers/job/123')
    assert robots_allowed(text,'https://example.com/api/pcsx/search?a=1')
    assert not robots_allowed(text,'https://example.com/careers/private/file')
    assert not robots_allowed(text,'https://example.com/account')
    assert robots_allowed('User-agent: *\nDisallow: /\nAllow: /$','https://example.com/')
    assert not robots_allowed('User-agent: *\nDisallow: /\nAllow: /$','https://example.com/x')

def test_custom_source_and_validation(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main,'validate_url',lambda url:url)
    with TestClient(main.app) as c:
        c.auth=('admin','test-password-long-enough');headers={'X-Job-Hunter':'1'}
        data={'name':'Example Careers','url':'https://example.com/careers'}
        assert c.post('/api/sources',json=data,headers=headers).status_code==200
        assert c.post('/api/sources',json=data,headers=headers).status_code==409
        rows=c.get('/api/state').json()['sources'];assert len(rows)==6
        custom=rows[-1];assert custom['enabled']==0
        assert c.put('/api/sources/'+str(custom['id']),json={'enabled':True,'approved':False},headers=headers).status_code==422

def test_retry_after_respected(monkeypatch):
    import time
    from app import worker
    def fail(_):raise SourceError('Rate limited',retry_after=3600)
    monkeypatch.setattr(worker,'fetch',fail);worker.scan(source())
    assert source()['next_check']>=time.time()+3599
