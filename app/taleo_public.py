"""Read public Taleo requisitions, preserving real job identities and page completeness."""
from __future__ import annotations
import re
import json
from datetime import datetime
from urllib.parse import quote
import requests

BOARDS = {
    "cib_egypt": ("cibeg.taleo.net", "cib_ex"),
    "etisalat_egypt": ("etisalatmisr.taleo.net", "ex"),
}
EGYPT = re.compile(r"\b(?:Egypt|Cairo|Giza|Alexandria|EGY|EG|Etisalat[- ]Misr)\b", re.I)
FOREIGN = re.compile(r"\b(?:UAE|Saudi Arabia|Dubai|Jordan|United States|United Kingdom|India|Kenya)\b", re.I)

def public_pages(kind, session=None, *, max_pages=100):
    host, section = BOARDS[kind]
    own_session = session is None
    session = session or requests.Session()
    root = f"https://{host}/careersection/{section}/"
    base = root+"jobsearch.ftl?lang=en"
    try:
        session.headers.update({"User-Agent":"Mozilla/5.0","Accept":"application/json,text/html,*/*"})
        portals=[]
        for path in ("jobsearch.ftl?lang=en","moresearch.ftl?lang=en","joblist.ftl?lang=en"):
            response=session.get(root+path,timeout=25)
            response.raise_for_status()
            html=response.text
            for pattern in (r'\bportal\s*[:=]\s*["\']?(\d{5,})',r'\bportalId\s*[:=]\s*["\']?(\d{5,})',r'["\']portal["\']\s*,\s*["\'](\d{5,})',r'name=["\']portal["\'][^>]*value=["\'](\d{5,})'):
                portals.extend(re.findall(pattern,html,re.I))
            if portals: break
        portals=list(dict.fromkeys(portals))
        if len(portals)>1:raise ValueError("Ambiguous public Taleo portal")
        # Some legacy pages expose an empty portal field; try only the public
        # request with that field, not a guessed portal identifier.
        portal=portals[0] if portals else ""
        headers={"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest","Referer":base,"Origin":f"https://{host}","tz":"GMT+02:00","tzname":"Africa/Cairo"}
        results={}
        counts=set()
        errors=[]
        for sort,ascending in (("3","false"),("3","true")):
            signatures=set()
            for page in range(1,max_pages+1):
                body={"multilineEnabled":False,"sortingSelection":{"sortBySelectionParam":sort,"ascendingSortingOrder":ascending},
                      "fieldData":{"fields":{"KEYWORD":"","JOB_TITLE":"","JOB_NUMBER":"","LOCATION":""},"valid":True},
                      "filterSelectionParam":{"searchFilterSelections":[{"id":k,"selectedValues":[]} for k in ("POSTING_DATE","LOCATION","JOB_FIELD","JOB_SCHEDULE","JOB_TYPE")]},
                      "advancedSearchFiltersSelectionParam":{"searchFilterSelections":[{"id":k,"selectedValues":[]} for k in ("ORGANIZATION","LOCATION","JOB_FIELD","URGENT_JOB","EMPLOYEE_STATUS")]},
                      "pageNo":page}
                try:
                    response=session.post(f"https://{host}/careersection/rest/jobboard/searchjobs",params={"lang":"en","portal":portal},headers=headers,json=body,timeout=30)
                    response.raise_for_status()
                    data=response.json()
                    total=int(data["pagingData"]["totalCount"])
                    rows=data["requisitionList"]
                    if total<0 or not isinstance(rows,list):raise ValueError("Invalid Taleo page")
                except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
                    errors.append(type(exc).__name__+": "+str(exc)[:100])
                    break
                counts.add(total)
                page_ids=[]
                for item in rows:
                    identity=str(item.get("jobId") or "").strip()
                    number=str(item.get("contestNo") or identity).strip()
                    cols=item.get("column") or []
                    try:
                        title=str(cols[int(item["linkedColumn"])]).strip()
                        parts=[]
                        for i in item.get("locationsColumns",[]):
                            value=cols[int(i)]
                            if isinstance(value,str):
                                try:value=json.loads(value)
                                except ValueError:pass
                            if isinstance(value,list):parts.extend(str(x) for x in value)
                            else:parts.append(str(value))
                        location="; ".join(parts).strip()
                    except (TypeError,ValueError,KeyError,IndexError):continue
                    if not re.fullmatch(r"[A-Za-z0-9_-]+",number) or not title or not identity:continue
                    page_ids.append(identity)
                    date=""
                    for col in cols:
                        for fmt in ("%b %d, %Y","%d/%b/%Y"):
                            try:date=datetime.strptime(str(col).strip(),fmt).date().isoformat();break
                            except ValueError:pass
                        if date:break
                    results[identity]={"identity":identity,"number":number,"title":title,"location":location,"date":date,
                        "url":root+"jobdetail.ftl?job="+quote(number,safe="")+"&lang=en"}
                signature=tuple(page_ids)
                if signature in signatures or not rows:break
                signatures.add(signature)
                if len(counts)==1 and len(results)==total:break
                if len(rows)<25:break
            if len(counts)==1 and len(results)==next(iter(counts)):break
        if not counts or (not results and counts!={0}):
            raise ValueError("Public Taleo feed unavailable: "+"; ".join(errors)[:180])
        return list(results.values()), counts, len(counts)==1 and len(results)==next(iter(counts))
    finally:
        if own_session:session.close()

def taleo_jobs(kind,name,make_job,session=None):
    rows,counts,complete=public_pages(kind,session)
    jobs=[]
    unknown=0
    for row in rows:
        location=row["location"]
        if not EGYPT.search(location) and kind=="cib_egypt" and "multiple locations" in location.casefold() and session is None:
            # Read only the individual posting's explicit work-location fields.
            try:
                from bs4 import BeautifulSoup
                response=requests.get(row["url"],headers={"User-Agent":"Mozilla/5.0"},timeout=20)
                response.raise_for_status()
                doc=BeautifulSoup(response.text,"html.parser")
                for label in doc.find_all(string=re.compile(r"^\s*(?:Primary Location|Other Locations|Work Locations?)\s*:?\s*$",re.I)):
                    parent=label.parent
                    if parent:
                        candidate=parent.parent.get_text(" ",strip=True) if parent.parent else ""
                        if len(candidate)<400 and EGYPT.search(candidate):
                            location=candidate
                            break
                if not EGYPT.search(location):
                    title=row["title"]
                    if re.search(r"\b(?:Egypt|Cairo|Giza|Alexandria)\b",title,re.I):
                        location=title
            except (requests.RequestException,ValueError,TypeError):
                pass
        if not EGYPT.search(location):
            if not FOREIGN.search(location):unknown+=1
            continue
        if "egypt" not in location.casefold():location += ", Egypt"
        job=make_job(name,row["title"],location,row["url"],"",row["date"],"")
        job["external_id"]=row["number"]
        job["source_requisition_id"]=row["identity"]
        if kind=="etisalat_egypt":job["id"]="custom-etisalat-"+row["identity"]
        job["source_pagination_consistency"]="complete" if complete else "incomplete"
        job["source_reported_total"]=max(counts)
        jobs.append(job)
    if unknown:
        for job in jobs:job["source_pagination_consistency"]="incomplete-location"
    if rows and not jobs:raise ValueError("No explicit Egypt locations in public Taleo records")
    return jobs
