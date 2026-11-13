"""Read-only official employer vacancy parsers.

Blink22: preserve all employer-listed vacancies without inventing an Egypt
location when the job detail page does not state one. The normal hard filter
will correctly exclude those until employer-level evidence is available.

SAP: parse verified Cairo jobs from the server-rendered Next.js RSC payload.
No HTML screen scraping of search labels or fabricated dates.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlsplit, urlencode

from bs4 import BeautifulSoup

_BLINK_BASE = "https://blink22.com/careers/"
_BLINK_HOSTS = {"blink22.com", "www.blink22.com"}
_SAP_BASE = "https://jobs.sap.com/en/jobs/"
_EGYPT = re.compile(r"\b(?:Egypt|Cairo|Alexandria|Giza|New Cairo)\b", re.I)


def blink22_listings(name, get_bytes, make_job, max_details=40):
    """Capture *all* live Blink22 career-detail links and verified locations.

    Not all postings say which country can apply, even though Blink22 has an
    Alexandria office. Preserve those listings with an UNKNOWN location;
    the application's Egypt-only filter must reject them for alerts.
    """
    soup = BeautifulSoup(get_bytes(_BLINK_BASE).decode("utf-8", "replace"), "html.parser")
    links = {}
    for anchor in soup.select("a[href]"):
        link = urljoin(_BLINK_BASE, anchor.get("href") or "")
        parsed = urlsplit(link)
        if parsed.hostname not in _BLINK_HOSTS:
            continue
        if not re.fullmatch(r"/careers/[a-z0-9-]+/?", parsed.path, re.I):
            continue
        title = anchor.get_text(" ", strip=True)
        if not title or len(title) > 160:
            continue
        links[link.split("?", 1)[0].split("#", 1)[0]] = title

    if not links:
        raise ValueError("Blink22 official careers page exposed no vacancy details")
    if len(links) > max_details:
        raise ValueError("Blink22 listing count exceeds safe detail cap")

    result = []
    for link, title in links.items():
        # Keep each entry even when the detail page temporarily fails. It
        # remains an employer-verified listing, but is never eligible without
        # a proven location and junior criteria.
        description = ""
        location = ""
        published = ""
        try:
            detail = BeautifulSoup(get_bytes(link).decode("utf-8", "replace"), "html.parser")
            main = detail.select_one("main") or detail.select_one("article") or detail
            text = main.get_text(" ", strip=True)
            description = text[:15000]
            # Only role-specific location declarations; not the global footer
            # with Blink22's Dubai, Alexandria and other office addresses.
            match = re.search(
                r"(?:Job\s*Location|Work\s*Location|Based\s+in|Location)\s*[:\-]?\s*"
                r"(Egypt|Cairo|Alexandria|Giza)\b",
                text, re.I,
            )
            remote = re.search(r"\b(?:remote\s+(?:from|in)\s+Egypt|Egypt\s+remote)\b", text, re.I)
            if match:
                location = match.group(1)
                if location.casefold() != "egypt":
                    location += ", Egypt"
            elif remote:
                location = "Remote, Egypt"
            # Don't use first crawl or scan time as publication date.
        except (OSError, ValueError, TypeError):
            pass

        job = make_job(name, title, location, link, description, published, "")
        result.append(job)
    return result


def _rsc_job_arrays(html):
    """Decode JSON-escaped Next.js streamed RSC data safely, without eval."""
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for script in soup.select("script"):
        js = script.string or script.get_text()
        if not js or "__next_f.push" not in js:
            continue
        for encoded in re.findall(
            r'self\.__next_f\.push\(\[1,\s*("(?:\\.|[^"\\])*")\s*\]\)',
            js, re.S,
        ):
            try:
                stream = json.loads(encoded)
            except ValueError:
                continue
            for marker in ('"jobs":', '"jobResults":'):
                pos = 0
                while True:
                    idx = stream.find(marker, pos)
                    if idx < 0:
                        break
                    pos = idx + len(marker)
                    try:
                        value, _ = json.JSONDecoder().raw_decode(stream[pos:])
                    except ValueError:
                        continue
                    if isinstance(value, list) and all(isinstance(x, dict) for x in value):
                        found.append(value)
    return found


def sap_egypt(name, get_bytes, make_job, max_pages=12):
    """SAP Cairo-only job records with original posting timestamps.

    Reject changes in schema and incomplete pagination rather than reporting
    a healthy empty result when a dynamic page fails.
    """
    results = {}
    total_pages = None
    for number in range(1, max_pages + 1):
        params = {"location": "Cairo"}
        if number > 1:
            params["page"] = str(number)
        page = _SAP_BASE + "?" + urlencode(params)
        html = get_bytes(page).decode("utf-8", "replace")
        arrays = _rsc_job_arrays(html)
        if not arrays:
            raise ValueError("SAP Cairo job result payload unavailable")
        current = next((a for a in arrays if a and any("locations" in x for x in a)),
                       arrays[0])
        # The server-side response includes the page count in the same RSC
        # stream; use it to verify complete scanning.
        chunks = []
        doc = BeautifulSoup(html, "html.parser")
        for script in doc.select("script"):
            raw = script.string or ""
            if "__next_f.push" in raw:
                for encoded in re.findall(
                    r'self\.__next_f\.push\(\[1,\s*("(?:\\.|[^"\\])*")\s*\]\)',
                    raw, re.S,
                ):
                    try:
                        chunks.append(json.loads(encoded))
                    except ValueError:
                        pass
        joined = "\n".join(chunks)
        counts = re.findall(r'"totalPages":(\d+)', joined)
        if counts:
            this_pages = int(counts[-1])
            if this_pages > max_pages:
                raise ValueError("SAP exceeds bounded pagination; cannot claim complete scan")
            if total_pages is None:
                total_pages = this_pages
            elif total_pages != this_pages:
                raise ValueError("SAP pagination total changed mid-scan")
        if number > 1 and current and all(str(x.get("id")) in results for x in current):
            raise ValueError("SAP repeated a page before all results were scanned")

        for record in current:
            link = urljoin("https://jobs.sap.com", str(record.get("url") or ""))
            parts = urlsplit(link)
            if parts.hostname != "jobs.sap.com" or not re.fullmatch(
                r"/en/jobs/\d+/[a-z0-9-]+/?", parts.path, re.I
            ):
                continue
            location = str(record.get("locations") or "")
            if not _EGYPT.search(location):
                continue
            title = str(record.get("title") or "").strip()
            if not title:
                continue
            posted = str(record.get("displayDate") or "")
            row = make_job(name, title, location, link,
                           str(record.get("teams") or ""),
                           posted, str(record.get("contractType") or ""))
            row["external_id"] = str(record.get("id") or "")
            results[link] = row

        if total_pages is None or number >= total_pages:
            return list(results.values())
    raise ValueError("SAP pagination stopped early")
