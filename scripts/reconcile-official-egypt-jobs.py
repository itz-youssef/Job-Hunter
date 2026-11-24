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
from urllib.parse import quote, urlencode, urljoin, urlsplit

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
    # A single requisition may explicitly include Egypt alongside UAE or
    # another country: it remains an Egyptian vacancy in the official board.
    # Explicit foreign country codes above are still rejected.
    return bool(EGYPT.search(text))


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

    if kind in ("vois_egypt","ericsson_egypt"):
        host="jobs.vodafone.com" if kind=="vois_egypt" else "jobs.ericsson.com"
        domain="vodafone.com" if kind=="vois_egypt" else "ericsson.com"
        official={}
        total=None
        for page in range(50):
            params={"domain":domain,"query":"","location":"Egypt",
                    "start":page*10,"num":10}
            if kind=="vois_egypt":params["filter_brand"]="vois"
            data=fetch_json("https://"+host+"/api/pcsx/search?"+urlencode(params))
            section=data.get("data") if isinstance(data,dict) else None
            if not isinstance(section,dict) or not isinstance(section.get("positions"),list):
                raise ValueError("Eightfold official listing schema changed")
            count=int(section["count"])
            if total is None:total=count
            elif total!=count:raise ValueError("Eightfold total changed during comparison")
            rows=section["positions"]
            if not rows and page*10<total:raise ValueError("Eightfold incomplete page")
            for item in rows:
                if not isinstance(item,dict):continue
                loc=item.get("locations") or item.get("standardizedLocations") or item.get("location")
                if not egypt_location(loc):continue
                link=urljoin("https://"+host+"/",str(item.get("positionUrl") or
                    item.get("canonicalPositionUrl") or ""))
                if urlsplit(link).hostname!=host or not re.fullmatch(
                        r"/careers/job/\d+/?",urlsplit(link).path):continue
                if item.get("name") or item.get("title"):
                    official[listing_key(link)]={"url":link,"title":item.get("name") or item.get("title")}
            if (page+1)*10>=total:return kind,list(official.values()),total
        raise ValueError("Eightfold official total exceeds page budget")

    if kind=="amazon_egypt":
        official={}
        total=None
        for page in range(20):
            payload=fetch_json("https://www.amazon.jobs/en/search.json?"+urlencode({
                "offset":page*100,"result_limit":100,"country":"EGY"}))
            if not isinstance(payload,dict) or not isinstance(payload.get("jobs"),list):
                raise ValueError("Amazon official jobs JSON changed")
            count=int(payload["hits"])
            if total is None:total=count
            elif count!=total:raise ValueError("Amazon total changed")
            rows=payload["jobs"]
            if not rows and page*100<count:raise ValueError("Amazon empty page")
            for item in rows:
                if not isinstance(item,dict) or str(item.get("country_code") or "").upper()!="EGY":
                    continue
                path=str(item.get("job_path") or "")
                if not re.fullmatch(r"/en/jobs/\d+/[a-z0-9-]+/?",path,re.I):
                    continue
                team=" ".join(str(item.get(key) or "") for key in
                    ("business_category","business_category_list","team",
                     "normalized_business_category","job_category"))
                if name=="AWS Egypt" and not re.search(r"\b(?:aws|amazon web services)\b",team,re.I):
                    continue
                link="https://www.amazon.jobs"+path
                official[listing_key(link)]={"url":link,"title":str(item.get("title") or "")}
            if (page+1)*100>=count:return kind,list(official.values()),total
        raise ValueError("Amazon official count exceeds page budget")

    if kind=="schneider_egypt":
        official={}
        total=None
        for page in range(1,31):
            url="https://careers.se.com/api/jobs?"+urlencode(
                {"location":"Egypt","limit":50,"page":page})
            payload=fetch_json(url)
            if not isinstance(payload,dict) or not isinstance(payload.get("jobs"),list):
                raise ValueError("Schneider official Jibe schema changed")
            count=int(payload["totalCount"])
            if total is None:total=count
            elif total!=count:raise ValueError("Schneider total changed")
            rows=payload["jobs"]
            if not rows and (page-1)*50<count:raise ValueError("Schneider empty page")
            for record in rows:
                item=record.get("data") if isinstance(record,dict) else None
                if not isinstance(item,dict) or str(item.get("country_code") or "").upper()!="EG":
                    continue
                identity=str(item.get("req_id") or item.get("slug") or "")
                if not identity.isdecimal() or not item.get("title"):continue
                link="https://careers.se.com/jobs/"+identity+"?lang=en-US"
                official[listing_key(link)]={"url":link,"title":item["title"]}
            if page*50>=count:return kind,list(official.values()),total
        raise ValueError("Schneider official count exceeds page budget")

    if kind=="itworx":
        official={}
        total=None
        url="https://careers.itworx.com/ServerApp/api/Requisition/GetAllRequisitions"
        for page in range(30):
            payload=fetch_json(url,{"StartIndex":page*50+1,"PageSize":50,
                "SortBy":1,"IsTokenPresent":False})
            if not isinstance(payload,dict) or not payload.get("success"):
                raise ValueError("ITWorx official source unavailable")
            rows=payload.get("AllRequisitions")
            if not isinstance(rows,list):raise ValueError("ITWorx missing listings")
            count=int(payload["TotalCount"])
            if total is None:total=count
            elif count!=total:raise ValueError("ITWorx official count changed")
            if not rows and page*50<count:raise ValueError("ITWorx empty page")
            for item in rows:
                if not isinstance(item,dict) or not egypt_location(item.get("Location")):
                    continue
                ident=str(item.get("ReqId") or "")
                if not ident.isdecimal() or not item.get("Position"):continue
                link="https://careers.itworx.com/job-details/"+ident
                official[listing_key(link)]={"url":link,"title":item["Position"]}
            if (page+1)*50>=count:return kind,list(official.values()),total
        raise ValueError("ITWorx official count exceeds page budget")

    if kind=="oracle":
        p=urlsplit(company["url"])
        match=re.search(r"/hcmUI/CandidateExperience/([^/]+)/sites/([A-Za-z0-9_-]+)",p.path)
        if not match:raise ValueError("Unsupported Oracle careers URL")
        lang,site=match.groups()
        root="https://"+p.hostname+"/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
        official={}
        total=None
        for page in range(30):
            params=urlencode({"onlyData":"true","expand":"requisitionList.secondaryLocations",
                "finder":f"findReqs;siteNumber={site},limit=100,offset={page*100},sortBy=POSTING_DATES_DESC"})
            payload=fetch_json(root+"?"+params)
            parts=payload.get("items") if isinstance(payload,dict) else None
            if not isinstance(parts,list) or not parts:raise ValueError("Oracle official envelope missing")
            info=parts[0]
            if not isinstance(info,dict) or not isinstance(info.get("requisitionList"),list):
                raise ValueError("Oracle official requisition list missing")
            count=int(info["TotalJobsCount"])
            if total is None:total=count
            elif count!=total:raise ValueError("Oracle total changed")
            rows=info["requisitionList"]
            if not rows and page*100<count:raise ValueError("Oracle incomplete page")
            for item in rows:
                if not isinstance(item,dict):continue
                country=item.get("PrimaryLocationCountry")
                location=item.get("PrimaryLocation")
                if not egypt_location(location,country):continue
                ident=str(item.get("Id") or "").strip()
                if not ident or not item.get("Title"):continue
                link=f"https://{p.hostname}/hcmUI/CandidateExperience/{lang}/sites/{site}/job/{quote(ident,safe='')}"
                official[listing_key(link)]={"url":link,"title":item["Title"]}
            if (page+1)*100>=count:return kind,list(official.values()),total
        raise ValueError("Oracle official count exceeds page budget")

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
        row["official_duplicate_rows"]=len(official)-len(official_by_key)
        # Some Workable boards publish the same requisition once per city.
        # Compare stable unique job URLs, never count a duplicate city as a
        # missing role or silently throw away the entire reconciliation.
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
            "reason":str(message)[:200]+(
                "; "+str(row["official_duplicate_rows"])+
                " repeated official location rows"
                if row["official_duplicate_rows"] else ""),
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
        if r["status"]=="MISMATCH":
            print("MISSING_OFFICIAL",r["name"],json.dumps(r["missing_jobs"],ensure_ascii=False),flush=True)
            print("EXTRA_ADAPTER",r["name"],json.dumps(r["extra_jobs"],ensure_ascii=False),flush=True)
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
