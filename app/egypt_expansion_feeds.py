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
        url=root+"&startrow="+str(index*25)
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
            if parsed.hostname!="careers.ey.com" or not re.fullmatch(r"/ey/job/[^?#]+/\d+/?",parsed.path,re.I):
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
        if len(current)<25 and expected_total is None:return list(found.values())
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
