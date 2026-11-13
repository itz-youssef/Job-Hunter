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
    """Use official Zenats listing metadata plus verified individual job pages.

    The listing table exposes Egypt locations and creation dates that may be
    absent from the detail page. Never infer a location from blnk headquarters.
    """
    base = "https://blnk.zenats.com/en/careers_page"
    document = _text(get_bytes(base))
    targets = {}
    for anchor in document.select("a[href]"):
        href = urljoin(base, anchor.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname not in ("app.zenats.com", "blnk.zenats.com"):
            continue
        if not re.fullmatch(r"/(?:en/)?public_job/[A-Za-z0-9_-]+/?", parts.path):
            continue
        key = href.split("?", 1)[0].split("#", 1)[0]
        row = anchor.find_parent("tr")
        row_text = row.get_text(" ", strip=True) if row else ""
        location = re.search(
            r"\b(Cairo|Giza|Alexandria|Egypt)(?:\s*,\s*Egypt)?\b",
            row_text, re.I
        )
        posted = re.search(r"\b([A-Z][a-z]{2}\s+\d{1,2},\s+20\d{2})\b", row_text)
        date = ""
        if posted:
            try:
                date = datetime.strptime(posted.group(1), "%b %d, %Y").date().isoformat()
            except ValueError:
                pass
        targets[key] = (anchor.get_text(" ", strip=True),
                        location.group(1) if location else "", date)
    if not targets:
        raise ValueError("blnk Zenats did not expose verifiable job-detail links")
    if len(targets) > max_details:
        raise ValueError("blnk postings exceed safe detail cap")
    found = []
    for href, (label, row_location, row_date) in targets.items():
        detail = _text(get_bytes(href))
        heading = detail.select_one("h1")
        title = (heading.get_text(" ", strip=True) if heading else label).strip()
        text = detail.get_text(" ", strip=True)
        if not title or len(title) > 180:
            continue
        match = re.search(
            r"(?:Job\s+Location|Location|Based\s+in)\s*[:\-]?\s*"
            r"(Cairo|Egypt|Giza|Alexandria)\b", text, re.I
        )
        place = row_location or (match.group(1) if match else "")
        if not place:
            continue
        if place.casefold() != "egypt":
            place += ", Egypt"
        found.append(make_job(name, title, place, href, text[:15000],
                              _date(text) or row_date, ""))
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


def coca_cola_hbc_egypt(name, get_bytes, make_job, max_details=35):
    """Follow verified Coca-Cola HBC employer-linked project details only.

    The country site's careers page can include jobs outside Egypt, so the
    specific requisition page must itself confirm an Egypt location.
    """
    base = "https://eg.coca-colahellenic.com/en/working-with-us"
    document = _text(get_bytes(base))
    urls = []
    for anchor in document.select("a[href]"):
        href = urljoin(base, anchor.get("href") or "")
        parts = urlsplit(href)
        if parts.hostname != "careers.coca-colahellenic.com":
            continue
        if not re.fullmatch(r"/en_US/careers/ProjectDetail/[^/?#]+/\d+/?", parts.path, re.I):
            continue
        if href not in urls:
            urls.append(href)
    if not urls:
        raise ValueError("Coca-Cola HBC careers page has no public requisition detail links")
    if len(urls) > max_details:
        raise ValueError("Coca-Cola HBC has more job links than the configured safety limit")
    jobs = []
    for href in urls:
        detail = _text(get_bytes(href))
        text = detail.get_text(" ", strip=True)
        heading = detail.select_one("h1")
        title = heading.get_text(" ", strip=True) if heading else ""
        if not title:
            title = urlsplit(href).path.strip("/").split("/")[-2].replace("-", " ")
        place = re.search(r"(?:Location|Job\s+Location|Country)\s*[:\-]?\s*"
                          r"(Cairo|Alexandria|Egypt|Giza)\b", text, re.I)
        if not place:
            continue
        city = place.group(1)
        location = city if city.lower() == "egypt" else city + ", Egypt"
        jobs.append(make_job(name, title, location, href, text[:15000], _date(text), ""))
    return jobs
