"""Public-source readers. Unsupported sources fail explicitly, never return fake jobs."""
import ipaddress, socket, time, json, re
from urllib.parse import urlparse,urljoin
from urllib.robotparser import RobotFileParser
import requests
from bs4 import BeautifulSoup
UA='JobHunter/1.0 (personal career monitoring)'
class SourceError(Exception):
    def __init__(self,message: str,retry_after: float=0):
        super().__init__(message);self.retry_after=retry_after


def validate_url(url: str) -> str:
    p=urlparse(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443):raise SourceError('Use a public HTTPS careers URL without credentials or custom ports.')
    try: addresses=socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)
    except OSError as e:raise SourceError('Cannot resolve careers hostname') from e
    if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise SourceError('Private and local network addresses are not allowed.')
    return url

def robots_allowed(text: str,url: str) -> bool:
    """Longest-match robots rules; Allow wins ties (RFC 9309)."""
    groups=[];agents=[];rules=[];in_rules=False
    for line in text.splitlines()+['User-agent: __end__']:
        line=line.split('#',1)[0].strip()
        if ':' not in line:continue
        key,value=[x.strip() for x in line.split(':',1)];key=key.lower()
        if key=='user-agent':
            if in_rules:groups.append((agents,rules));agents=[];rules=[];in_rules=False
            agents.append(value.lower())
        elif key in ('allow','disallow') and agents:
            in_rules=True
            if value:rules.append((key,value))
    if rules:groups.append((agents,rules))
    specific=[r for agents,r in groups if any(a!='*' and a in UA.lower() for a in agents)]
    selected=specific or [r for agents,r in groups if '*' in agents]
    parsed=urlparse(url);path=parsed.path or '/'
    if parsed.query:path+='?'+parsed.query
    matches=[]
    for group in selected:
        for kind,pattern in group:
            end=pattern.endswith('$');raw=pattern[:-1] if end else pattern
            regex='^'+re.escape(raw).replace(r'\*','.*')+('$' if end else '')
            if re.search(regex,path):matches.append((len(raw.replace('*','')),kind=='allow'))
    return max(matches)[1] if matches else True

class Client:
    def __init__(self):self.session=requests.Session();self.session.headers['User-Agent']=UA;self.robots={};self.last=0
    def raw(self,url,method='GET',payload=None):
        for redirect in range(5):
            validate_url(url);time.sleep(max(0,1-(time.monotonic()-self.last)));self.last=time.monotonic()
            r=self.session.request(method,url,json=payload,timeout=(8,25),allow_redirects=False,stream=True)
            if r.is_redirect:
                url=urljoin(url,r.headers['Location']);r.close();continue
            if r.status_code in (401,403,429):
                value=r.headers.get('Retry-After','0')
                try:retry=float(value)
                except ValueError:
                    from email.utils import parsedate_to_datetime
                    from datetime import datetime,timezone
                    try:retry=max(0,(parsedate_to_datetime(value)-datetime.now(timezone.utc)).total_seconds())
                    except (ValueError,TypeError):retry=0
                r.close();raise SourceError(f'Access restricted or rate limited: HTTP {r.status_code}; backoff required',retry_after=retry)
            r.raise_for_status(); chunks=[];size=0
            for part in r.iter_content(65536):
                size+=len(part)
                if size>5_000_000:r.close();raise SourceError('Response exceeds size limit')
                chunks.append(part)
            r._content=b''.join(chunks);r._content_consumed=True;r.close();return r
        raise SourceError('Too many redirects')
    def get(self,url,method='GET',payload=None):
        p=urlparse(url);origin=f'{p.scheme}://{p.netloc}'
        if origin not in self.robots:
            try:r=self.raw(origin+'/robots.txt')
            except requests.HTTPError as e:
                if e.response.status_code==404:r=None
                else:raise SourceError('robots.txt unavailable; source paused') from e
            bot=RobotFileParser();bot.parse(r.text.splitlines() if r is not None else ['User-agent: *','Allow: /']);self.robots[origin]=(bot,r.text if r is not None else 'User-agent: *\nAllow: /')
        bot,robot_text=self.robots[origin]
        if not robots_allowed(robot_text,url):raise SourceError('robots.txt disallows this path')
        delay=bot.crawl_delay(UA) or bot.crawl_delay('*') or 1
        rate=bot.request_rate(UA) or bot.request_rate('*')
        if rate:delay=max(delay,rate.seconds/rate.requests)
        time.sleep(max(0,delay-(time.monotonic()-self.last)))
        r=self.raw(url,method,payload)
        if urlparse(r.url).netloc!=p.netloc:raise SourceError('Cross-host redirect requires separate policy review')
        return r

