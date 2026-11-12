import time,logging,threading,random,fcntl,os,json
from .db import db,init,now,settings,ingest
from .sources import fetch
from .filters import relevance
from .mail import deliver
log=logging.getLogger('jobhunter')
class JsonFormatter(logging.Formatter):
    def format(self,record):
        item={'timestamp':now(),'level':record.levelname,'message':record.getMessage()}
        if hasattr(record,'source_id'):item['source_id']=record.source_id
        if hasattr(record,'error'):item['error']=record.error
        if record.exc_info:item['exception']=self.formatException(record.exc_info)
        return json.dumps(item)


def scan(source):
    start=now();count=fresh=0;status='Healthy';error=None;retry_after=0
    try:
        jobs=fetch(source);count=len(jobs);cfg=settings();fresh=ingest(source,jobs,lambda j:relevance(j,cfg))
    except Exception as e:
        retry_after=getattr(e,'retry_after',0)
        status='Needs attention';error=f'{type(e).__name__}: {str(e)[:350]}';log.warning('source_scan_failed',extra={'source_id':source['id'],'error':error})
    failures=source['failures']+1 if error else 0
    delay=max(settings()['interval'],min(21600,300*2**min(failures-1,6))) if error else settings()['interval']
    delay=max(delay,retry_after)
    with db() as c:
        c.execute('UPDATE sources SET last_check=?,status=?,error=?,failures=?,next_check=? WHERE id=?',(now(),status,error,failures,time.time()+delay+random.random()*2,source['id']))
        c.execute('INSERT INTO runs(source_id,started,ended,count,new_count,status,error) VALUES(?,?,?,?,?,?,?)',(source['id'],start,now(),count,fresh,status,error))
        c.execute('DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 2000)')
    log.info('scan_complete source=%s count=%s new=%s status=%s',source['id'],count,fresh,status)

def loop(stop):
    init()
    # OS lock prevents two worker processes from dispatching the same notifications.
    lock=open(os.environ.get('DB_PATH','data/jobs.db')+'.worker.lock','w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('Another Job Hunter worker is already running')
    def heartbeat():
        while not stop.is_set():
            try:
                with db() as c:c.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('heartbeat',now()))
            except Exception:log.exception('heartbeat_failed')
            stop.wait(15)
    heartbeat_thread=threading.Thread(target=heartbeat,daemon=True);heartbeat_thread.start()
    try:
        while not stop.is_set():
            try:
                with db() as c:c.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('heartbeat',now()))
                if not settings()['paused']:
                    with db() as c:rows=[dict(r) for r in c.execute('SELECT * FROM sources WHERE enabled=1 AND approved=1 AND next_check<=?',(time.time(),))]
                    for source in rows:
                        if stop.is_set():break
                        scan(source)
                    deliver()
            except Exception:log.exception('worker_cycle_failed')
            stop.wait(1)
    finally:lock.close()

if __name__=='__main__':
    import signal
    handler=logging.StreamHandler();handler.setFormatter(JsonFormatter());logging.basicConfig(level=logging.INFO,handlers=[handler])
    stop=threading.Event();signal.signal(signal.SIGTERM,lambda *_:stop.set());signal.signal(signal.SIGINT,lambda *_:stop.set());loop(stop)
