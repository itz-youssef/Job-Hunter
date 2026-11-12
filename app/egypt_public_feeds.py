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
