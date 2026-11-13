"""Official Egypt employer job feeds absent from generic ATS adapters.

Never infer that a careers page description is a live posting; accept only
job-detail links listed by the employer and verified Egypt locations.
"""
from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

EGYPT = re.compile(r"\b(?:egypt|cairo|giza|alexandria|new cairo|nasr city)\b", re.I)

def ey_egypt(name, get_bytes, make_job, max_pages=8):
    """EY SuccessFactors's official *Egypt-filtered* job search pages."""
    root="https://careers.ey.com/ey/search/?q=&locationsearch=Egypt"
    found={}
    visited=set()
    expected_total=None
    for index in range(max_pages):
        url=root+"&startrow="+str(index*20)
        html=get_bytes(url).decode("utf-8","replace")
        doc=BeautifulSoup(html,"html.parser")
        heading=doc.get_text(" ",strip=True)
        total=re.search(r"Results\s+\d+\s*[-–]\s*\d+\s+of\s+([\d,]+)",heading,re.I)
        if total:
            num=int(total.group(1).replace(",",""))
            if expected_total is None:expected_total=num
            elif num!=expected_total:raise ValueError("EY results changed during pagination")
        current={}
        for row in doc.select("tr"):
            anchor=row.select_one("a.jobTitle-link")
            if not anchor:continue
            link=urljoin(url,anchor.get("href") or "")
            parsed=urlsplit(link)
            if parsed.hostname!="careers.ey.com" or not re.fullmatch(r"/(?:ey/)?job/[^?#]+/\d+/?",parsed.path,re.I):
                continue
            title=anchor.get_text(" ",strip=True)
            cells=[cell.get_text(" ",strip=True) for cell in row.select("td")]
            city=next((x for x in cells if re.search(r"\b(?:Cairo|Giza|Alexandria),?\s*EG\b|\bEgypt\b",x,re.I)),"")
            if not city:
                # URL city slug alone isn't enough if results mix global cities.
                continue
            if not title:continue
            current[link]=(title,city)
        signature=frozenset(current)
        if not current:
            if index==0 and expected_total!=0:
                raise ValueError("EY returned no verified Egypt job rows")
            if expected_total is not None and len(found)<expected_total:
                raise ValueError(f"EY page ended early ({len(found)} of {expected_total})")
            return list(found.values())
        if signature in visited:
            if expected_total is not None and len(found)<expected_total:
                raise ValueError("EY pagination repeated before completion")
            return list(found.values())
        visited.add(signature)
        for link,(title,city) in current.items():
            if link not in found:
                job=make_job(name,title,city+", Egypt" if "egypt" not in city.lower() else city,link,"","","")
                found[link]=job
        if expected_total is not None and len(found)>=expected_total:return list(found.values())
        if len(current)<20 and expected_total is None:return list(found.values())
    if expected_total is not None and len(found)>=expected_total:return list(found.values())
    raise ValueError("EY Egypt search exceeded page limit; incomplete results")


def blink22_egypt(name, get_bytes, make_job, max_details=35):
    """Extract employer-linked Blink22 vacancies, excluding unverified locations."""
    base="https://blink22.com/careers/"
    html=get_bytes(base).decode("utf-8","replace")
    doc=BeautifulSoup(html,"html.parser")
    found={}
    targets={}
    for a in doc.select("a[href]"):
        url=urljoin(base,a.get("href") or "")
        p=urlsplit(url)
        if p.hostname not in ("blink22.com","www.blink22.com"):
            continue
        if not re.fullmatch(r"/careers/[a-z0-9-]+/?",p.path,re.I):continue
        title=a.get_text(" ",strip=True)
        if not title or len(title)>130:continue
        targets[url.split("#")[0].split("?")[0]] = title
    if not targets:raise ValueError("Blink22 official careers page has no active job links")
    if len(targets)>max_details:raise ValueError("Blink22 vacancies exceed bounded detail count")
    for link,title in targets.items():
        html=get_bytes(link).decode("utf-8","replace")
        detail=BeautifulSoup(html,"html.parser")
        text=detail.get_text(" ",strip=True)
        if not EGYPT.search(text):
            # A Dubai-based employer does not make an overseas vacancy eligible.
            continue
        # Avoid global boilerplate by demanding Egypt in the employment detail.
        location=re.search(r"(?:Location|Job\s*Location|Work\s*Location|Based\s+in)\s*[:\-]?\s*(Alexandria|Cairo|Egypt|Giza)\b",text,re.I)
        if not location:
            # Some Blink22 pages explicitly say "fully remote in Egypt".
            location=re.search(r"\b(?:remote\s+(?:from|in)\s+Egypt|Egypt\s*(?:\(|-|–)\s*remote)\b",text,re.I)
        if not location:continue
        place=location.group(1)+", Egypt" if location.lastindex else "Egypt (remote)"
        job=make_job(name,title,place,link,text[:15000],"","")
        found[link]=job
    return list(found.values())


