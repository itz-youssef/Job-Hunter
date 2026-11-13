"""Read-only live acceptance tests for configured Egyptian employer sources.

No credentials or applicant data are used. Produces a per-company result artifact.
Never treat zero vacancies or mere HTTP 200 as proof of job extraction.
"""
import concurrent.futures
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

from app.custom_sources import scan_company

TARGETS = {
    "Henkel Egypt", "Coca-Cola HBC Egypt", "Coca-Cola Egypt",
    "Systems Limited Egypt", "HSBC Egypt", "Banque Misr",
    "Banque du Caire", "blnk Egypt", "NBK Egypt", "Globant",
    "Konecta Egypt", "ADIB Egypt", "FAB Egypt", "ADCB Egypt",
    "Globitel Egypt", "Fab Minds Egypt",
}
INVALID = {"error", "access_blocked", "needs_adapter", "invalid"}
PROVEN = {"monitoring", "partial"}

def check(company):
    name = company["name"]
    try:
        jobs, status, reason = scan_company(company)
        valid = []
        for job in jobs:
            if not all(job.get(k) for k in ("id", "company", "title", "url")):
                raise AssertionError("Malformed vacancy without identity, title, or link")
            if not str(job["url"]).startswith("https://"):
                raise AssertionError("Vacancy URL is not HTTPS")
            valid.append({"title": job["title"], "location": job.get("location", ""),
                          "url": job["url"]})
        if status == "monitoring" and not valid and name in ("Blink22", "Breadfast", "Breadfast Technology"):
            status = "partial"
            reason += "; no verified current vacancies"
        return {"name": name, "status": status, "count": len(valid),
                "reason": reason, "examples": valid[:2],
                "validated": status in PROVEN}
    except Exception as exc:
        return {"name": name, "status": "error", "count": 0,
                "reason": type(exc).__name__ + ": " + str(exc)[:180],
                "examples": [], "validated": False}

def main():
    companies = json.loads(Path("companies.json").read_text(encoding="utf-8"))
    assert len({c["name"].casefold() for c in companies}) == len(companies)
    selected = [company for company in companies if company["name"] in TARGETS]
    assert len(selected) == len(TARGETS), "Missing new employer registry entries"
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, selected))
    data = {"checked_at": datetime.now(timezone.utc).isoformat(),
            "total": len(companies), "results": results}
    Path("watchlist-live-results.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    for row in results:
        print(f'{row["name"]}: {row["status"]} | jobs={row["count"]} | {row["reason"]}', flush=True)
    blockers = [r for r in results if r["status"] in INVALID]
    print(f'NEW EMPLOYER BLOCKERS: {len(blockers)}', flush=True)
    for item in blockers:
        print("FAIL", item["name"], item["reason"], flush=True)
    return 1 if blockers else 0

if __name__ == "__main__":
    sys.exit(main())
