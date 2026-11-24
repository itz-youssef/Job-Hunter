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
    host=(p.hostname or "").lower()
    if host in ("careers.ibm.com","www.ibm.com"):
        from urllib.parse import parse_qs
        req=parse_qs(p.query).get("jobId",[""])[0]
        if req:return "ibm-requisition:"+req.casefold()
    return host+p.path.rstrip("/").casefold()


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


    if kind in ("ey_egypt", "pwc_egypt", "talabat_egypt", "tp_egypt", "luxoft_egypt"):
        from bs4 import BeautifulSoup
        from app.custom_sources import _bytes
        from urllib.parse import parse_qsl
        official = {}
        expected = None
        seen = set()
        if kind == "ey_egypt":
            base = "https://careers.ey.com/ey/search/?q=&locationsearch=Egypt"
        elif kind == "pwc_egypt":
            base = "https://careers.pwc.com/search/?q=&locationsearch=Egypt"
        elif kind == "talabat_egypt":
            base = "https://careers.deliveryhero.com/jobs?options=252%2C845"
        elif kind == "luxoft_egypt":
            base = "https://career.luxoft.com/jobs?country%5B%5D=Egypt&perPage=60"
        else:
            base = "https://tpegyptcareers.teleperformance.com.eg/vacancies"
        for page in range(1, 51):
            url = base
            if kind in ("ey_egypt", "pwc_egypt"):
                url += "&startrow=" + str((page-1)*20)
            elif kind in ("talabat_egypt", "luxoft_egypt"):
                url += "&page=" + str(page)
            elif page > 1:
                url += "?page=" + str(page)
            doc = BeautifulSoup(_bytes(url), "html.parser")
            body = doc.get_text(" ", strip=True)
            if kind in ("ey_egypt", "pwc_egypt"):
                total_match = re.search(r"Results\s+\d+\s*[-–]\s*\d+\s+of\s+([\d,]+)", body, re.I)
                containers = doc.select("tr")
                pattern = r"/(?:[a-z]{2}/)?job/[^/]+/\d+/?"
            elif kind == "talabat_egypt":
                total_match = re.search(r"\b([\d,]+)\s+result\(s\)",body,re.I)
                containers = doc.select("[data-jobid]")
                pattern = r"/job/[a-z0-9-]+-jid-\d+/?"
            elif kind == "luxoft_egypt":
                total_match = re.search(r"\b([\d,]+)\s+(?:open\s+)?(?:jobs|vacancies|positions)\s+found\b",body,re.I)
                containers = doc.select("a[href]")
                pattern = r"/jobs/[a-z0-9-]+-\d+/?"
            else:
                total_match = re.search(r"\bTotal\s*:?\s*([\d,]+)",body,re.I)
                containers = doc.select("a[href]")
                pattern = r"/vacancies/[a-z0-9-]+/?"
            if total_match:
                total = int(total_match.group(1).replace(",",""))
                if expected is not None and total != expected:
                    raise ValueError("Official result count changed during paging")
                expected = total
            current = {}
            for card in containers:
                anchors = [card] if card.name == "a" else card.select("a[href]")
                for a in anchors:
                    link = urljoin(url,a.get("href") or "")
                    p = urlsplit(link)
                    if p.hostname != urlsplit(base).hostname or not re.fullmatch(pattern,p.path,re.I):
                        continue
                    title = a.get_text(" ",strip=True)
                    location = card.get_text(" ",strip=True)
                    if kind in ("ey_egypt","pwc_egypt"):
                        location = " ".join(td.get_text(" ",strip=True) for td in card.select("td") if a not in td.descendants)
                    if kind != "tp_egypt" and not egypt_location(location):
                        continue
                    if kind == "talabat_egypt" and not re.search(r"\btalabat\b",location,re.I):
                        continue
                    if not title:
                        title = p.path.rstrip("/").rsplit("/",1)[-1].replace("-"," ")
                    current[listing_key(link)] = {"url":link,"title":title}
            signature = frozenset(current)
            if signature in seen and signature:
                raise ValueError("Official pagination repeated")
            seen.add(signature)
            official.update(current)
            if expected is not None and len(official) == expected:
                return kind,list(official.values()),expected
            if expected is not None and len(official)>expected:
                raise ValueError("More unique official links than reported total")
            if not current:
                raise ValueError("Official page empty before a verified total")
        raise ValueError("Official count could not be reconciled within pagination budget")


    if kind in ("capgemini_egypt","dxc_egypt","paymob_recruitera","telecom_egypt","ibm_egypt"):
        from app.custom_sources import _bytes
        from urllib.parse import parse_qs
        official={}
        total=None
        read=0
        cursor=None
        cursors=set()
        for page in range(1,31):
            if kind=="capgemini_egypt":
                payload=fetch_json("https://cg-jobstream-api.azurewebsites.net/api/job-search?"+urlencode({"page":page,"size":100,"country_code":"eg-en"}))
                rows=payload["data"]
                count=int(payload["total"])
            elif kind=="dxc_egypt":
                params=[("callback","CWS.jobs.jobCallback"),("facet[]","is_internal:DXCJobs"),("facet[]","primary_country:EG"),("sortfield","open_date"),("sortorder","descending"),("Limit","100"),("Organization","2492"),("offset",str(read+1)),("fuzzy","false")]
                raw=_bytes("https://jobsapi-internal.m-cloud.io/api/job?"+urlencode(params)).decode().strip().rstrip(" ;")
                if not raw.startswith("CWS.jobs.jobCallback(") or not raw.endswith(")"):
                    raise ValueError("DXC source JSONP envelope missing")
                payload=json.loads(raw[len("CWS.jobs.jobCallback("):-1])
                rows=payload["queryResult"]
                count=int(payload["totalHits"])
            elif kind=="paymob_recruitera":
                payload=fetch_json("https://app.recruitera.ai/api/public/v1/paymob/opportunities"+("?cursor="+quote(cursor,safe="") if cursor else ""))
                rows=payload["data"]
                count=int(payload["meta"]["found"])
            elif kind=="telecom_egypt":
                payload=fetch_json("https://te.eg/o/c/vacancies/?"+urlencode({"page":page,"pageSize":100}))
                rows=payload["items"]
                count=int(payload["totalCount"])
            else:
                payload=fetch_json("https://www-api.ibm.com/search/api/v2",{"appId":"careers","scopes":["careers2"],"query":{"bool":{"must":[{"term":{"field_keyword_05":"Egypt"}}]}},"from":read,"size":100,"sort":[{"_score":"desc"},{"pageviews":"desc"}],"lang":"zz","localeSelector":{},"sm":{"query":"","lang":"zz"},"_source":["title","url","field_keyword_05","field_keyword_19"]})
                rows=[x["_source"] for x in payload["hits"]["hits"]]
                count=int(payload["hits"]["total"]["value"])
            if not isinstance(rows,list) or count<0:
                raise ValueError("Invalid official page envelope")
            if total is not None and total!=count:
                raise ValueError("Official count changed during scan")
            total=count
            read+=len(rows)
            for item in rows:
                title=str(item.get("title") or item.get("titleEnglish") or item.get("titleArabic") or "").strip()
                if not title:
                    raise ValueError("Source listing has no title")
                if kind=="capgemini_egypt":
                    if str(item.get("country_code","")).lower() not in ("eg","eg-en","en-eg"):continue
                    link=str(item["apply_job_url"]).split("?",1)[0]
                elif kind=="dxc_egypt":
                    if item.get("primary_country")!="EG":continue
                    link=str(item["url"]).split("?",1)[0]
                elif kind=="paymob_recruitera":
                    if not egypt_location(item.get("location")):continue
                    link="https://app.recruitera.ai/careers/paymob/"+quote(str(item["slug"]),safe="%-")
                elif kind=="telecom_egypt":
                    state=item.get("status")
                    if isinstance(state,dict):state=state.get("label") or state.get("name")
                    if str(state or "").lower() in ("expired","closed","draft","archived","inactive"):continue
                    expiry=str(item.get("expiryDate") or "")[:10]
                    if expiry and expiry<datetime.now(timezone.utc).date().isoformat():continue
                    if not egypt_location(item.get("locationEnglish") or item.get("locationArabic")):continue
                    raise ValueError("Active WE listing has no unique public job-detail URL; identity reconciliation needed")
                else:
                    if not egypt_location(item.get("field_keyword_19"),item.get("field_keyword_05")):continue
                    link=str(item["url"])
                if urlsplit(link).scheme!="https" or not urlsplit(link).hostname:
                    raise ValueError("Official posting URL invalid")
                key=listing_key(link)
                if kind=="ibm_egypt":
                    req=parse_qs(urlsplit(link).query).get("jobId",[""])[0]
                    if not req and key.endswith("jobdetail"):raise ValueError("IBM requisition identity missing")
                official[key]={"url":link,"title":title}
            if kind=="paymob_recruitera":
                cursor=payload["meta"].get("next_cursor")
                if cursor:
                    if cursor in cursors:raise ValueError("Repeated official cursor")
                    cursors.add(cursor)
                    continue
            if read>=total:
                return kind,list(official.values()),total
            if not rows:raise ValueError("Official page empty before total")
        raise ValueError("Official count exceeds page budget")

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
