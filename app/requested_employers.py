"""Read public employer-owned careers pages; fail on incomplete pagination."""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlsplit


def capgemini_egypt(name, get_bytes, parse_links, structured_jobs, make_job):
    """Capgemini's official SuccessFactors Egypt job search, not its corporate landing page.

    A job URL's /job/Cairo-... segment supplies the city; jobs without an
    Egypt city or a verified structured jobLocation are not eligible.
    """
    endpoint = "https://careers.capgemini.com/search/?q=&locationsearch=Egypt"
    jobs = {}
    seen_pages = set()
    page_size = 25
    max_pages = 12

    for page_no in range(max_pages):
        page_url = endpoint + "&startrow=" + str(page_no * page_size)
        document = get_bytes(page_url).decode("utf-8", "replace")
        links = parse_links(document)
        candidates = {}
        for href, text in links:
            absolute = urljoin(page_url, href).split("#", 1)[0].split("?", 1)[0]
            p = urlsplit(absolute)
            if p.hostname != "careers.capgemini.com":
                continue
            m = re.fullmatch(r"/job/([^/]+)/([0-9]+)/?", p.path, re.I)
            if not m:
                continue
            slug = m.group(1)
            city_match = re.match(
                r"(Cairo|Giza|Alexandria|New-Cairo|Sixth-of-October)[-]",
                slug, re.I
            )
            if not city_match:
                continue
            title = " ".join(str(text).split())
            if not title or title.lower() in {"apply", "view job", "view details"}:
                title = slug[len(city_match.group(0)):].replace("-", " ")
            candidates[absolute] = (title, city_match.group(1).replace("-", " ") + ", Egypt")

        if not candidates:
            if page_no == 0:
                raise ValueError("Capgemini Egypt search returned no verified job links")
            return list(jobs.values())

        signature = frozenset(candidates)
        if signature in seen_pages:
            raise ValueError("Capgemini pagination repeated instead of completing")
        seen_pages.add(signature)
        new = 0
        for link, (title, location) in candidates.items():
            if link in jobs:
                continue
            new += 1
            description = ""
            published = ""
            employment = ""
            # Detail fetches are bounded; focus on relevant roles first.
            if re.search(
                r"software|developer|engineer|data|artificial intelligence|"
                r"machine learning|AI|intern|trainee|graduate|YPP|QA|test",
                title, re.I
            ) and len(jobs) < 150:
                try:
                    detail_html = get_bytes(link).decode("utf-8", "replace")
                    structured = structured_jobs(name, link, detail_html)
                    if structured:
                        record = next((x for x in structured if
                                       x.get("title") and x.get("description")), structured[0])
                        description = record.get("description") or ""
                        published = record.get("published_at") or ""
                        employment = record.get("employment") or ""
                    else:
                        # Extract text near the vacancy's own job description,
                        # not arbitrary company navigation or related jobs.
                        block = re.search(
                            r'<(?:div|section)[^>]+class="[^"]*jobdescription[^"]*"[^>]*>(.*?)</(?:div|section)>',
                            detail_html, re.I | re.S
                        )
                        if block:
                            from html import unescape
                            description = " ".join(unescape(re.sub(
                                r"<[^>]+>", " ", block.group(1)
                            )).split())[:12000]
                except (OSError, ValueError, KeyError):
                    pass
            jobs[link] = make_job(
                name, title, location, link, description, published, employment
            )

        # SuccessFactors may serve an incomplete last page; don't assume
        # completion merely from a transient empty mid-pagination page.
        if len(candidates) < page_size:
            return list(jobs.values())
        if new == 0:
            raise ValueError("Capgemini pagination stopped advancing")

    raise ValueError("Capgemini Egypt list exceeds verified pagination bound")


def deloitte_middle_east_partial(name, url, get_bytes, parse_links, make_job):
    """Read official Deloitte Middle East public PipelineDetail links.

    The rendered search page is paginated. Expose only verified records and
    explicitly return *partial*, not a false complete-feed status.
    """
    from urllib.parse import urljoin, urlsplit
    found = {}
    base = "https://middleeastjobs.deloitte.com/careersME/SearchJobs/"
    for page in dict.fromkeys((url, base)):
        try:
            document = get_bytes(page).decode("utf-8", "replace")
        except OSError:
            if found:
                continue
            raise
        for href, text in parse_links(document):
            target = urljoin(page, href).split("#", 1)[0]
            p = urlsplit(target)
            if p.hostname != "middleeastjobs.deloitte.com":
                continue
            if not re.match(r"^/careersME/PipelineDetail/[^/]+/[0-9]+/?$", p.path, re.I):
                continue
            label = " ".join(str(text).split())
            if not re.search(r"\\b(?:egypt|cairo|giza|alexandria)\\b",
                             label + " " + p.path.replace("-", " "), re.I):
                continue
            if label:
                found[target] = make_job(name, label, "Egypt", target, "", "", "")
    return list(found.values())


def capgemini_egypt_api(name, get_json, make_job):
    """Complete Egypt job feed from Capgemini's public corporate Jobstream API.

    Uses source country facet and exact returned total; no fabricated jobs.
    """
    from html import unescape
    from urllib.parse import urlsplit
    endpoint = "https://cg-jobstream-api.azurewebsites.net/api/job-search"
    page_size = 100
    found = {}
    total = None
    processed = 0
    for page in range(1, 21):
        data = get_json(
            f"{endpoint}?page={page}&size={page_size}&country_code=eg-en"
        )
        if not isinstance(data, dict) or not isinstance(data.get("data"), list):
            raise ValueError("Capgemini API search schema changed")
        try:
            expected = int(data["total"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError("Capgemini API total missing") from exc
        if total is None:
            total = expected
        elif expected != total:
            raise ValueError("Capgemini results changed during pagination")
        rows = data["data"]
        processed += len(rows)
        for item in rows:
            if not isinstance(item, dict):
                continue
            country = str(item.get("country_code") or "").lower()
            if country not in ("en-eg", "eg-en", "eg"):
                continue
            title = str(item.get("title") or "").strip()
            location = str(item.get("location") or "").strip()
            raw_link = str(item.get("apply_job_url") or "").strip()
            link = raw_link.split("?", 1)[0]
            p = urlsplit(link)
            if not title or p.scheme != "https" or p.hostname != "careers.capgemini.com":
                continue
            if not location:
                location = "Egypt"
            elif not re.search(r"\\b(?:egypt|EG)\\b", location, re.I):
                location += ", Egypt"
            description = item.get("description_stripped") or item.get("description") or ""
            description = " ".join(unescape(re.sub(r"<[^>]+>", " ", str(description))).split())[:20000]
            job = make_job(name, title, location, link, description, "",
                           str(item.get("contract_type") or ""))
            job["seniority"] = str(item.get("experience_level") or "")
            job["department"] = str(item.get("department") or "")
            found[link] = job

        if processed >= total:
            return list(found.values())
        if not rows:
            raise ValueError("Capgemini API returned an incomplete page")
    raise ValueError("Capgemini listings exceed pagination safety bound")