def tp_egypt(name,get_bytes,make_job):
    """Teleperformance Egypt official vacancies (usually nontechnical)."""
    base="https://tpegyptcareers.teleperformance.com.eg/vacancies"
    html=get_bytes(base).decode("utf-8","replace")
    doc=BeautifulSoup(html,"html.parser")
    results={}
    for a in doc.select("a[href]"):
        link=urljoin(base,a.get("href") or "")
        p=urlsplit(link)
        if p.hostname!="tpegyptcareers.teleperformance.com.eg" or not re.fullmatch(r"/vacancies/[a-z0-9-]+/?",p.path,re.I):
            continue
        name_part=p.path.rstrip("/").split("/")[-1].replace("-"," ").title()
        if not name_part:continue
        results[link]=make_job(name,name_part,"Egypt",link,"","","")
    if not results:raise ValueError("TP Egypt official vacancy list is missing")
    return list(results.values())


def amazon_egypt(name,get_json,make_job,aws_only=False):
    """Verified official Amazon Jobs JSON API scoped to Egypt; complete pagination."""
    from urllib.parse import urlencode
    root="https://www.amazon.jobs/en/search.json"
    size=100
    results={}
    expected=None
    for page in range(10):
        url=root+"?"+urlencode({"offset":page*size,"result_limit":size,"country":"EGY"})
        data=get_json(url)
        if not isinstance(data,dict) or not isinstance(data.get("jobs"),list):
            raise ValueError("Amazon JSON jobs schema unavailable")
        try:count=int(data["hits"])
        except (ValueError,TypeError,KeyError) as exc:raise ValueError("Amazon job total unavailable") from exc
        if expected is None:expected=count
        elif count!=expected:raise ValueError("Amazon jobs changed during pagination")
        rows=data["jobs"]
        if not rows and expected>page*size:raise ValueError("Amazon jobs paging incomplete")
        for item in rows:
            if not isinstance(item,dict) or str(item.get("country_code")or"").upper()!="EGY":
                continue
            title=str(item.get("title")or"").strip()
            path=str(item.get("job_path")or"")
            if not re.fullmatch(r"/en/jobs/\d+/[a-z0-9-]+/?",path,re.I) or not title:continue
            team=" ".join(str(item.get(key)or"") for key in ("business_category","business_category_list","team","normalized_business_category","job_category"))
            if aws_only and not re.search(r"\b(?:aws|amazon web services)\b",team,re.I):
                continue
            location=str(item.get("location")or item.get("city")or"Egypt")
            if not EGYPT.search(location) and "virtual" not in location.lower():
                location+=" , Egypt"
            job=make_job(name,title,location,
                "https://www.amazon.jobs"+path,
                str(item.get("description")or"")+" "+str(item.get("basic_qualifications")or""),
                str(item.get("posted_date")or item.get("updated_time")or""),
                str(item.get("job_schedule_type")or""))
            job["external_id"]=path.split("/")[3]
            results[path]=job
        if (page+1)*size>=expected:return list(results.values())
    raise ValueError("Amazon jobs exceed safe pagination limit")


def breadfast_egypt(name,get_bytes,make_job,tech_only=False):
    """Investor portfolio board: employer-tagged Breadfast posts; partial coverage."""
    base="https://careers.4dxventures.com/jobs"
    html=get_bytes(base).decode("utf-8","replace")
    doc=BeautifulSoup(html,"html.parser")
    jobs={}
    for a in doc.select("a[href]"):
        link=urljoin(base,a.get("href")or"").split("#",1)[0].split("?",1)[0]
        parsed=urlsplit(link)
        if parsed.hostname!="careers.4dxventures.com" or not re.fullmatch(r"/companies/breadfast/jobs/\d+-[a-z0-9-]+/?",parsed.path,re.I):
            continue
        title=a.get_text(" ",strip=True)
        if not title or len(title)>180:continue
        if tech_only and not re.search(r"\b(?:software|tech|data|ai|ml|engineer|developer|backend|frontend|product|automation|quality assurance)\b",title,re.I):
            continue
        if link in jobs:continue
        # Portfolio careers board explicitly tags the hiring company as Breadfast.
        # Egypt/Cairo for Breadfast is validated by the official employer scope,
        # but no per-role location is asserted unless listed in the title.
        place="Alexandria, Egypt" if re.search("Alexandria",title,re.I) else "Egypt (company board)"
        jobs[link]=make_job(name,title,place,link,"","","")
    if not jobs and not tech_only:
        raise ValueError("Breadfast 4DX portfolio board has no job-detail links on currently visible page")
    return list(jobs.values())


