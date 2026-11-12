"""Verified employer-hosted job listings for Deloitte Middle East and Luxoft Egypt."""
from __future__ import annotations
import re
from urllib.parse import urljoin, urlsplit, urlencode
from html import unescape

EGYPT = re.compile(r"\b(?:egypt|cairo|giza|alexandria|smart village|new cairo)\b", re.I)
DELOITTE_PATTERN = re.compile(r"^/careersME/PipelineDetail/[^/]+/[0-9]+/?$", re.I)
LUXOFT_PATTERN = re.compile(r"^/jobs/[a-z0-9-]+-[0-9]+/?$", re.I)

def _parse_links(html):
    from app.custom_sources import _PageParser
    p = _PageParser()
    p.feed(html)
    return [(url, " ".join(text.split())) for url, text in p.links]

def deloitte_egypt_partial(name, get_bytes, make_job, max_pages=36):
    """Read only genuine Egypt-titled jobs from official paginated board.

    Pagination bound deliberately returns 'partial' status until the complete
    search corpus is verified; never report a complete feed from six links.
    """
    root = "https://middleeastjobs.deloitte.com/careersME/SearchJobs/"
    results = {}
    seen = set()
    for page in range(max_pages):
        url = root + "?" + urlencode({"pipelineRecordsPerPage":6,"pipelineOffset":page*6})
        html = get_bytes(url).decode("utf-8","replace")
        entries = []
        for href, label in _parse_links(html):
            target = urljoin(url, href)
            parsed = urlsplit(target)
            if parsed.hostname != "middleeastjobs.deloitte.com" or not DELOITTE_PATTERN.fullmatch(parsed.path):
                continue
            entries.append((target.split("?",1)[0], label))
        signature = frozenset(x[0] for x in entries)
        if not entries:
            if page == 0:
                raise ValueError("Deloitte official search returned no job links")
            break
        if signature in seen:
            break
        seen.add(signature)
        for target, title in entries:
            if not EGYPT.search(title+" "+urlsplit(target).path.replace("-", " ")):
                continue
            if not title:
                continue
            job = make_job(name,title,"Egypt",target,"","","")
            results[target] = job
        # Only stop if the live page has no next pagination link.
        has_next = any("pipelineOffset=" in href and
                       re.search(r"(?:next|>>|›)",text,re.I)
                       for href,text in _parse_links(html))
        if not has_next:
            break
    return list(results.values())

def luxoft_egypt(name,get_bytes,make_job):
    """Read Luxoft's public country-filtered jobs search, explicitly verifying country.

    The Egypt filter is employer-generated, but job cards must also mention
    Egypt so an ATS query malfunction cannot silently admit foreign jobs.
    """
    base="https://career.luxoft.com/jobs"
    url=base+"?"+urlencode({"country[]":"Egypt","perPage":"60"})
    html=get_bytes(url).decode("utf-8","replace")
    links=_parse_links(html)
    found={}
    for href,text in links:
        absolute=urljoin(url,href).split("?",1)[0]
        parts=urlsplit(absolute)
        if parts.hostname!="career.luxoft.com" or not LUXOFT_PATTERN.fullmatch(parts.path):
            continue
        if not EGYPT.search(text):
            continue
        slug=parts.path.strip("/").split("/")[-1]
        title=re.sub(r"-[0-9]+$", "", slug).replace("-", " ")
        # Use human-readable anchor title where possible, before metadata.
        human=re.split(r"\b(?:Remote|On-site|Hybrid|Egypt)\b",text,maxsplit=1)[0].strip()
        if human and len(human)<120:
            title=human
        if not title:
            continue
        job=make_job(name,title,"Egypt",absolute,"","","")
        job["external_id"]=slug.rsplit("-",1)[-1]
        found[absolute]=job
    if not found:
        # Zero results should not be confused with a successful complete feed.
        raise ValueError("Luxoft Egypt search has no verified job cards")
    # Search page must not have additional pages that were not scanned.
    pagers=[href for href,_ in links if re.search(r"(?:[?&]page=|/page/)[2-9]",href)]
    if pagers:
        raise ValueError("Luxoft Egypt source has additional unscanned pages")
    return list(found.values())
