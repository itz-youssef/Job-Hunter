"""Employer public jobs sources: Schneider Jibe, Etisalat Taleo and inDrive."""
from __future__ import annotations
import re
from html import unescape
from urllib.parse import urljoin

EGYPT=re.compile(r"\b(?:egypt|cairo|giza|alexandria|smart village)\b",re.I)

def schneider_egypt(name,get_json,make_job):
    """Use the official Jibe API; verify Egypt and complete total."""
    payload=get_json("https://careers.se.com/api/jobs?location=Egypt&limit=50&page=1")
    if not isinstance(payload,dict) or not isinstance(payload.get("jobs"),list):
        raise ValueError("Schneider Jibe jobs schema changed")
    rows=payload["jobs"]
    total=int(payload.get("totalCount",-1))
    if total<0 or len(rows)!=total:
        raise ValueError(f"Schneider API result incomplete ({len(rows)} of {total})")
    results={}
    for record in rows:
        item=record.get("data",{}) if isinstance(record,dict) else {}
        if not isinstance(item,dict) or str(item.get("country_code") or "").upper()!="EG":
            continue
        identity=str(item.get("req_id") or item.get("slug") or "")
        title=str(item.get("title") or "").strip()
        if not identity.isdecimal() or not title:continue
        location=str(item.get("full_location") or item.get("short_location") or "Egypt")
        if not EGYPT.search(location):location="Egypt"
        job=make_job(name,title,location,
          f"https://careers.se.com/jobs/{identity}?lang=en-US",
          str(item.get("description") or item.get("qualifications") or ""),
          str(item.get("posted_date") or item.get("create_date") or ""),
          str(item.get("employment_type") or ""))
        job["id"]="custom-schneider-"+identity
        results[identity]=job
    return list(results.values())

def etisalat_taleo_partial(name,get_bytes,make_job):
    """Read server-rendered Taleo first-page requisitions; clearly partial."""
    doc=get_bytes("https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl").decode("utf-8","replace")
    if "requisitionListInterface" not in doc:
        raise ValueError("Etisalat Taleo listings unavailable")
    start=doc.find("var _ftl")
    text=doc[start:] if start>=0 else doc
    regex=re.compile(r"'(?P<id>[0-9]{5,8})','(?P<title>[^']{5,180})','(?P=id)','(?P=title)'",re.I)
    matches=list(regex.finditer(text))
    if not matches:
        raise ValueError("Etisalat Taleo job identity schema changed")
    result={}
    for match in matches:
        ident=match.group("id")
        title=unescape(match.group("title")).strip()
        if not title or len(title)>160:continue
        tail=text[match.end():match.end()+650]
        number=re.search(r"Job Number:\s*([A-Z0-9]+)",tail,re.I)
        if not number:continue
        job_url=("https://etisalatmisr.taleo.net/careersection/ex/"
                 "jobdetail.ftl?job="+number.group(1)+"&lang=en")
        published=re.search(r"'([0-3]?[0-9]/[A-Za-z]{3}/[0-9]{4})'",tail)
        job=make_job(name,title,"Egypt",job_url,"",
                     published.group(1) if published else "","")
        job["id"]="custom-etisalat-"+ident
        result[ident]=job
    if not result:raise ValueError("No verified Etisalat Taleo requisitions")
    return list(result.values())

def indrive_egypt_partial(name,get_bytes,make_job):
    from html.parser import HTMLParser
    class Links(HTMLParser):
        def __init__(self):super().__init__();self.href=None;self.text=[];self.links=[]
        def handle_starttag(self,tag,attrs):
            if tag=="a":self.href=dict(attrs).get("href");self.text=[]
        def handle_data(self,txt):
            if self.href is not None:self.text.append(txt)
        def handle_endtag(self,tag):
            if tag=="a" and self.href is not None:
                self.links.append((self.href," ".join(" ".join(self.text).split())))
                self.href=None
    url="https://careers.indrive.com/vacancies/?country=Egypt"
    parser=Links();parser.feed(get_bytes(url).decode("utf-8","replace"))
    jobs={}
    for href,label in parser.links:
        link=urljoin(url,href)
        if not re.fullmatch(r"https://indrive\.pinpointhq\.com/en/postings/[0-9a-f-]{36}/?",link,re.I):
            continue
        if not EGYPT.search(label):continue
        title=re.split(r"\s+(?:Hybrid|Remote|On-site)\s+-\s+",label,1)[0].strip()
        if not title or len(title)>160:continue
        jobs[link]=make_job(name,title,"Egypt",link,"","","")
    if not jobs:raise ValueError("inDrive Egypt public vacancies unavailable")
    return list(jobs.values())