def successfactors_egypt(name,get_bytes,make_job,base,max_pages=8):
    """Generic SuccessFactors jobs with verified city in page table."""
    jobs={}
    total=None
    for page in range(max_pages):
        url=base+("&" if "?" in base else "?")+"startrow="+str(page*20)
        doc=BeautifulSoup(get_bytes(url).decode("utf-8","replace"),"html.parser")
        text=doc.get_text(" ",strip=True)
        totals=re.search(r"Results\s+\d+\s*[-–]\s*\d+\s+of\s+([\d,]+)",text,re.I)
        if totals:
            count=int(totals.group(1).replace(",",""))
            if total is None:total=count
            elif count!=total:raise ValueError("SuccessFactors jobs changed while scanning")
        current={}
        for tr in doc.select("tr"):
            a=tr.select_one("a.jobTitle-link")
            if not a:continue
            link=urljoin(url,a.get("href")or"")
            parsed=urlsplit(link)
            if parsed.hostname!=urlsplit(base).hostname or not re.fullmatch(r"/(?:[a-z]{2}/)?job/[^?#]+/\d+/?",parsed.path,re.I):
                continue
            cells=[td.get_text(" ",strip=True) for td in tr.select("td")]
            egypt=next((x for x in cells if re.search(r"(?:Cairo|Giza|Alexandria),?\s*EG\b|\bEgypt\b",x,re.I)),"")
            if not egypt:continue
            title=a.get_text(" ",strip=True)
            if title:current[link]=(title,egypt)
        if not current:
            if page==0 and total!=0:raise ValueError("No verified Egyptian job rows")
            if total is not None and len(jobs)<total:raise ValueError("Missing SuccessFactors job pages")
            return list(jobs.values())
        before=len(jobs)
        for link,(title,where) in current.items():
            if link not in jobs:
                jobs[link]=make_job(name,title,where+", Egypt" if "egypt" not in where.lower() else where,link,"","","")
        if len(jobs)==before and (total is None or len(jobs)<total):
            raise ValueError("SuccessFactors pagination repeated or incomplete")
        if total is not None and len(jobs)>=total:return list(jobs.values())
        if len(current)<20 and total is None:return list(jobs.values())
    if total is not None and len(jobs)>=total:return list(jobs.values())
    raise ValueError("SuccessFactors page safety limit reached")


def talabat_egypt(name, get_bytes, make_job, max_pages=8):
    """Delivery Hero's own talabat+Egypt filtered recruitment board.

    Only actual job detail cards are read; cards are restricted to Egypt and
    talabat rather than relying on employer-name assumptions. All public
    pagination pages must be read or the scan fails visibly.
    """
    root="https://careers.deliveryhero.com/jobs?options=252%2C845"
    out={}
    expected=None
    for page in range(1,max_pages+1):
        url=root+"&page="+str(page)
        html=get_bytes(url).decode("utf-8","replace")
        document=BeautifulSoup(html,"html.parser")
        body=document.get_text(" ",strip=True)
        match=re.search(r"\b([\d,]+)\s+result\(s\)",body,re.I)
        if match:
            count=int(match.group(1).replace(",",""))
            if expected is None: expected=count
            elif expected!=count: raise ValueError("Talabat search result total changed mid-scan")
        cards=document.select("[data-jobid]")
        found_this_page={}
        for card in cards:
            a=card.select_one("a[href*='/job/']")
            if a is None:continue
            link=urljoin(url,a.get("href")or"")
            parsed=urlsplit(link)
            if parsed.hostname!="careers.deliveryhero.com" or not re.fullmatch(r"/job/[a-z0-9-]+-jid-\d+/?",parsed.path,re.I):
                continue
            title=a.get_text(" ",strip=True)
            text=card.get_text(" ",strip=True)
            if not title or not re.search(r"\btalabat\b",text,re.I):continue
            if not EGYPT.search(text):continue
            loc=re.search(r"\b(?:Cairo|Maadi|Alexandria|Giza|Egypt)\b",text,re.I)
            where=(loc.group(0)+", Egypt") if loc and loc.group(0).lower()!="egypt" else "Egypt"
            category=re.search(r"Job\s+Category\s*:?\s*([^:]{3,70}?)(?:Job\s+Type|Location|Brand|Description|$)",text,re.I)
            posted=""
            job=make_job(name,title,where,link,
                text[:1800],posted,"")
            job["external_id"]=str(card.get("data-jobid")or"")
            found_this_page[link]=job
        if not found_this_page:
            if page==1 and expected!=0:
                raise ValueError("Talabat filtered careers page returned no readable postings")
            if expected is not None and len(out)<expected:
                raise ValueError(f"Talabat pagination stopped at {len(out)}/{expected}")
            return list(out.values())
        before=len(out)
        out.update(found_this_page)
        if expected is not None and len(out)>=expected:
            return list(out.values())
        if len(out)==before:
            raise ValueError("Talabat pagination repeated unexpectedly")
        if expected is None and len(found_this_page)<12:return list(out.values())
    raise ValueError("Talabat jobs exceed pagination safety cap")


