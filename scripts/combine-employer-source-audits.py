"""Combine the 58 read-only source probes into one honest evidence matrix.

Live adapter output is NOT independent proof of full official job-board coverage.
A previous-source count is a drift signal, never a verified current vacancy total.
"""
from __future__ import annotations
import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

def aggregate(registry, shards, previous=None):
    names=[entry["name"] for entry in registry if isinstance(entry,dict)
           and entry.get("name") and entry.get("url")]
    if len(set(names))!=len(names):
        raise ValueError("Duplicate company in configured registry")
    expected=set(names)
    rows={}
    for shard in shards:
        for item in shard.get("results",[]):
            name=item["name"]
            if name in rows:raise ValueError("Duplicate source probe: "+name)
            if name not in expected:raise ValueError("Unknown source probe: "+name)
            rows[name]=item
    missing=expected-set(rows)
    if missing:raise ValueError("Missing source probes: "+", ".join(sorted(missing)))
    old={v["name"]:v for v in (previous or {}).get("companies",[])}
    findings=[]
    for name in names:
        current=rows[name]
        before=old.get(name,{})
        jobs=int(current["jobs_found"])
        descr=int(current.get("fields",{}).get("description",{}).get("present",0))
        requirements=int(current.get("fields",{}).get("requirements",{}).get("present",0))
        issues=[]
        if current["scan_status"] not in ("monitoring","partial"):
            issues.append("source-unavailable")
        if current["scan_status"]=="partial":issues.append("partial-listing-coverage")
        if jobs==0:issues.append("empty-unverified")
        if jobs and descr<jobs:issues.append("description-missing")
        if jobs and requirements==0:issues.append("separate-requirements-missing")
        if "duplicate-or-invalid-job-url" in current.get("issues",[]):
            issues.append("duplicate-or-invalid-url")
        if isinstance(before.get("jobs"),int) and jobs<before["jobs"]:
            issues.append("below-historical-count-review-not-proof-of-missed-jobs")
        findings.append({
            "company":name,"adapter":current.get("source_kind",""),
            "scan_status":current["scan_status"],
            "jobs_found":jobs,"description_present":descr,
            "requirements_present":requirements,
            "historical_jobs":before.get("jobs"),
            "official_total_verified":False,
            "completeness":"NOT INDEPENDENTLY VERIFIED",
            "issues":issues,
            "source_url":current.get("career_url",""),
        })
    summary={
        "companies_checked":len(findings),
        "jobs_found":sum(x["jobs_found"] for x in findings),
        "description_present":sum(x["description_present"] for x in findings),
        "requirements_present":sum(x["requirements_present"] for x in findings),
        "partial_or_failed":sum(x["scan_status"]!="monitoring" for x in findings),
        "lacking_any_description":sum(x["jobs_found"]>0 and x["description_present"]==0 for x in findings),
        "needs_review":sum(bool(x["issues"]) for x in findings),
        "official_totals_independently_confirmed":0,
    }
    return {
        "schema_version":1,"as_of_utc":datetime.now(timezone.utc).isoformat(),
        "warning":"Live scanner totals are NOT independently verified official vacancy totals. "
            "Changes since historical baseline can reflect closures, publication or parsing gaps.",
        "summary":summary,"companies":findings,
    }

def markdown(report):
    head=[
        "# Secret J — Source Coverage Evidence Audit",
        "",
        f"Generated: {report['as_of_utc']}",
        "",
        "**This report audits extractor output for all configured companies. It does "
        "not prove that the job count equals the employer's current official total.**",
        "A source marked Monitoring only means its adapter returned without an error.",
        "",
        "## Totals",
        "",
    ]
    head.extend(f"- **{key.replace('_',' ')}:** {val}"
                for key,val in report["summary"].items())
    head.extend([
        "",
        "## Per-company evidence",
        "",
        "| Company | Adapter | Scan state | Jobs | Descriptions | Requirements | Historical jobs (Nov 16) | Review flags |",
        "|---|---|---|---:|---:|---:|---:|---|",
    ])
    def clean(x):return str(x).replace("|","/").replace("\n"," ").strip()
    for row in report["companies"]:
        head.append("| "+" | ".join([
            clean(row["company"]),clean(row["adapter"]),clean(row["scan_status"]),
            str(row["jobs_found"]),str(row["description_present"]),
            str(row["requirements_present"]),
            str(row["historical_jobs"] if row["historical_jobs"] is not None else "—"),
            clean(", ".join(row["issues"]) or "Field audit only; total unverified"),
        ])+" |")
    head.extend([
        "",
        "## Interpretation",
        "",
        "- A historical count decrease is a review trigger, **not** evidence of missing openings.",
        "- Missing a separate requirements field does not necessarily imply no requirements: "
        "some ATS providers include them inside the full description.",
        "- For exact live coverage, compare employer API total, scope, every page and stable "
        "job IDs on the same run; verify job descriptions from each original vacancy page.",
        "- Blocked/dynamic boards remain unverified. Do not invent records or claim 100% coverage.",
    ])
    return "\n".join(head)+"\n"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--registry",default="companies.json")
    parser.add_argument("--shards",default="reports/employer-source-probes")
    parser.add_argument("--baseline",default="reports/source-audit/2026-11-16-all-58-live.json")
    parser.add_argument("--out",default="reports/employer-source-probes/combined")
    args=parser.parse_args()
    registry=json.loads(Path(args.registry).read_text(encoding="utf-8"))
    shard_paths=sorted(Path(args.shards).rglob("shard-*.json"))
    if not shard_paths:raise ValueError("No source audit shard artifacts found")
    shards=[json.loads(p.read_text(encoding="utf-8")) for p in shard_paths]
    baseline=json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    report=aggregate(registry,shards,baseline)
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    (out/"coverage.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    (out/"coverage.md").write_text(markdown(report),encoding="utf-8")
    with (out/"coverage.csv").open("w",encoding="utf-8",newline="") as fp:
        writer=csv.DictWriter(fp,fieldnames=list(report["companies"][0]),
                              extrasaction="ignore")
        writer.writeheader()
        for row in report["companies"]:
            writer.writerow({**row,"issues":";".join(row["issues"])})
    print("COVERAGE SUMMARY",json.dumps(report["summary"]),flush=True)

if __name__=="__main__":main()
