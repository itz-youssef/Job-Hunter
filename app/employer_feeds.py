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
