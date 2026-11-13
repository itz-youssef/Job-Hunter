"""Verified Breadfast technology postings through its official investor job board.

The WordPress Technology landing page has no live job links. The investor
board's default first page is global and often omits tech roles; use its
public keyword-search views and verify each Breadfast detail posting.
"""
from __future__ import annotations

from datetime import datetime
import re
from urllib.parse import urljoin, urlsplit, urlencode
from bs4 import BeautifulSoup

_BASE = "https://careers.4dxventures.com/jobs"
_DOMAIN = "careers.4dxventures.com"
_JOB_PATH = re.compile(r"/companies/breadfast/jobs/\d+-[a-z0-9-]+/?", re.I)
_TECH = re.compile(
    r"\b(?:technology|technologies|tech|IT|software|data|AI|ML|"
    r"machine learning|computer vision|devops|backend|front[\s-]?end|"
    r"full[\s-]?stack|developer|programmer|platform engineer|"
    r"QA engineer|software engineer|cloud engineer)\b", re.I
)
_EGYPT = re.compile(r"(?:Cairo|Giza|Alexandria|New Cairo|Egypt)", re.I)
_QUERIES = ("Technology", "Software", "Backend", "Data", "Intern")


def breadfast_technology(name, get_bytes, make_job, searches=_QUERIES, max_details=45):
    links = {}
    fetched = 0
    for query in searches:
        url = _BASE + "?" + urlencode({"q": query})
        try:
            soup = BeautifulSoup(get_bytes(url).decode("utf-8", "replace"), "html.parser")
        except (OSError, ValueError):
            continue
        fetched += 1
        for anchor in soup.select("a[href]"):
            href = urljoin(url, anchor.get("href") or "")
            parts = urlsplit(href)
            if parts.hostname != _DOMAIN or not _JOB_PATH.fullmatch(parts.path):
                continue
            title = anchor.get_text(" ", strip=True)
            if not title or len(title) > 160 or not _TECH.search(title):
                continue
            links[href.split("#", 1)[0].split("?", 1)[0]] = title
    if not fetched:
        raise ValueError("Breadfast technology portfolio career searches unavailable")
    if len(links) > max_details:
        raise ValueError("Breadfast technology vacancy count exceeds detail cap")

    jobs = {}
    for link, title in links.items():
        # Detail pages confirm the employer's country/location and date.
        try:
            detail = BeautifulSoup(get_bytes(link).decode("utf-8", "replace"), "html.parser")
        except (OSError, ValueError):
            continue
        heading = detail.select_one("h1")
        if heading and heading.get_text(" ", strip=True):
            detail_title = heading.get_text(" ", strip=True)
            # Avoid treating unrelated template headings as vacancy titles.
            if len(detail_title) < 160 and title.casefold() in detail_title.casefold():
                title = detail_title

        text = detail.get_text(" ", strip=True)
        # Restrict location evidence to the job-detail header, avoiding
        # generic worldwide office addresses and lengthy body references.
        header = text[:900]
        country = re.search(
            r"\b(?:Cairo|Alexandria|Giza|New Cairo)(?:,\s*[A-Za-z ]+)?"
            r",\s*Egypt\b|\bEgypt\b",
            header, re.I
        )
        if not country:
            continue
        location = country.group(0)
        # A bare country field is fine; but never invent an exact city.
        date = re.search(r"\bPosted\s+on\s+([A-Za-z]{3}\s+\d{1,2},\s+20\d{2})",header,re.I)
        published = ""
        if date:
            try:
                published = datetime.strptime(date.group(1), "%b %d, %Y").date().isoformat()
            except ValueError:
                pass
        job = make_job(name,title,location,link,text[:15000],published,"")
        jobs[link] = job
    return list(jobs.values())
