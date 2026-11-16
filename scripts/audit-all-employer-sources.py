"""Audit EVERY configured employer independently against its original public careers source.

No mocks, no private member data, no posting modifications, and no email sends.
A successful HTTP request or API schema does NOT establish extraction completeness.
Source failures and partial boards remain explicitly visible.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from app.custom_sources import scan_company, _ats
from app.native_preference_sources import capabilities

DETAIL_PROOF={
    "official-jsonld-detail", "jsonld-jobposting",
    "official-page-section", "official-detail-level",
    "retained-official-detail",
}
MANDATORY_FIELDS=("title","url","company","location","description",
                  "published_at","employment","seniority","department","requirements")
SOURCE_STAGE_LABELS={
    "monitoring":"live-read-only-not-full-field-verified",
    "partial":"source-declared-partial",
    "access_blocked":"access-blocked",
    "needs_adapter":"needs-adapter",
    "error":"source-error",
    "invalid":"invalid-config",
}
SENSITIVE_QUERY_PARTS=("token","auth","key","secret","password")

def public_url(url):
    """Keep only employer-provided public location/URL, never request secrets."""
    u=urlsplit(str(url or ""))
    if u.scheme!="https" or not u.hostname or u.username or u.password:
        return ""
    if any(k in u.query.lower() for k in SENSITIVE_QUERY_PARTS):
        return u._replace(query="",fragment="").geturl()
    return u._replace(fragment="").geturl()

def summarize(company, result, scan_duration):
    name=company["name"]
    kind,_=_ats(company["url"])
    jobs,status,message=result
    counts={k:0 for k in MANDATORY_FIELDS}
    description_lengths=[]
    distinct_links=set()
    failures=[]
    samples=[]
    for j in jobs:
        for field in MANDATORY_FIELDS:
            if field=="department":
                value=j.get("department") or (j.get("source_facets") or {}).get("department")
            elif field=="published_at":
                value=j.get("published_at") or j.get("published") or j.get("date_posted")
            else:value=j.get(field)
            if str(value or "").strip():counts[field]+=1
        desc=str(j.get("description") or "")
        description_lengths.append(len(desc))
        link=public_url(j.get("url") or j.get("apply_url"))
        if not link:
            failures.append("invalid-apply-url")
        else: distinct_links.add(link)
        if len(samples)<4:
            samples.append({
                "title":str(j.get("title") or "")[:170],
                "url":link,
                "location":str(j.get("location") or "")[:110],
                "department":str(j.get("department") or
                    (j.get("source_facets") or {}).get("department") or "")[:110],
                "employment":str(j.get("employment") or "")[:65],
                "seniority":str(j.get("seniority") or "")[:65],
                "description_chars":len(desc),
                "requirements_chars":len(str(j.get("requirements") or "")),
                "source_detail_status":str(j.get("source_detail_status") or "unknown")[:60],
            })
    n=len(jobs)
    if len(distinct_links)<n and n:
        failures.append("duplicate-or-invalid-job-url")
    # "monitoring" means adapter returned rows, not that every employer
    # vacancy or full original qualification has been checked by a human.
    if status in ("error","access_blocked","needs_adapter","invalid"):
        audit_state="unverified-source-failure"
    elif status=="partial":
        audit_state="partial-coverage"
    elif n==0:
        audit_state="empty-board-unconfirmed"
    elif counts["description"]<n:
        audit_state="missing-detail-evidence"
    else:
        audit_state="parsed-unverified-completeness"
    coverage={key:{"present":val,"missing":n-val,"percentage":round(val/n*100,1) if n else None}
      for key,val in counts.items()}
    return {
       "name":name,"source_kind":kind,
       "career_url":public_url(company["url"]),
       "scan_status":status,"audit_state":audit_state,
       "scan_message":str(message or "")[:280],
       "jobs_found":n,"scan_duration_seconds":round(scan_duration,1),
       "fields":coverage,
       "description_chars_max":max(description_lengths,default=0),
       "distinct_apply_urls":len(distinct_links),
       "detail_verified_rows":sum(str(j.get("source_detail_status") or "") in DETAIL_PROOF for j in jobs),
       "issues":sorted(set(failures)),
       "sample_jobs":samples,
    }

def execute_one(c):
    started=time.monotonic()
    try:
        result=scan_company(c)
        if not isinstance(result,tuple) or len(result)!=3:
            result=([],"error","Unexpected scan result contract")
    except Exception as exc:
        result=([],"error",type(exc).__name__+": "+str(exc)[:180])
    return summarize(c,result,time.monotonic()-started)

def execute(companies,part=0,parts=1,workers=3):
    if not isinstance(companies,list):
        raise ValueError("Expected list of company records")
    validated=[x for x in companies if isinstance(x,dict) and x.get("name") and x.get("url")]
    # Every employer appears in exactly one deterministic shard.
    selected=[c for i,c in enumerate(validated) if i%parts==part]
    seen=set()
    for c in selected:
        if c["name"] in seen:raise ValueError("Duplicate configured employer: "+c["name"])
        seen.add(c["name"])
    collected={}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures={pool.submit(execute_one,c):c for c in selected}
        for f in as_completed(futures):
            r=f.result()
            collected[r["name"]]=r
            print("SOURCE",r["name"],"kind="+r["source_kind"],
              "status="+r["scan_status"],"jobs="+str(r["jobs_found"]),
              "description="+str(r["fields"]["description"]["present"]),
              "requirements="+str(r["fields"]["requirements"]["present"]),flush=True)
    results=[collected[c["name"]] for c in selected]
    return {"schema_version":1,"as_of_utc":datetime.now(timezone.utc).isoformat(),
      "registry_count":len(validated),"part":part,"parts":parts,
      "sources_checked":len(results),"results":results}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--registry",default="companies.json")
    parser.add_argument("--part",type=int,default=0)
    parser.add_argument("--parts",type=int,default=1)
    parser.add_argument("--workers",type=int,default=3)
    parser.add_argument("--output",default="reports/employer-source-probes/shard.json")
    args=parser.parse_args()
    if args.parts<1 or not 0<=args.part<args.parts or not 1<=args.workers<=8:
        parser.error("Invalid shard or workers")
    company_list=json.loads(Path(args.registry).read_text(encoding="utf-8"))
    report=execute(company_list,args.part,args.parts,args.workers)
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    summary={}
    for r in report["results"]:summary[r["audit_state"]]=summary.get(r["audit_state"],0)+1
    print("SUMMARY",json.dumps({"total":report["sources_checked"],"states":summary}),flush=True)

if __name__=="__main__":
    main()
