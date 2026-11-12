"""Employer-specific publicly accessible vacancies APIs. No bypass or credentials."""
from __future__ import annotations

import re
from urllib.parse import urlsplit


def ibm_egypt(name, post_json, make_job):
    """IBM careers' own search API, scoped to the country facet Egypt."""
    endpoint = "https://www-api.ibm.com/search/api/v2"
    seen = {}
    limit = 100
    for page in range(8):
        body = {
            "appId": "careers",
            "scopes": ["careers2"],
            "query": {"bool": {"must": [{"term": {"field_keyword_05": "Egypt"}}]}},
            "from": page * limit,
            "size": limit,
            "sort": [{"_score": "desc"}, {"pageviews": "desc"}],
            "lang": "zz",
            "localeSelector": {},
            "sm": {"query": "", "lang": "zz"},
            "_source": [
                "_id", "title", "url", "description", "language",
                "field_keyword_05", "field_keyword_17",
                "field_keyword_08", "field_keyword_18", "field_keyword_19",
            ],
        }
        data = post_json(endpoint, body)
        if not isinstance(data, dict) or not isinstance(data.get("hits"), dict):
            raise ValueError("IBM careers search schema changed")
        result = data["hits"]
        totaldata = result.get("total")
        if not isinstance(totaldata, dict) or not isinstance(result.get("hits"), list):
            raise ValueError("IBM careers hits/total schema changed")
        total = int(totaldata.get("value", -1))
        if total < 0:
            raise ValueError("IBM careers result count missing")
        rows = result["hits"]
        for hit in rows:
            raw = hit.get("_source") if isinstance(hit, dict) else None
            if not isinstance(raw, dict):
                continue
            country = str(raw.get("field_keyword_05") or "").casefold().strip()
            if country != "egypt":
                continue
            title = str(raw.get("title") or "").strip()
            url = str(raw.get("url") or "").strip()
            p = urlsplit(url)
            if (
                not title or p.scheme != "https"
                or p.hostname not in ("careers.ibm.com", "www.ibm.com")
                or not p.path.startswith(("/careers/", "/en_US/careers/"))
            ):
                continue
            location = str(raw.get("field_keyword_19") or "").strip()
            if location and not re.search(r"\b(?:EG|Egypt)\b", location, re.I):
                location += ", Egypt"
            if not location:
                location = "Egypt"
            job = make_job(
                name, title, location, url, raw.get("description") or "", "", ""
            )
            job["seniority"] = str(raw.get("field_keyword_18") or "")
            job["category"] = str(raw.get("field_keyword_08") or "")
            match = re.search(r"(?:\?|&)jobId=([A-Za-z0-9_-]+)", url)
            if match:
                job["id"] = "custom-ibm-" + match.group(1)
            seen[job["id"]] = job
        if (page + 1) * limit >= total:
            return list(seen.values())
        if not rows:
            raise ValueError("IBM results stopped before all pages were read")
    raise ValueError("IBM jobs exceed the configured public paging limit")



