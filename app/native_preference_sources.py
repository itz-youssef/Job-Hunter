"""Company-native preference source capabilities, independent of the all-jobs scanner.

Never delete jobs from the discovery catalog due to a member's preferences.
Only advertise a filter as employer-side when the public API actually supports
that query parameter. An API supplying department metadata is not equivalent
to an employer-side filtered query.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit

# Modes describe verified PUBLIC API abilities, not the employer's UI.
SERVER_FILTER_KINDS = {"lever"}
PUBLISHED_FACET_KINDS = {"greenhouse", "ashby", "smartrecruiters", "workday"}
# An HTML source can have site-specific filtering, but it is NOT marked verified.
FILTER_FIELDS = {
    "lever": ["location", "team", "department", "commitment", "level"],
    "greenhouse": ["department", "office", "published_custom_metadata"],
    "ashby": ["department", "team", "employment_type", "location"],
    "smartrecruiters": ["employment_type", "location"],
    "workday": ["location", "published_job_metadata"],
}
DOCS = {
    "lever": "https://github.com/lever/postings-api/blob/master/README.md",
    "greenhouse": "https://developers.greenhouse.io/job-board.html",
    "ashby": "https://developers.ashbyhq.com/docs/public-job-posting-api",
    "smartrecruiters": "https://developers.smartrecruiters.com/docs/posting-api",
}


def capabilities(companies, detector):
    """Audit EVERY configured company without fetching or filtering its catalog."""
    entries = []
    for company in companies:
        if not isinstance(company, dict) or not company.get("name") or not company.get("url"):
            continue
        kind, meta = detector(str(company["url"]))
        mode = ("server-query" if kind in SERVER_FILTER_KINDS else
                "official-posting-facets" if kind in PUBLISHED_FACET_KINDS else
                "internal-fallback")
        entries.append({
            "name": str(company["name"]),
            "source_url": str(company["url"]),
            "source_kind": kind,
            "preference_mode": mode,
            "available_fields": FILTER_FIELDS.get(kind, []),
            "supports_employer_side_filter": kind in SERVER_FILTER_KINDS,
            "verification": "documented-api-capability" if kind in SERVER_FILTER_KINDS | PUBLISHED_FACET_KINDS else "not-verified",
            "documentation": DOCS.get(kind, ""),
        })
    return entries


def lever_query_url(board_url, *, location=None, teams=(), departments=(),
                    commitments=(), level=None):
    """Official Lever posting API filters: exact employer labels, not guessed aliases.

    This function is a query builder for the SEPARATE preference pipeline;
    it never changes the unfiltered discovery scan. Caller must discover exact
    case-sensitive facet values from employer data before filtering.
    """
    parsed = urlsplit(board_url)
    parts = [x for x in parsed.path.split("/") if x]
    if parsed.scheme != "https" or parsed.hostname != "jobs.lever.co" or not parts:
        raise ValueError("Only public Lever company boards are supported")
    board = parts[0]
    if not all(ch.isalnum() or ch in "-_" for ch in board):
        raise ValueError("Invalid Lever company board")
    def clean(value):
        value = str(value or "").strip()
        if not value or len(value) > 100 or any(ord(c) < 32 for c in value):
            raise ValueError("Invalid employer facet value")
        return value
    params = [("mode", "json")]
    if location:
        params.append(("location", clean(location)))
    for param, values in (("team", teams), ("department", departments),
                          ("commitment", commitments)):
        for value in tuple(values)[:16]:
            params.append((param, clean(value)))
    if level:
        params.append(("level", clean(level)))
    return "https://api.lever.co/v0/postings/" + quote(board, safe="") + "?" + urlencode(params)


def query_lever_native(board_url, get_json, *, location=None, teams=(),
                       departments=(), commitments=(), level=None):
    """Execute ONE employer-native query for a configured board, with pagination.

    Return official posting objects without altering or erasing all-jobs data.
    The caller supplies the existing safe HTTP/JSON adapter.
    """
    base = lever_query_url(board_url, location=location, teams=teams,
                           departments=departments, commitments=commitments,
                           level=level)
    from urllib.parse import urlencode
    results = []
    for offset in range(0, 1000, 100):
        url = base + "&" + urlencode({"skip": offset, "limit": 100})
        batch = get_json(url)
        if not isinstance(batch, list):
            raise ValueError("Unexpected Lever postings response")
        results.extend(batch)
        if len(batch) < 100:
            break
    return results


def write_capabilities(companies, detector, output):
    """Public diagnostics only; never include private account preferences."""
    rows = capabilities(companies, detector)
    payload = {"schema_version": 1, "company_count": len(rows),
               "companies": rows, "data_source": "configured-public-career-urls"}
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    return payload
