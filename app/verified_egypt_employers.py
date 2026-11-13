"""Employer-specific bounded HTML feeds for Egyptian technology jobs.

Only employer-linked vacancy URLs are accepted. Dynamic/empty index pages
are explicit failures, not proof of zero vacancies.
"""
from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

EGYPT = re.compile(r"\b(?:egypt|cairo|giza|alexandria|new cairo|6th of october)\b", re.I)

def _text(blob):
    return BeautifulSoup(blob.decode("utf-8", "replace"), "html.parser")

def _date(text):
    found = re.search(r"\b(?:Posted\s+on\s*:?|Date\s+posted\s*:?)\s*([A-Z][a-z]{2,8}\s+\d{1,2},?\s+20\d{2})", text, re.I)
    if not found:
        return ""
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(found.group(1), fmt).date().isoformat()
        except ValueError:
            pass
    return ""


def adcb_egypt(name, get_bytes, make_job, max_details=45):
    """Official ADCB Egypt WordPress job detail links, never generic CTA URLs."""
    base = "https://www.adcb.com.eg/available-careers/"
    document = _text(get_bytes(base))
    found = {}
    links = []
    for anchor in document.select("a[href]"):
        href = urljoin(base, anchor.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname not in ("www.adcb.com.eg", "adcb.com.eg"):
            continue
        if not re.fullmatch(r"/adcb_careers/[a-z0-9-]+/?", parts.path, re.I):
            continue
        if href not in links:
            links.append(href)
    if not links:
        raise ValueError("ADCB public careers index exposed no job-detail URLs")
    if len(links) > max_details:
        raise ValueError("ADCB vacancy count exceeds bounded detail cap")
    for href in links:
        detail = _text(get_bytes(href))
        header = detail.select_one("h1") or detail.select_one("h2")
        title = header.get_text(" ", strip=True) if header else ""
        if not title or len(title) > 180:
            title = urlsplit(href).path.strip("/").split("/")[-1].replace("-", " ").title()
        if not title:
            continue
        body = detail.get_text(" ", strip=True)
        job = make_job(name, title, "Egypt", href, body[:15000], _date(body), "")
        found[href] = job
    return list(found.values())


def fab_minds_egypt(name, get_bytes, make_job, max_details=40):
    """Collect real Fab Minds vacancy pages, not generic career navigation."""
    base = "https://www.fab-minds.com/careers/"
    document = _text(get_bytes(base))
    found = {}
    targets = []
    for anchor in document.select("a[href]"):
        href = urljoin(base, anchor.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname not in ("www.fab-minds.com", "fab-minds.com"):
            continue
        if not re.fullmatch(r"/careers/[a-z0-9-]+/?", parts.path, re.I):
            continue
        if href not in targets:
            targets.append(href)
    if not targets:
        raise ValueError("Fab Minds career list has no job-detail links")
    if len(targets) > max_details:
        raise ValueError("Fab Minds vacancy list exceeds bounded detail cap")
    for href in targets:
        detail = _text(get_bytes(href))
        header = detail.select_one("h1") or detail.select_one("h2")
        title = header.get_text(" ", strip=True) if header else ""
        if not title or len(title) > 180:
            title = urlsplit(href).path.strip("/").split("/")[-1].replace("-", " ").title()
        if not title:
            continue
        body = detail.get_text(" ", strip=True)
        # Employer pages give no per-job remote-country evidence; company-site
        # scope is Egypt-specific, but don't invent a city or posting date.
        found[href] = make_job(name, title, "Egypt (company careers)", href, body[:15000], _date(body), "")
    return list(found.values())