def paymob_recruitera(name, get_json, make_job):
    """Paymob's publicly listed Recruitera employer board with cursor paging."""
    from urllib.parse import quote
    endpoint = "https://app.recruitera.ai/api/public/v1/paymob/opportunities"
    seen = {}
    cursor = None
    used_cursors = set()
    expected = None
    processed = 0

    for page in range(12):
        url = endpoint + (("?cursor=" + quote(cursor, safe="")) if cursor else "")
        payload = get_json(url)
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise ValueError("Paymob public opportunities schema changed")
        meta = payload.get("meta")
        if not isinstance(meta, dict):
            raise ValueError("Paymob pagination metadata missing")
        rows = payload["data"]
        processed += len(rows)
        try:
            count = int(meta["found"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError("Paymob total opportunity count unavailable") from exc
        if expected is None:
            expected = count
        elif expected != count:
            raise ValueError("Paymob listings changed during pagination")

        before = len(seen)
        for row in rows:
            if not isinstance(row, dict):
                continue
            job_id = str(row.get("id") or "").strip()
            title = str(row.get("title") or "").strip()
            slug = str(row.get("slug") or "").strip()
            if not (job_id and title and slug):
                continue
            # Constrain navigational links to the current employer's board.
            if not re.fullmatch(r"[\w%-]+", slug, re.UNICODE):
                continue
            url = "https://app.recruitera.ai/careers/paymob/" + quote(slug, safe="%-")
            location = str(row.get("location") or "").strip()
            description = str(row.get("excerpt") or "")
            job = make_job(
                name, title, location, url, description, "",
                str(row.get("employment_type") or "")
            )
            job["id"] = "custom-paymob-" + job_id
            job["work_model"] = str(row.get("work_model") or "")
            job["department"] = str(row.get("department") or "")
            seen[job_id] = job

        next_cursor = meta.get("next_cursor")
        if not next_cursor:
            if expected is not None and processed < expected:
                raise ValueError("Paymob stopped before all listed opportunities were read")
            return list(seen.values())
        if not isinstance(next_cursor, str) or next_cursor in used_cursors:
            raise ValueError("Paymob pagination cursor repeated")
        used_cursors.add(next_cursor)
        cursor = next_cursor
        if len(seen) <= before:
            raise ValueError("Paymob pagination did not advance")

    raise ValueError("Paymob opportunities exceed safe pagination limits")



def orange_egypt(name, post_json, make_job):
    """Orange Egypt's own public Phenom recruitment results feed.

    Search is explicitly scoped to EGYPT and Orange Egypt. Read complete
    pages and fail if the remote server changes result count mid-scan.
    """
    from urllib.parse import quote
    api = "https://orange.jobs/widgets"
    page_size = 100
    offset = 0
    expected = None
    records = {}
    visited_offsets = set()

    for page in range(30):
        if offset in visited_offsets:
            raise ValueError("Orange search pagination repeated")
        visited_offsets.add(offset)
        body = {
            "ddoKey": "refineSearch",
            "jobs": True,
            "counts": True,
            "from": offset,
            "size": page_size,
            "pageName": "Egypt results",
            "pageType": "landingPage",
            "rk": "l-egypt-results",
            "sortBy": "",
            "subsearch": "",
            "all_fields": [
                "phLocSlider", "category", "contractType", "country",
                "city", "companyName", "workModel", "hiringType"
            ],
            "selected_fields": {
                "country": ["EGYPT"],
                "companyName": ["Orange Egypt"]
            },
            "lang": "en_gb",
            "deviceType": "desktop",
            "country": "gb",
            "pageId": "page549-prod",
            "siteType": "external",
            "refNum": "OYVOCZGB"
        }
        result = post_json(api, body)
        search = result.get("refineSearch") if isinstance(result, dict) else None
        if not isinstance(search, dict) or not isinstance(search.get("data"), dict):
            raise ValueError("Orange Egypt public search schema changed")
        data = search["data"]
        rows = data.get("jobs")
        if not isinstance(rows, list):
            raise ValueError("Orange Egypt jobs list missing")
        try:
            total = int(search["totalHits"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError("Orange Egypt public search totalHits missing") from exc
        if expected is None:
            expected = total
        elif total != expected:
            raise ValueError("Orange Egypt jobs changed during pagination")

        for row in rows:
            if not isinstance(row, dict):
                continue
            country = str(row.get("country") or "").strip().lower()
            if country not in ("egypt", "eg", "egy"):
                continue
            title = str(row.get("title") or "").strip()
            job_id = str(row.get("jobId") or "").strip()
            if not title or not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", job_id):
                continue

            city = str(row.get("city") or "").strip()
            location = (city + ", Egypt") if city else "Egypt"
            apply = str(row.get("applyUrl") or "").strip()
            public_url = str(row.get("jobUrl") or "").strip()
            def approved_url(value):
                parsed = urlsplit(value)
                return parsed.scheme == "https" and parsed.hostname in (
                    "orange.jobs", "www.careers-page.com", "careers-page.com"
                )

            if approved_url(apply):
                url = apply
            elif approved_url(public_url):
                url = public_url
            else:
                slug = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-")
                url = (
                    "https://orange.jobs/gb/en/job/"
                    + quote(job_id, safe="-") + "/" + quote(slug, safe="-")
                )
            description = str(
                row.get("jobDescription")
                or row.get("description")
                or row.get("shortDescription")
                or ""
            )
            job = make_job(
                name, title, location, url, description,
                row.get("datePosted") or row.get("postedDate") or "",
                row.get("contractType") or ""
            )
            job["id"] = "custom-orange-" + job_id
            job["seniority"] = str(row.get("hiringType") or "")
            records[job_id] = job

        offset += len(rows)
        if offset >= total:
            return list(records.values())
        if not rows:
            raise ValueError("Orange Egypt returned an incomplete page")

    raise ValueError("Orange Egypt search exceeded safe pagination limit")
