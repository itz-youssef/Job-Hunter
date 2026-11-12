import os,secrets,json,re
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI,Request,HTTPException,Depends
from fastapi.responses import FileResponse,JSONResponse
from fastapi.security import HTTPBasic,HTTPBasicCredentials
from pydantic import BaseModel,Field
from .db import db,init,settings
from .sources import validate_url,SourceError
from .mail import ready,send

@asynccontextmanager
async def lifespan(app):
    if len(os.environ.get('ADMIN_PASSWORD',''))<16:raise RuntimeError('Set ADMIN_PASSWORD to at least 16 characters')
    init();yield
app=FastAPI(title='Job Hunter',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
security=HTTPBasic()
def auth(credentials:HTTPBasicCredentials=Depends(security)):
    if not (secrets.compare_digest(credentials.username.encode(),os.getenv('ADMIN_USER','admin').encode()) and secrets.compare_digest(credentials.password.encode(),os.environ.get('ADMIN_PASSWORD','').encode())):raise HTTPException(401,'Invalid credentials',headers={'WWW-Authenticate':'Basic'})

@app.middleware('http')
async def headers(request:Request,call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        if request.headers.get('x-job-hunter')!='1':return JSONResponse({'detail':'Missing request header'},403)
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/')!=str(request.base_url).rstrip('/'):return JSONResponse({'detail':'Cross-origin request denied'},403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff';response.headers['X-Frame-Options']='DENY';response.headers['Referrer-Policy']='no-referrer';response.headers['Cache-Control']='no-store'
    response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response

@app.get('/',dependencies=[Depends(auth)])
def index():return FileResponse('dist/index.html')
@app.get('/assets/{name}',dependencies=[Depends(auth)])
def asset(name:str):
    if name not in ('app.js','style.css'):raise HTTPException(404)
    return FileResponse('dist/assets/'+name)
@app.get('/health')
def health():return {'ok':True}
@app.get('/api/state',dependencies=[Depends(auth)])
def state():
    with db() as c:
        sources=[dict(r) for r in c.execute('SELECT * FROM sources')]
        jobs=[dict(r) for r in c.execute('SELECT j.*,s.name AS company FROM jobs j JOIN sources s ON s.id=j.source_id ORDER BY detected DESC LIMIT 1000')]
        runs=[dict(r) for r in c.execute('SELECT r.*,s.name AS company FROM runs r LEFT JOIN sources s ON s.id=r.source_id ORDER BY r.id DESC LIMIT 50')]
        outbox=[dict(r) for r in c.execute('SELECT o.id,o.state,o.error,j.title FROM outbox o JOIN jobs j ON j.id=o.job_id ORDER BY o.id DESC LIMIT 50')]
        beat=c.execute("SELECT value FROM meta WHERE key='heartbeat'").fetchone()
    return {'mode':'server','sources':sources,'jobs':jobs,'runs':runs,'outbox':outbox,'settings':settings(),'smtp_ready':ready(),'heartbeat':beat[0] if beat else None}
class Preferences(BaseModel):
    interval:int=Field(30,ge=30,le=86400)
    email:str=Field('',max_length=254)
    email_enabled:bool=False
    paused:bool=False
    keywords:str=Field(max_length=2000)
    locations:str=Field(max_length=500)
    min_score:int=Field(3,ge=0,le=10)
@app.put('/api/settings',dependencies=[Depends(auth)])
def update_settings(p:Preferences):
    if p.email and not re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+',p.email):raise HTTPException(422,'Enter a valid email')
    with db() as c:
        for k,v in p.model_dump().items():c.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',(k,json.dumps(v)))
    return {'ok':True}
class NewSource(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    url:str=Field(max_length=2000)
@app.post('/api/sources',dependencies=[Depends(auth)])
def add_source(p:NewSource):
    try:validate_url(p.url)
    except SourceError as e:raise HTTPException(422,str(e))
    from urllib.parse import urlparse
    host=urlparse(p.url).hostname
    kind='workday' if host.endswith('.myworkdayjobs.com') else 'jsonld'
    with db() as c:
        if c.execute('SELECT 1 FROM sources WHERE url=?',(p.url,)).fetchone():raise HTTPException(409,'This careers URL is already added')
        c.execute('INSERT INTO sources(name,url,kind) VALUES (?,?,?)',(p.name.strip(),p.url,kind))
    return {'ok':True}
class Toggle(BaseModel):enabled:bool;approved:bool
@app.put('/api/sources/{source_id}',dependencies=[Depends(auth)])
def toggle(source_id:int,p:Toggle):
    with db() as c:
        row=c.execute('SELECT * FROM sources WHERE id=?',(source_id,)).fetchone()
        if not row:raise HTTPException(404)
        if p.enabled and not p.approved:raise HTTPException(422,'Review the source terms and permitted frequency first')
        if p.enabled and row['kind'] in ('eightfold',):raise HTTPException(422,'This adapter is not validated yet. Use the official careers link for now.')
        c.execute('UPDATE sources SET enabled=?,approved=?,next_check=0 WHERE id=?',(p.enabled,p.approved,source_id))
    return {'ok':True}
@app.post('/api/check',dependencies=[Depends(auth)])
def check():
    with db() as c:c.execute('UPDATE sources SET next_check=0 WHERE enabled=1 AND approved=1 AND failures=0')
    return {'ok':True,'message':'Queued enabled sources. Sources in failure backoff are not forced.'}
@app.post('/api/jobs/{job_id}/save',dependencies=[Depends(auth)])
def save(job_id:int):
    with db() as c:c.execute('UPDATE jobs SET saved=1-saved WHERE id=?',(job_id,))
    return {'ok':True}
@app.post('/api/email/test',dependencies=[Depends(auth)])
def test_email():
    cfg=settings()
    if not ready() or not cfg['email']:raise HTTPException(422,'Configure SMTP environment variables and save a destination email first')
    try:send('Job Hunter · Test alert','Your email connection works. Job alerts require an enabled source and a running worker.',cfg['email'])
    except Exception:raise HTTPException(502,'Email delivery failed. Check SMTP credentials, provider limits and server logs.')
    return {'ok':True,'message':'Test email accepted by your SMTP provider'}

@app.get('/DEPLOYMENT.md',dependencies=[Depends(auth)])
def deployment_guide():return FileResponse('DEPLOYMENT.md',media_type='text/markdown')
@app.get('/job-hunter-source.zip',dependencies=[Depends(auth)])
def download_source():
    path=Path('dist/job-hunter-source.zip')
    if not path.is_file():raise HTTPException(404,'Download the source from the original project website')
    return FileResponse(path,filename='job-hunter-source.zip')
