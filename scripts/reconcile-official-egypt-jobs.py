"""Independent live ATS-listing comparison to Job Hunter for compatible providers.

Comparison reads raw official public ATS data independently of the production
adapter, then runs the existing adapter on the same company, reporting URL/ID
differences. This is NOT a universal verifier for proprietary employer ATS.
Only explicit Egyptian vacancies count; unknown locations remain unverified.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit

from app.custom_sources import scan_company, _ats, _json

EGYPT = re.compile(
    r"\b(?:egypt|cairo|giza|alexandria|maadi|6th of october|october city|"
    r"new cairo|smart village|nasr city|tanta|mansoura|suez|port said|"
    r"sohag|assiut|aswan|minya|benha|fayoum|dakahlia|sharm el sheikh|"
    r"hurghada|qena|beheira|munufiyah|monufia|EGY)\b", re.I
)
OVERSEAS = re.compile(r"\b(?:uae|united arab emirates|dubai|abu dhabi|"
                      r"saudi arabia|riyadh|jeddah|india|germany|berlin|"
                      r"united states|united kingdom|london)\b",re.I)


def location_text(raw):
    if isinstance(raw,dict):
        return " ".join(str(raw.get(k) or "") for k in
                        ("city","region","country","location","name"))
    if isinstance(raw,list):
        return " ".join(location_text(x) for x in raw)
    return str(raw or "")


def egypt_location(location,code=""):
    code=str(code or "").upper().strip()
    if code in ("EG","EGY","EGYPT"):return True
    if code in ("AE","ARE","UAE","DE","DEU","US","USA","GB","GBR",
                "SA","SAU","IN","IND"):return False
    text=location_text(location)
    return bool(EGYPT.search(text) and not OVERSEAS.search(text))


def listing_key(url):
    p=urlsplit(str(url or ""))
    return (p.hostname or "").lower()+p.path.rstrip("/").casefold()


def raw_ats(company, fetch_json=_json):
    """Official public board listing, independently parsed; no adapter calls."""
    name=company["name"]
    kind,slug=_ats(company["url"])
    if kind=="lever":
        rows=fetch_json("https://api.lever.co/v0/postings/"+
                        quote(slug,safe="")+"?mode=json")
        if not isinstance(rows,list):raise ValueError("Lever list schema changed")
        jobs=[]
        for row in rows:
            if not isinstance(row,dict):continue
            loc=(row.get("categories") or {}).get("location")
            if not egypt_location(loc):continue
            url=row.get("hostedUrl")
            if url and row.get("text"):jobs.append({"url":url,"title":row["text"]})
        return kind,jobs,len(rows)

    if kind=="ashby":
        payload=fetch_json("https://api.ashbyhq.com/posting-api/job-board/"+
                           quote(slug,safe=""))
        if not isinstance(payload,dict) or not isinstance(payload.get("jobs"),list):
            raise ValueError("Ashby list schema changed")
        jobs=[]
        for row in payload["jobs"]:
            if not isinstance(row,dict) or not row.get("isListed",True):continue
            if not egypt_location(row.get("location")):continue
            url=row.get("jobUrl")
            if url and row.get("title"):jobs.append({"url":url,"title":row["title"]})
        return kind,jobs,len(payload["jobs"])

    if kind=="workable":
        payload=fetch_json("https://apply.workable.com/api/v1/widget/accounts/"+
                           quote(slug,safe="")+"?details=true")
        if not isinstance(payload,dict) or not isinstance(payload.get("jobs"),list):
            raise ValueError("Workable widget list schema changed")
        jobs=[]
        for row in payload["jobs"]:
            if not isinstance(row,dict) or not row.get("title"):continue
            raw_loc=row.get("location") or {"city":row.get("city"),"region":row.get("state"),"country":row.get("country")}
            if not egypt_location(raw_loc,row.get("country_code")):continue
            url=row.get("url") or row.get("job_url")
            if not url and row.get("shortcode"):
                url="https://apply.workable.com/"+slug+"/j/"+str(row["shortcode"])+"/"
            if url:jobs.append({"url":url,"title":row["title"]})
        return kind,jobs,len(payload["jobs"])

    return kind,None,None


def compare(company, reader=raw_ats, scanner=scan_company):
    row={"name":company["name"],"company_url":company["url"],
         "as_of_utc":datetime.now(timezone.utc).isoformat(),
         "official_egypt_count":None,"adapter_egypt_count":None,
         "missing_count":None,"extra_count":None,"matched_count":None,
         "missing_jobs":[],"extra_jobs":[],
         "status":"UNVERIFIED","reason":""}
    try:
        kind,official,all_count=reader(company)
        row["provider"]=kind
        if official is None:
            row["reason"]="No independent provider collector for this ATS"
            return row
        row["official_total_all_locations"]=all_count
        official_by_key={listing_key(j["url"]):j for j in official}
        if len(official_by_key)!=len(official):
            row["status"]="UNVERIFIED"
            row["reason"]="Official provider returned duplicate URLs"
            return row
        jobs,scan_status,message=scanner(company)
        row["adapter_status"]=scan_status
        if scan_status not in ("monitoring","partial"):
            row["reason"]="Adapter failed: "+str(message)[:200]
            return row
        adapter_by_key={listing_key(j["url"]):j for j in jobs
                        if j.get("url") and egypt_location(j.get("location"))}
        missing=set(official_by_key)-set(adapter_by_key)
        extra=set(adapter_by_key)-set(official_by_key)
        row.update({
            "official_egypt_count":len(official_by_key),
            "adapter_egypt_count":len(adapter_by_key),
            "missing_count":len(missing),"extra_count":len(extra),
            "matched_count":len(official_by_key.keys()&adapter_by_key.keys()),
            "missing_jobs":[official_by_key[k] for k in sorted(missing)],
            "extra_jobs":[{"title":adapter_by_key[k].get("title",""),
                           "url":adapter_by_key[k].get("url","")} for k in sorted(extra)],
            "status":"MATCHED" if not missing and not extra and
                     scan_status=="monitoring" else "MISMATCH",
            "reason":str(message)[:200],
        })
    except Exception as exc:
        row["status"]="UNVERIFIED"
        row["reason"]=type(exc).__name__+": "+str(exc)[:220]
    return row


def execute(companies,part=0,parts=6):
    rows=[compare(c) for i,c in enumerate(companies) if i%parts==part]
    result={"created_at":datetime.now(timezone.utc).isoformat(),
            "part":part,"parts":parts,"results":rows}
    for r in rows:
        print("RECONCILE",r["name"],r.get("provider","?"),r["status"],
              "official_egypt=",r["official_egypt_count"],
              "adapter_egypt=",r["adapter_egypt_count"],
              "missing=",r["missing_count"],
              "reason=",r["reason"],flush=True)
    return result


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--registry",default="companies.json")
    p.add_argument("--part",type=int,default=0)
    p.add_argument("--parts",type=int,default=6)
    p.add_argument("--output",default="reports/live-reconciliation/shard-0.json")
    a=p.parse_args()
    if not (0<=a.part<a.parts<=12):p.error("invalid shard")
    companies=json.loads(Path(a.registry).read_text(encoding="utf-8"))
    result=execute(companies,a.part,a.parts)
    path=Path(a.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
