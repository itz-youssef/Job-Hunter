"""Public Oracle Recruiting Candidate Experience adapter.

Only scans published jobs on a specifically supplied public Oracle job board.
Does not use credentials or attempt to bypass access restrictions.
"""
from __future__ import annotations

import re
from urllib.parse import quote, urlencode, urlsplit

MAX_PAGES = 5
PAGE_SIZE = 100
MAX_DETAILS = 20
EGYPT = re.compile(r"\b(?:egypt|cairo|giza|alexandria|maadi|6th of october|nasr city|smart village)\b", re.I)
TARGET = re.compile(r"(?:software|developer|backend|back.end|front.end|full.stack|python|machine learning|mlops|computer vision|artificial intelligence|\bAI\b|\bML\b|data scien|intern|graduate|trainee)", re.I)


def supports(url: str) -> bool:
    p = urlsplit(url)
    return (p.scheme == "https" and (p.hostname or "").endswith(".oraclecloud.com")
            and bool(re.search(r"/hcmUI/CandidateExperience/[^/]+/sites/[A-Za-z0-9_-]+(?:/|$)", p.path)))


def scan(name: str, url: str, get_json, make_job) -> list[dict]:
    """Use a caller-provided GET helper and normalized-job constructor."""
    if not supports(url):
        raise ValueError("Not a public Oracle Candidate Experience URL")
    p = urlsplit(url)
    m = re.search(r"/hcmUI/CandidateExperience/([^/]+)/sites/([A-Za-z0-9_-]+)", p.path)
    lang, site = m.groups()
    origin = f"https://{p.hostname}"
    endpoint = origin + "/hcmRestApi/resources/latest"
    found, details_done = {}, 0
    for page in range(MAX_PAGES):
        offset = page * PAGE_SIZE
        finder = f"findReqs;siteNumber={site},limit={PAGE_SIZE},offset={offset},sortBy=POSTING_DATES_DESC"
        params = urlencode({"onlyData": "true", "expand": "requisitionList.secondaryLocations", "finder": finder})
        envelope = get_json(f"{endpoint}/recruitingCEJobRequisitions?{params}")
        records = envelope.get("items") or []
        if not records:
            break
        payload = records[0]
        rows = payload.get("requisitionList") or []
        for row in rows:
            job_id = str(row.get("Id") or "").strip()
            title = str(row.get("Title") or "").strip()
            location = str(row.get("PrimaryLocation") or "").strip()
            country = str(row.get("PrimaryLocationCountry") or "").upper().strip()
            if not job_id or not title or (country != "EG" and not EGYPT.search(location)):
                continue
            if country == "EG" and not location:
                location = "Egypt"
            if not TARGET.search(title):
                continue
            if job_id in found:
                continue
            description = str(row.get("ShortDescriptionStr") or "")
            date = row.get("PostedDate") or ""
            if details_done < MAX_DETAILS:
                details_done += 1
                detail_finder = f'ById;Id="{job_id}",siteNumber={site}'
                detail_params = urlencode({"onlyData": "true", "expand": "all", "finder": detail_finder})
                try:
                    detail_rows = get_json(f"{endpoint}/recruitingCEJobRequisitionDetails?{detail_params}").get("items") or []
                    if detail_rows:
                        d = detail_rows[0]
                        description = " ".join(str(d.get(k) or "") for k in (
                            "ExternalDescriptionStr", "ExternalResponsibilitiesStr", "ExternalQualificationsStr"
                        )).strip() or description
                        date = d.get("ExternalPostedStartDate") or date
                except (OSError, ValueError, KeyError):
                    # Keep a public listing even if its detail endpoint is unavailable.
                    pass
            job_url = f"{origin}/hcmUI/CandidateExperience/{quote(lang,safe='')}/sites/{quote(site,safe='')}/job/{quote(job_id,safe='')}"
            found[job_id] = make_job(name, title, location, job_url, description, date, row.get("JobSchedule") or "")
        if not rows or offset + len(rows) >= (payload.get("TotalJobsCount") or 0):
            break
    return list(found.values())