def uber_egypt_partial(name,get_bytes,make_job):
    """Uber's public Oracle Recruiting CE source, scoped to Egypt.

    Scans the public worksite's live job list, not third-party search results.
    A missing/changed API schema raises an error instead of claiming coverage.
    """
    import json
    from urllib.parse import urlencode
    base="https://iaziqy.fa.ocs.oraclecloud.com"
    path="/hcmRestApi/resources/11.13.18.05/recruitingCEJobRequisitions"
    size=100
    matches={}
    total=None
    for offset in range(0,1000,size):
        params={"onlyData":"true","expand":"requisitionList",
                "finder":f"findReqs;siteNumber=CX_1,limit={size},offset={offset},location=Egypt"}
        url=base+path+"?"+urlencode(params)
        payload=json.loads(get_bytes(url).decode("utf-8","replace"))
        if not isinstance(payload,dict) or not isinstance(payload.get("items"),list) or not payload["items"]:
            raise ValueError("Uber Oracle jobs schema changed")
        record=payload["items"][0]
        expected=int(record.get("TotalJobsCount",-1))
        if expected<0 or not isinstance(record.get("requisitionList"),list):
            raise ValueError("Uber Oracle requisition list unavailable")
        if total is None:total=expected
        elif total!=expected:raise ValueError("Uber Egypt jobs changed during scan")
        rows=record["requisitionList"]
        if not rows and offset<total:raise ValueError("Uber Egypt requisition pagination incomplete")
        for item in rows:
            if not isinstance(item,dict):continue
            # Verify country even after an Egypt-filtered API request.
            if str(item.get("PrimaryLocationCountry")or"").upper() not in ("EG","EGY"):
                continue
            identity=str(item.get("Id")or"")
            title=str(item.get("Title")or"").strip()
            if not identity.isdecimal() or not title:continue
            location=str(item.get("PrimaryLocation")or"Egypt")
            if not EGYPT.search(location):location="Egypt"
            url=(base+"/hcmUI/CandidateExperience/en/sites/UberCareers/job/"+identity)
            j=make_job(name,title,location,url,"",str(item.get("PostedDate")or""),"")
            j["external_id"]=identity
            matches[identity]=j
        if offset+len(rows)>=total:return list(matches.values())
    raise ValueError("Uber Oracle Egypt results exceed pagination safety cap")


def taleo_bank_partial(name,base_url,get_bytes,make_job):
    """Public Taleo first-page requisitions for Egyptian banks; partial coverage."""
    import html as html_lib
    from urllib.parse import unquote
    host=urlsplit(base_url).hostname
    if host not in ("cibeg.taleo.net","adibegypt.taleo.net"):
        raise ValueError("Unverified bank Taleo hostname")
    page=get_bytes(base_url).decode("utf-8","replace")
    if "requisitionListInterface" not in page:
        raise ValueError("Bank Taleo public job-list markup unavailable")
    content=page[page.find("var _ftl"):] if "var _ftl" in page else page
    # Mirror Taleo's server-built requisition grid, not unrelated navigation.
    pattern=re.compile(r"'(?P<id>\d{5,8})','(?P<title>[^']{8,180})'",re.I)
    entries={}
    for match in pattern.finditer(content):
        title=html_lib.unescape(unquote(match.group("title"))).strip()
        if not title or title.isdecimal() or len(title)>160:continue
        tail=content[match.end():match.end()+1100]
        job_number=re.search(r"Job Number:\s*([A-Z0-9]+)",tail,re.I)
        if not job_number:continue
        parsed=urlsplit(base_url)
        section=parsed.path.split("/")[2]
        link=f"https://{host}/careersection/{section}/jobdetail.ftl?job={job_number.group(1)}&lang=en"
        posted=re.search(r"'([0-3]?\d/[A-Za-z]{3}/\d{4})'",tail)
        job=make_job(name,title,"Egypt",link,"",posted.group(1) if posted else "","")
        job["external_id"]=job_number.group(1)
        entries[job_number.group(1)]=job
    if not entries:
        raise ValueError("No bank Taleo requisitions with verified public job numbers")
    return list(entries.values())
