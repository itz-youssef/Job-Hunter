"""Read-only diagnostics of employer career sources; no credentials or emails."""
import json
from pathlib import Path
from app.custom_sources import scan_company

TARGETS = {"Breadfast", "Breadfast Technology", "Capgemini Egypt",
           "Deloitte", "DXC Technology", "e& / Etisalat", "Chatbase"}

def main():
    companies = json.loads(Path("companies.json").read_text(encoding="utf-8"))
    for company in companies:
        if company.get("name") not in TARGETS:
            continue
        jobs, status, message = scan_company(company)
        print("SOURCE", company["name"], status, message, "count", len(jobs), flush=True)
        for job in jobs[:3]:
            print("POSTING", job.get("title"), job.get("location"), job.get("url"), flush=True)

if __name__ == "__main__":
    main()
