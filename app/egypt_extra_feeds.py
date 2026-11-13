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

def blnk_zenats(name, get_bytes, make_job, max_details=50):
    """Follow actual blnk vacancy identities on Zenats, including post dates."""
    base = "https://blnk.zenats.com/en/careers_page"
    document = _text(get_bytes(base))
    targets = {}
    for link in document.select("a[href]"):
        href = urljoin(base, link.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname not in ("app.zenats.com", "blnk.zenats.com"):
            continue
        if not re.fullmatch(r"/en/public_job/[A-Za-z0-9_-]+/?", parts.path):
            continue
        targets[href.split("?")[0]] = link.get_text(" ", strip=True)
    if not targets:
        raise ValueError("blnk Zenats did not expose verifiable job-detail links")
    if len(targets) > max_details:
        raise ValueError("blnk postings exceed safe detail cap")
    found = []
    for href, label in targets.items():
        doc = _text(get_bytes(href))
        heading = doc.select_one("h1")
        title = (heading.get_text(" ", strip=True) if heading else label).strip()
        text = doc.get_text(" ", strip=True)
        if not title or len(title) > 180:
            continue
        match = re.search(r"(?:Job\s+Location|Location|Based\s+in)\s*[:\-]?\s*(Cairo|Egypt|Giza|Alexandria)\b", text, re.I)
        if not match:
            # Don't infer job country merely from employer headquarters.
            continue
        location = match.group(1)
        if location.lower() != "egypt":
            location += ", Egypt"
        found.append(make_job(name, title, location, href, text[:15000], _date(text), ""))
    return found

def henkel_egypt(name, get_bytes, make_job, max_details=80):
    """Henkel official job pages; never infer Egypt from the search filter UI."""
    base = "https://www.henkel.com/careers/find-your-job-apply"
    doc = _text(get_bytes(base))
    targets = {}
    for anchor in doc.select("a[href]"):
        href = urljoin(base, anchor.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname not in ("www.henkel.com", "henkel.com"):
            continue
        if not re.fullmatch(r"/careers/find-your-job-apply/\d+-\d+/?", parts.path):
            continue
        targets[href] = anchor.get_text(" ", strip=True)
    if not targets:
        raise ValueError("Henkel search UI exposed no employer vacancy links; needs an official API adapter")
    if len(targets) > max_details:
        raise ValueError("Henkel postings exceed safe detail cap")
    found = []
    for href, label in targets.items():
        doc = _text(get_bytes(href))
        heading = doc.select_one("h1")
        title = (heading.get_text(" ", strip=True) if heading else label).strip()
        text = doc.get_text(" ", strip=True)
        # Require the job-detail page to state Egypt, not the website navigation.
        if not re.search(r"\b(?:IT Egypt|Engineering Egypt|Egypt Full Time|Egypt Part Time|Egypt Internship|Cairo,? Egypt)\b", text, re.I):
            continue
        if title:
            found.append(make_job(name, title, "Egypt", href, text[:15000], _date(text), ""))
    return found
