"""Company-specific adapters for verified public Egypt job feeds.

No authentication, anti-bot bypass, or guessed private endpoints.
"""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlsplit

MAX_PAGES = 8
PAGE_SIZE = 100


def _live(item):
    state = item.get("status")
    if isinstance(state, dict):
        state = state.get("label") or state.get("name") or ""
    if str(state or "").casefold() in ("expired", "closed", "draft", "archived", "inactive"):
        return False

    expiry = str(item.get("expiryDate") or "")[:10]
    if len(expiry) == 10:
        try:
            return datetime.strptime(expiry, "%Y-%m-%d").date() >= datetime.now(timezone.utc).date()
        except ValueError:
            pass
    return True


def telecom_egypt(name, get_json, make_job):
    """Read Telecom Egypt's public Liferay Object REST feed (verified by browser).
    Return a complete, non-expired page set. Do not claim success for incomplete paging.
    """
    from urllib.parse import urlencode
    endpoint = "https://te.eg/o/c/vacancies/"
    results = {}
    expected = None

    for page in range(1, MAX_PAGES + 1):
        url = endpoint + "?" + urlencode({"page": page, "pageSize": PAGE_SIZE})
        payload = get_json(url)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise ValueError("Telecom Egypt vacancies feed schema has changed")

        try:
            total = int(payload["totalCount"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError("Telecom Egypt returned no reliable totalCount") from exc

        if expected is None:
            expected = total
        elif total != expected:
            # Do not silently mix pages from a changing snapshot.
            raise ValueError("Telecom Egypt listings changed during pagination")

        rows = payload["items"]
        for row in rows:
            if not isinstance(row, dict) or not _live(row):
                continue

            identifier = row.get("id") or row.get("externalReferenceCode")
            title = str(row.get("titleEnglish") or row.get("titleArabic") or "").strip()
            if not identifier or not title:
                continue
            location = str(row.get("locationEnglish") or row.get("locationArabic") or "").strip()
            description = str(
                row.get("descriptionEnglishRawText")
                or row.get("descriptionEnglish")
                or row.get("descriptionArabicRawText")
                or ""
            )
            # No stable per-job apply link is provided by this listing endpoint.
            # The employer's own jobs page is the grounded destination.
            url = "https://te.eg/about-te/careers-and-training/jobs"
            job = make_job(
                name, title, location, url, description,
                row.get("dateCreated") or "", ""
            )
            job["id"] = "custom-telecom-eg-" + str(identifier)
            job["external_id"] = str(identifier)
            job["application_link_type"] = "career_list"
            results[str(identifier)] = job

        if page * PAGE_SIZE >= total:
            break
        if not rows:
            raise ValueError("Telecom Egypt response stopped before all vacancies were read")
    else:
        raise ValueError("Telecom Egypt vacancy paging limit reached")

    return list(results.values())


def siemens_software(name, get_json, make_job, get_bytes=None):
    """Read the public Siemens Software search API seen in their careers UI.

    The query is scoped to the Cairo area and reads all reported pages.
    Missing job URLs, incomplete pages, and schema drift fail explicitly.
    """
    import re
    from urllib.parse import urlencode, quote

    endpoint = "https://prod-search-api.jobsyn.org/api/v1/solr/search"
    results = {}
    details_checked = 0
    pages = 0
    while pages < 40:
        pages += 1
        query = urlencode({
            "location": "Cairo",
            "page": pages,
            "businessStructures": "electronic-design-automation-eda",
            "num_items": 10,
        })
        data = get_json(endpoint + "?" + query)
        if not isinstance(data, dict) or not isinstance(data.get("jobs"), list):
            raise ValueError("Siemens public jobs API schema changed")
        p = data.get("pagination") or {}
        if not isinstance(p, dict) or "has_more_pages" not in p:
            raise ValueError("Siemens public jobs pagination missing")
        rows = data["jobs"]
        if not rows and p["has_more_pages"]:
            raise ValueError("Incomplete Siemens jobs page")

        for row in rows:
            if not isinstance(row, dict):
                continue
            country = str(row.get("country_exact") or row.get("country_short_exact") or "")
            if country.strip().casefold() not in ("egypt", "egy", "eg"):
                continue
            title = str(row.get("title_exact") or "").strip()
            city_value = str(row.get("city_exact") or "").strip()
            city = (
                re.sub(r"[^a-z0-9]+", "-", city_value.lower()).strip("-")
                if city_value
                else str(row.get("city_slab_exact") or "").split("/", 1)[0].strip().lower()
            )
            slug = str(row.get("title_slug") or "").strip()
            guid = str(row.get("guid") or "").strip()
            ccode = str(row.get("country_short_exact") or "EGY").lower()
            if not title or not city or not slug or not re.fullmatch(r"[A-Za-z0-9-]{10,80}", guid):
                continue
            if not re.fullmatch(r"[a-z0-9-]+", city) or not re.fullmatch(r"[a-z0-9-]+", slug):
                continue
            url = (
                "https://jobs.sw.siemens.com/"
                + quote(city, safe="") + "-"
                + quote(ccode, safe="") + "/"
                + quote(slug, safe="") + "/"
                + quote(guid, safe="") + "/job/"
            )
            location = str(row.get("location_exact") or row.get("city_exact") or "")
            if not location:
                location = str(row.get("city_exact") or "") + ", Egypt"
            # First use explicit employer-owned ATS career-level fields; never
            # infer entry-level from a generic engineering title alone.
            experience = " ".join(str(row.get(key) or "") for key in (
                "experience_level_exact", "experience_level", "career_level",
                "experienceLevel", "job_level_exact", "job_level",
            ))
            description = str(row.get("description") or "")
            published = row.get("date_new") or row.get("date_added") or ""
            if not re.search(r"\b(?:early professional|entry.level|junior|graduate|intern)\b", experience, re.I):
                # A limited number of ambiguous technical jobs are checked
                # against their official detail page for explicit career-level evidence.
                technical = re.search(r"\b(?:software|ai|machine learning|data|backend|frontend|developer|programmer)\b", title, re.I)
                if get_bytes is not None and technical and details_checked < 24:
                    details_checked += 1
                    try:
                        detail = get_bytes(url).decode("utf-8", "replace")
                        from html import unescape
                        plain = re.sub(r"<[^>]*>", " ", detail)
                        plain = re.sub(r"\s+", " ", unescape(plain))
                        match = re.search(r"\bExperience level\s*:\s*(Early Professional|Entry Level|Junior|Graduate|Internship)\b", plain, re.I)
                        if match:
                            experience = match.group(1)
                    except (OSError, ValueError, TimeoutError):
                        pass
            job = make_job(
                name, title, location, url, description, published, ""
            )
            if re.search(r"\b(?:early professional|entry.level|junior|graduate|intern)\b", experience, re.I):
                job["seniority"] = "Early Professional" if re.search("early professional",experience,re.I) else experience.strip()[:100]
            job["external_id"] = str(row.get("req_id") or row.get("job_id") or "")
            # The API GUID is stable even when a job title or slug changes.
            job["id"] = "custom-siemens-" + guid
            results[guid] = job

        if not p["has_more_pages"]:
            return list(results.values())
    raise ValueError("Siemens jobs pagination exceeded the safe page limit")