def _workday_posting_date(text):
    """Only explicit employer 'Job Posting Date' is used; never infer it from startDate."""
    from datetime import date
    match=re.search(r"\bJob\s+Posting\s+Date\s*:\s*(\d{4}-\d{2}-\d{2})\b",str(text or ""),re.I)
    if not match:return None
    try:
        value=date.fromisoformat(match.group(1))
        if value>date.today():return None
        return value.isoformat()
    except ValueError:return None


def workday(source,client):
    p=urlparse(source['url']);tenant=p.hostname.split('.')[0]
    parts=[x for x in p.path.split('/') if x];site=parts[1] if parts and re.fullmatch(r'[a-z]{2}-[A-Z]{2}',parts[0]) else parts[0]
    root=f'https://{p.netloc}/wday/cxs/{tenant}/{site}';jobs=[];offset=0;seen=set();cached=cached_jobs(source)
    while True:
        body={'limit':20,'offset':offset,'searchText':'','appliedFacets':{}}
        if tenant=='valeo':body['appliedFacets']={'locationCountry':['d865e83093ad42319653b08e61f7db49']}
        d=client.get(root+'/jobs','POST',body).json()
        if not isinstance(d.get('jobPostings'),list) or not isinstance(d.get('total'),int):raise SourceError('Workday search schema changed')
        page=d['jobPostings']
        if not page and offset<d['total']:raise SourceError('Incomplete Workday pagination')
        for item in page:
            path=item['externalPath']
            if path in seen:raise SourceError('Repeated page: refusing incomplete scan')
            seen.add(path)
            reqid=next((str(x) for x in item.get('bulletFields',[]) if str(x) in cached),None)
            if reqid:
                job=cached[reqid].copy();job['title']=item['title'];job['location']=item.get('locationsText',job['location']);job['published']=job.get('published') or _workday_posting_date(job.get('description'));jobs.append(job);continue
            detail=client.get(root+path).json().get('jobPostingInfo',{})
            if not detail.get('jobReqId') or not detail.get('title') or not detail.get('jobDescription'):raise SourceError('Workday detail missing required fields')
            # Workday startDate is retained as raw evidence only until publication semantics are confirmed.
            jobs.append({'external_id':detail['jobReqId'],'title':detail['title'],'location':detail.get('location',item.get('locationsText','Unknown')),'description':BeautifulSoup(detail['jobDescription'],'html.parser').get_text(' ',strip=True),'published':_workday_posting_date(BeautifulSoup(detail['jobDescription'],'html.parser').get_text(' ',strip=True)),'employment':detail.get('timeType','Not provided'),'url':detail.get('externalUrl',f'https://{p.netloc}/{site}'+path)})
        offset+=len(page)
        if offset>=d['total']:break
        if offset>2000:raise SourceError('Pagination safety limit reached')
    return jobs

def walk_json(value):
    if isinstance(value,list):
        for x in value:yield from walk_json(x)
    if isinstance(value,dict):
        if value.get('@type')=='JobPosting' or 'JobPosting' in (value.get('@type') if isinstance(value.get('@type'),list) else []):yield value
        for x in value.values():
            if isinstance(x,(list,dict)):yield from walk_json(x)

def jsonld(source,client):
    soup=BeautifulSoup(client.get(source['url']).text,'html.parser');records=[]
    for tag in soup.select('script[type="application/ld+json"]'):
        try:records.extend(walk_json(json.loads(tag.string or tag.get_text())))
        except json.JSONDecodeError:continue
    if not records:raise SourceError('No JobPosting structured data on this URL. A company-specific adapter is required; adding a link alone cannot monitor this site.')
    jobs=[]
    for j in records:
        location=j.get('jobLocation',[]); location=location if isinstance(location,list) else [location]
        loc=', '.join(str(v) for l in location for v in l.get('address',{}).values() if isinstance(v,str))
        identifier=j.get('identifier',{});identifier=identifier.get('value') if isinstance(identifier,dict) else identifier
        url=urljoin(source['url'],j.get('url') or source['url']);validate_url(url)
        jobs.append({'external_id':str(identifier or url),'title':j['title'],'location':loc or 'Unknown','description':BeautifulSoup(j.get('description',''),'html.parser').get_text(' ',strip=True),'published':j.get('datePosted'),'employment':str(j.get('employmentType','Not provided')),'url':url})
    return jobs

