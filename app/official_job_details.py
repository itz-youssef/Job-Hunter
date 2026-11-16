"""Company-specific, bounded enrichment of EMPTY ATS listing records.

Only employer-linked vacancy URLs from our scanner are read. Match exact
visible title or JobPosting title; otherwise do not reuse page data.
No login, bypass, generic keyword hallucinations or unrelated-company data.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

# Only providers demonstrably returned vacancies without descriptions in the
# live source audit on 2026-11-16. 12 original detail pages per company max.
SPARSE_ADAPTERS=frozenset({
  "ey_egypt","pwc_egypt","luxoft_egypt","orange_egypt",
  "tp_egypt","cib_egypt","etisalat_egypt","fawry_partial",
  "deloitte_partial","indrive_egypt","linkdevelopment",
  "breadfast_egypt","ericsson_egypt","html"
})
MAX_DETAILS_PER_COMPANY=12
SELECTORS=(
  '[itemprop="description"]', '#jobDescriptionText','.jobDescriptionText',
  '#job-description','.job-description','.jobDescription','.job_description',
  '[data-testid="job-description"]','article.job','section.job-description',
  '.career-job-description','div.job-content','.job-details__description'
)
JOBS_TEXT=re.compile(
 r"\b(?:requirements?|qualifications?|responsibilities|what you (?:will|bring|need)|"
 r"what you.ll do|job description|about the (?:role|position)|your role|"
 r"skills and experience|project description)\b",re.I
)
DETAIL_PAGE=re.compile(
 r"(?:/job/|/jobs/[^/?]+|/careers/job/|/vacanc(?:y|ies)/|"
 r"/careers/[^/?]+|/position/|/opportunit(?:y|ies)/)",re.I
)

def _normalize(s):
    return " ".join(str(s or "").split()).casefold()

def _flatten(item):
    if isinstance(item,dict):
        yield item
        for value in item.values():
            if isinstance(value,(list,dict)):
                yield from _flatten(value)
    elif isinstance(item,list):
        for value in item:yield from _flatten(value)

def _same_employer_page(job,link):
    source=urlsplit(str(job.get("url") or ""))
    target=urlsplit(str(link or ""))
    return (source.scheme=="https" and source.hostname and
        target.scheme=="https" and target.hostname==source.hostname and
        not target.username and not target.password)

def parse_detail(job,html):
    """Read original vacancy detail, do not accept unrelated recommended cards."""
    soup=BeautifulSoup(html,"html.parser")
    expected=_normalize(job.get("title"))
    if not expected:return None
    for tag in soup.select('script[type="application/ld+json"]'):
        try:data=json.loads(tag.string or tag.get_text())
        except (TypeError,ValueError):continue
        for info in _flatten(data):
            kind=info.get("@type") or ""
            valid="JobPosting" in kind if isinstance(kind,list) else kind=="JobPosting"
            if not valid or _normalize(info.get("title"))!=expected:
                continue
            desc=BeautifulSoup(str(info.get("description") or ""),"html.parser")
            body=desc.get_text(" ",strip=True)
            if len(body)<90:continue
            return {"description":body[:18000],
                "employment":str(info.get("employmentType") or ""),
                "published":str(info.get("datePosted") or ""),
                "source_detail_status":"official-jsonld-detail"}
    # The page's main heading must identify this exact role. A related-job
    # list often contains a different title; never conflate them.
    headings=[_normalize(h.get_text(" ",strip=True)) for h in soup.select("h1,h2")]
    if expected not in headings:return None
    for selector in SELECTORS:
        for node in soup.select(selector):
            text=node.get_text(" ",strip=True)
            if len(text)>110 and JOBS_TEXT.search(text):
                return {"description":text[:18000],"employment":"",
                    "published":"","source_detail_status":"official-job-section"}
    return None

def enrich_missing(jobs,source_kind,get_bytes,limit=MAX_DETAILS_PER_COMPANY):
    """Bounded source-wide detail reads, keeping all original jobs on errors."""
    if source_kind not in SPARSE_ADAPTERS:return jobs
    attempts=0
    for job in jobs:
        description=str(job.get("description") or "").strip()
        if len(description)>=100:continue
        url=str(job.get("url") or "")
        if attempts>=limit:break
        if not _same_employer_page(job,url):continue
        path=urlsplit(url).path
        if not DETAIL_PAGE.search(path) and not (
            source_kind=="fawry_partial" and "post_type=job_listing" in url
        ):continue
        attempts+=1
        try:
            raw=get_bytes(url)
            if len(raw)>2_000_000:
                job.setdefault("source_detail_status","detail-too-large")
                continue
            info=parse_detail(job,raw.decode("utf-8","replace"))
        except (OSError,ValueError,TimeoutError,UnicodeError,TypeError):
            info=None
        if info and len(info["description"])>len(description):
            job["description"]=info["description"]
            job["source_detail_status"]=info["source_detail_status"]
            if info.get("employment") and not job.get("employment"):
                job["employment"]=info["employment"]
            if info.get("published") and not (job.get("published_at") or job.get("published")):
                job["published_at"]=info["published"]
        else:
            job.setdefault("source_detail_status","official-detail-unavailable")
    return jobs
