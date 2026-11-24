"""Consolidate live independent ATS vs adapter comparisons for all employers."""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
from datetime import datetime, timezone


def combine(companies,shards):
    names=[c["name"] for c in companies]
    if len(set(names))!=len(names):
        raise ValueError("Duplicate employer in registry")
    indexed={}
    for s in shards:
        for row in s.get("results",[]):
            name=row["name"]
            if name in indexed:raise ValueError("Duplicate employer comparison: "+name)
            if name not in names:raise ValueError("Unexpected employer: "+name)
            indexed[name]=row
    missing=set(names)-set(indexed)
    if missing:raise ValueError("Missing employer comparisons: "+", ".join(sorted(missing)))
    rows=[indexed[n] for n in names]
    summary={
        "employers":len(rows),
        "matched":sum(x["status"]=="MATCHED" for x in rows),
        "mismatch":sum(x["status"]=="MISMATCH" for x in rows),
        "unverified":sum(x["status"]=="UNVERIFIED" for x in rows),
        "matched_egypt_vacancies":sum(x.get("matched_count") or 0 for x in rows),
        "confirmed_missing_egypt_vacancies":sum(x.get("missing_count") or 0 for x in rows),
    }
    return {"generated_at":datetime.now(timezone.utc).isoformat(),
            "scope":"All job categories and levels; vacancies with Egypt among official work locations",
            "caution":"MATCHED means independent provider API URL reconciliation at scan time, "
                "not a guarantee that every career site or external hiring board was covered. "
                "UNVERIFIED employers must never be treated as complete.",
            "summary":summary,"companies":rows}


def as_markdown(result):
    parts=["# Egypt-only official job reconciliation",
        "",f"Generated at UTC: {result['generated_at']}","",
        "**This report does not claim 100% coverage for unverified companies.**","",
        "## Summary",""]
    for k,v in result["summary"].items():parts.append(f"- **{k.replace('_',' ')}**: {v}")
    parts.extend(["","## Employer comparisons","","| Employer | Provider | Outcome | Official Egypt | Job Hunter | Missing IDs | Notes |",
        "|---|---|---|---:|---:|---:|---|"])
    for r in result["companies"]:
        def clean(v):return str(v if v is not None else "—").replace("|","/").replace("\n"," ")[:160]
        parts.append("| "+" | ".join(clean(z) for z in [
            r["name"],r.get("provider","unknown"),r["status"],
            r.get("official_egypt_count"),r.get("adapter_egypt_count"),
            r.get("missing_count"),r.get("reason","")])+" |")
    parts.extend(["","## Missing official jobs by source","","Each listed missing link is an employer-posted vacancy absent from the corresponding normalized adapter response.",""])
    count=0
    for row in result["companies"]:
        if not row.get("missing_jobs"):continue
        parts.append("### "+row["name"])
        for job in row["missing_jobs"]:
            parts.append("- ["+str(job.get("title") or "Official role").replace("]","")+
                         "]("+str(job["url"])+")")
            count+=1
    if not count:parts.append("No differences established among successfully reconciled provider feeds.")
    return "\n".join(parts)+"\n"


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--registry",default="companies.json")
    p.add_argument("--shards",default="reports/live-reconciliation")
    p.add_argument("--output",default="reports/live-reconciliation/combined")
    args=p.parse_args()
    companies=json.loads(Path(args.registry).read_text(encoding="utf-8"))
    files=sorted(Path(args.shards).glob("shard-*.json"))
    if not files:raise ValueError("Missing source evidence artifacts")
    shards=[json.loads(f.read_text(encoding="utf-8")) for f in files]
    result=combine(companies,shards)
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    (out/"reconciliation.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"reconciliation.md").write_text(as_markdown(result),encoding="utf-8")
    with (out/"reconciliation.csv").open("w",newline="",encoding="utf-8") as stream:
        columns=("name","provider","status","official_egypt_count","adapter_egypt_count","missing_count","extra_count","reason")
        writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader()
        for row in result["companies"]:writer.writerow({k:row.get(k) for k in columns})
    print(json.dumps(result["summary"]),flush=True)

if __name__=="__main__":main()