def fetch(source: dict) -> list[dict]:
    client=Client()
    if source['kind']=='workday':return workday(source,client)
    if source['kind']=='microsoft':return microsoft(source,client)
    if source['kind']=='avature':return siemens(source,client)
    if source['kind']=='jsonld':return jsonld(source,client)
    raise SourceError('Adapter awaiting validation. Open the official careers page; automated monitoring is not enabled for this platform yet.')

def cached_jobs(source: dict) -> dict:
    from .db import db
    with db() as c:return {r['external_id']:dict(r) for r in c.execute('SELECT * FROM jobs WHERE source_id=?',(source['id'],))}

def microsoft(source,client):
    root='https://apply.careers.microsoft.com';start=0;jobs=[];seen=set();cached=cached_jobs(source)
    while True:
        data=client.get(root+f'/api/pcsx/search?domain=microsoft.com&query=&location=Egypt&start={start}').json().get('data',{})
        page=data.get('positions');total=data.get('count')
        if not isinstance(page,list) or not isinstance(total,int):raise SourceError('Microsoft search schema changed')
        for item in page:
            key=str(item['displayJobId'])
            if key in seen:raise SourceError('Repeated Microsoft page')
            seen.add(key)
            if key in cached:job=cached[key].copy()
            else:
                url=urljoin(root,item['positionUrl']);records=jsonld({'url':url},client)
                if len(records)!=1:raise SourceError('Microsoft detail did not return one job')
                job=records[0];job['external_id']=key
            job['title']=item['name'];job['location']=', '.join(item['locations']);jobs.append(job)
        start+=len(page)
        if start>=total:break
        if not page or start>2000:raise SourceError('Incomplete Microsoft pagination')
    return jobs

def siemens(source,client):
    from datetime import datetime
    url='https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt?folderRecordsPerPage=100';pages=set();links={};cached=cached_jobs(source)
    while url:
        if url in pages or len(pages)>100:raise SourceError('Siemens pagination loop or safety limit')
        pages.add(url);soup=BeautifulSoup(client.get(url).text,'html.parser')
        for a in soup.select('a[href]'):
            href=urljoin(url,a['href'])
            match=re.fullmatch(r'https://jobs\.siemens\.com/en_US/externaljobs/JobDetail/(\d+)',href)
            if match:links[match[1]]=href
        next_link=next((a for a in soup.select('a[href]') if a.get_text(' ',strip=True).lower().startswith('next')),None)
        url=urljoin(url,next_link['href']) if next_link else None
    if not links:raise SourceError('No Siemens job links found; cannot distinguish an empty result from changed markup')
    jobs=[]
    refresh_budget=30
    for key,url in links.items():
        old=cached.get(key)
        # Previously seen titles may have been rejected because the old
        # database snapshot lacked Siemens' explicit career-level metadata.
        title_hint=str((old or {}).get('title') or '')
        needs_refresh=(
            bool(old)
            and (old.get('score') or 0)<=0
            and refresh_budget>0
            and re.search(r'\\b(?:software|developer|programmer|machine learning|artificial intelligence|\\bai\\b|data engineer)\\b',title_hint,re.I)
            and not re.search(r'\\b(?:senior|manager|director|principal|lead|staff|architect)\\b',title_hint,re.I)
            and 'Employer career level:' not in str(old.get('description') or '')
        )
        if old and not needs_refresh:
            jobs.append(old)
            continue
        if needs_refresh:refresh_budget-=1
        soup=BeautifulSoup(client.get(url).text,'html.parser');fields={}
        for field in soup.select('.article__content__view__field'):
            label=field.select_one('.article__content__view__field__label');value=field.select_one('.article__content__view__field__value')
            if label and value:fields[label.get_text(' ',strip=True)]=value.get_text(' ',strip=True)
        title=soup.select_one('h3.section__header__text__title');article=soup.select_one('.tf_replaceFieldVideoTokens')
        if fields.get('Job ID')!=key or not title or not article:raise SourceError('Siemens detail markup changed')
        published=None
        try:published=datetime.strptime(fields.get('Posted since',''),'%d-%b-%Y').date().isoformat()
        except ValueError:pass
        career_level=str(fields.get('Experience level') or '').strip()
        description=article.get_text(' ',strip=True)
        if career_level:
            # Save verbatim, employer-stated metadata so cached rows retain
            # evidence of early career eligibility on later monitoring runs.
            description='Employer career level: '+career_level+'. '+description
        jobs.append({'external_id':key,'title':title.get_text(' ',strip=True),
          'location':fields.get('Location(s)','Unknown'),'description':description,
          'seniority':career_level,'published':published,
          'employment':fields.get('Job type','Not provided'),'url':url})
    return jobs
