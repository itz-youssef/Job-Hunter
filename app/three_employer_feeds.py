"""Public employer-specific sources for VOIS, Ericsson, Fawry.

Only public unauthenticated employer-hosted feeds. Any paging error is
reported instead of silently claiming a complete successful scan.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urljoin, urlencode, parse_qs

EGYPT = re.compile(r"\b(?:egypt|cairo|giza|alexandria|smart village|\bEG\b)\b", re.I)
TECH = re.compile(r"software|engineer|developer|intern|graduate|work experience|trainee|artificial intelligence|machine learning|\bAI\b|computer vision|data", re.I)


def _location(values):
    if isinstance(values, str):
        return values
    if isinstance(values, dict):
        return ", ".join(str(values.get(k) or "") for k in ("city", "state", "country") if values.get(k))
    if isinstance(values, list):
        return next((place for value in values if EGYPT.search(place := _location(value))), "")
    return ""


def eightfold_egypt(name, host, domain, get_json, make_job, vois=False):
    """Employer's public Eightfold PCSX search scoped to Egyptian job locations.

    Never trust the location filter alone: multi-country roles can appear in
    Egypt searches and vice versa, so each row is checked independently.
    """
    endpoint = f"https://{host}/api/pcsx/search"
    results = {}
    total = None
    page_size = 10
    for page in range(50):
        params = {
            "domain": domain,
            "query": "",
            "location": "Egypt",
            "start": page * page_size,
            "num": page_size,
        }
        if vois:
            params["filter_brand"] = "vois"
        payload = get_json(endpoint + "?" + urlencode(params))
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
            raise ValueError("Eightfold PCSX response schema changed")
        data = payload["data"]
        if not isinstance(data.get("positions"), list):
            raise ValueError("Eightfold positions list is missing")
        try:
            count = int(data["count"])
        except (ValueError, TypeError, KeyError) as exc:
            raise ValueError("Eightfold result total is missing") from exc
        if total is None:
            total = count
        elif count != total:
            raise ValueError("Eightfold listing total changed during paging")

        rows = data["positions"]
        if not rows and page * page_size < total:
            raise ValueError("Eightfold returned an incomplete search page")

        for item in rows:
            if not isinstance(item, dict):
                continue
            identity = str(item.get("id") or "")
            title = str(item.get("name") or item.get("title") or "").strip()
            locations = item.get("locations") or item.get("standardizedLocations") or item.get("location") or []
            if isinstance(locations, list):
                location = _location(locations)
            else:
                location = _location(locations)
            if not EGYPT.search(location) or not title or not identity.isdecimal():
                continue
            if vois:
                brand = str(item.get("brand") or item.get("companyName") or "")
                if not re.search(r"\bvois\b", title+" "+brand, re.I):
                    # Some early-career programmes have no (VOIS) in the title
                    # but the search is explicitly brand-scoped. Allow these only
                    # when the programme explicitly says VOIS.
                    continue
            path = str(item.get("positionUrl") or item.get("canonicalPositionUrl") or "")
            link = urljoin(f"https://{host}/", path)
            parts = urlsplit(link)
            if parts.scheme != "https" or parts.hostname != host or not re.fullmatch(r"/careers/job/[0-9]+/?", parts.path):
                continue
            timestamp = item.get("postedTs") or item.get("creationTs") or item.get("t_create")
            if isinstance(timestamp, (int, float)):
                ts = timestamp / 1000 if timestamp > 10**11 else timestamp
                try:
                    published = datetime.fromtimestamp(ts, timezone.utc).date().isoformat()
                except (ValueError, OverflowError, OSError):
                    published = ""
            else:
                published = str(timestamp or "")
            desc = str(item.get("job_description") or item.get("jobDescription") or "")
            job = make_job(name, title, location, link, desc, published,
                           str(item.get("employmentType") or item.get("employment_type") or ""))
            job["id"] = "custom-" + ("vois" if vois else "ericsson") + "-" + identity
            job["external_id"] = str(item.get("displayJobId") or item.get("atsJobId") or identity)
            results[identity] = job
        if (page + 1) * page_size >= total:
            return list(results.values())
        if len(rows) < page_size:
            raise ValueError("Eightfold search stopped before all pages were processed")
    raise ValueError("Eightfold results exceed safety paging limit")


def fawry_public_partial(name, get_bytes, make_job):
    """Read employer's public job index; do not claim complete Ajax pagination.

    Fawry's public 2025 listings are retained with original dates, so that
    they are not mislabeled as newly posted 2026 opportunities.
    """
    from html.parser import HTMLParser
    from html import unescape
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.href = None
            self.text = []
            self.links = []
        def handle_starttag(self, tag, attrs):
            if tag == "a":
                self.href = dict(attrs).get("href")
                self.text = []
        def handle_data(self, text):
            if self.href is not None:
                self.text.append(text)
        def handle_endtag(self, tag):
            if tag == "a" and self.href is not None:
                self.links.append((self.href, " ".join(" ".join(self.text).split())))
                self.href = None
    address = "https://www.fawry.com/jobs/"
    raw = get_bytes(address).decode("utf-8", "replace")
    parser = Links()
    parser.feed(raw)
    result = {}
    for href, content in parser.links:
        full = urljoin(address, href)
        url = urlsplit(full)
        if url.hostname not in ("www.fawry.com", "fawry.com"):
            continue
        q = parse_qs(url.query)
        if q.get("post_type") != ["job_listing"] or not re.fullmatch(r"[0-9]+", (q.get("p") or [""])[0]):
            continue
        # The listing format is "Job title Anywhere Posted on November 3, 2025".
        label = " ".join(content.split())
        parts = re.split(r"\s+Anywhere\s+Posted on\s+|\s+Posted on\s+", label, maxsplit=1, flags=re.I)
        title = parts[0].strip()
        if not title or len(title) > 130:
            continue
        published = ""
        if len(parts) > 1:
            try:
                published = datetime.strptime(parts[1][:25].strip(), "%B %d, %Y").date().isoformat()
            except ValueError:
                pass
        if not TECH.search(title):
            continue
        # "Anywhere" is not evidence of an explicitly Egyptian vacancy.
        # Preserve the original location rather than silently fabricating Egypt.
        job = make_job(name, title, "Anywhere", full, "", published, "")
        job["id"] = "custom-fawry-" + q["p"][0]
        result[job["id"]] = job
    return list(result.values())
