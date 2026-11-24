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
    if host.endswith(".taleo.net") and p.path.lower().endswith("/jobdetail.ftl"):
        from urllib.parse import parse_qs
        req=parse_qs(p.query).get("job",[""])[0]
        if req:return host+"|requisition|"+req.casefold()
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
            elif kind == "talabat_egypt" or (kind == "luxoft_egypt" and page > 1):
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
            if kind=="luxoft_egypt" and expected is None and current and len(current)<60:
                pagers=[a for a in doc.select("a[href]") if re.search(r"(?:[?&]page=|/page/)[2-9]",a.get("href",""))]
                if not pagers:return kind,list(official.values()),len(official)
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
        unknown_locations=0
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
                    slug=str(item["slug"])
                    raw_place=location_text(item.get("location"))+" "+str(item.get("country") or item.get("country_code") or "")
                    is_foreign=bool(re.search(r"\b(?:UAE|Saudi Arabia|Oman|Dubai|Riyadh|Abu Dhabi|Jordan|Pakistan)\b",raw_place,re.I))
                    is_egypt=egypt_location(raw_place,item.get("country_code")) or bool(re.search(r"(?:^|-)egypt(?:-|$)",slug,re.I))
                    if is_foreign:continue
                    if not is_egypt:
                        unknown_locations+=1
                        continue
                    link="https://app.recruitera.ai/careers/paymob/"+quote(slug,safe="%-")
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
                if kind=="paymob_recruitera" and unknown_locations:
                    raise ValueError(f"Paymob: {len(official)} confirmed Egypt postings; {unknown_locations} postings lack explicit geography; not a complete Egypt count")
                return kind,list(official.values()),total
            if not rows:raise ValueError("Official page empty before total")
        raise ValueError("Official count exceeds page budget")


    if kind=="orange_egypt":
        results={}
        total=None
        offset=0
        for page in range(30):
            body={"ddoKey":"refineSearch","jobs":True,"counts":True,"from":offset,"size":100,
                  "pageName":"Egypt results","pageType":"landingPage","rk":"l-egypt-results",
                  "sortBy":"","subsearch":"","all_fields":["phLocSlider","category","contractType","country","city","companyName","workModel","hiringType"],
                  "selected_fields":{"country":["EGYPT"],"companyName":["Orange Egypt"]},
                  "lang":"en_gb","deviceType":"desktop","country":"gb","pageId":"page549-prod","siteType":"external","refNum":"OYVOCZGB"}
            data=fetch_json("https://orange.jobs/widgets",body)["refineSearch"]
            rows=data["data"]["jobs"]
            count=int(data["totalHits"])
            if total is not None and count!=total:raise ValueError("Orange total changed")
            total=count
            if not isinstance(rows,list):raise ValueError("Orange official rows missing")
            for item in rows:
                if str(item.get("country","")).casefold() not in ("egypt","eg","egy"):continue
                ident=str(item["jobId"])
                title=str(item["title"])
                links=[str(item.get(key) or "") for key in ("applyUrl","jobUrl")]
                link=next((u for u in links if urlsplit(u).scheme=="https" and urlsplit(u).hostname in ("orange.jobs","www.careers-page.com","careers-page.com")),"")
                if not link:
                    slug=re.sub(r"[^a-zA-Z0-9]+","-",title).strip("-")
                    link="https://orange.jobs/gb/en/job/"+quote(ident,safe="-")+"/"+quote(slug,safe="-")
                results[ident]={"url":link,"title":title}
            offset+=len(rows)
            if offset>=total:return kind,list(results.values()),total
            if not rows:raise ValueError("Orange page missing")
        raise ValueError("Orange source page limit")

    if kind in ("sap_cairo","indrive_egypt","adcb_egypt","fab_minds_egypt"):
        from bs4 import BeautifulSoup
        from app.custom_sources import _bytes
        if kind=="sap_cairo":
            base="https://jobs.sap.com/en/jobs/?country=Egypt"
            pattern=r"/en/jobs/\d+/[a-z0-9-]+/?"
            host="jobs.sap.com"
        elif kind=="indrive_egypt":
            base="https://careers.indrive.com/vacancies/?country=Egypt"
            pattern=r"/en/postings/[0-9a-f-]{36}/?"
            host="indrive.pinpointhq.com"
        elif kind=="adcb_egypt":
            base="https://www.adcb.com.eg/available-careers/"
            pattern=r"/adcb_careers/[a-z0-9-]+/?"
            host="www.adcb.com.eg"
        else:
            base="https://www.fab-minds.com/careers/"
            pattern=r"/careers/[a-z0-9-]+/?"
            host="www.fab-minds.com"
        found={}
        pages=set()
        total=None
        next_url=base
        for _ in range(30):
            if next_url in pages:raise ValueError("Official pagination repeated")
            pages.add(next_url)
            doc=BeautifulSoup(_bytes(next_url),"html.parser")
            text=doc.get_text(" ",strip=True)
            count_match=re.search(r"\b([\d,]+)\s+(?:jobs|positions|vacancies)\s+found\b",text,re.I)
            if count_match:
                count=int(count_match.group(1).replace(",",""))
                if total is not None and total!=count:raise ValueError("Official total changed")
                total=count
            for a in doc.select("a[href]"):
                link=urljoin(next_url,a["href"]).split("#",1)[0].split("?",1)[0]
                p=urlsplit(link)
                if (p.hostname or "").removeprefix("www.")!=host.removeprefix("www.") or not re.fullmatch(pattern,p.path,re.I):continue
                title=a.get_text(" ",strip=True)
                if kind=="indrive_egypt":
                    if not egypt_location(title):continue
                    title=re.split(r"\s+(?:Hybrid|Remote|On-site|Onsite|Fully remote)\s+-\s+",title,maxsplit=1,flags=re.I)[0].strip()
                elif kind=="sap_cairo":
                    card=a
                    for parent in list(a.parents)[:4]:
                        label=parent.get_text(" ",strip=True)
                        if "Locations:" in label and len(label)<1000:
                            card=parent
                            break
                    if not egypt_location(card.get_text(" ",strip=True)):continue
                else:
                    detail=BeautifulSoup(_bytes(link),"html.parser")
                    h=detail.select_one("h1") or detail.select_one("h2")
                    title=h.get_text(" ",strip=True) if h else title
                    if kind=="fab_minds_egypt" and not egypt_location(detail.get_text(" ",strip=True)):
                        continue
                if not title:title=p.path.rstrip("/").rsplit("/",1)[-1].replace("-"," ")
                found[listing_key(link)]={"url":link,"title":title}
            next_links=[]
            for a in doc.select("a[href]"):
                label=a.get_text(" ",strip=True)
                href=urljoin(next_url,a["href"])
                q=urlsplit(href)
                if q.hostname!=urlsplit(base).hostname:continue
                if "next" in (a.get("rel") or []) or (re.fullmatch(r"next|next page|›|»",label,re.I) and re.search(r"(?:[?&]page=|/page/)\d+",href)):
                    if href not in pages:next_links.append(href)
            if next_links:
                next_url=next_links[0]
                continue
            if total is not None and len(found)!=total:
                raise ValueError(f"Official list returned {len(found)} unique Egypt links of {total} reported")
            if not found and total!=0:raise ValueError("No official detail links; zero not proven")
            return kind,list(found.values()),total if total is not None else len(found)
        raise ValueError("Official HTML paging limit")

    if kind=="workday":
        tenant,site,prefix=slug
        host=urlsplit(company["url"]).hostname
        endpoint=f"https://{host}/wday/cxs/{quote(tenant,safe='')}/{quote(site,safe='')}"
        seen=set()
        out={}
        total=None
        offset=0
        for page in range(100):
            payload=fetch_json(endpoint+"/jobs",{"appliedFacets":{},"limit":20,"offset":offset,"searchText":""})
            count=int(payload["total"])
            rows=payload["jobPostings"]
            if total is not None and count!=total:raise ValueError(f"Official Workday count changed from {total} to {count}")
            total=count
            if not isinstance(rows,list):raise ValueError("Workday result list missing")
            for item in rows:
                path=str(item["externalPath"])
                if path in seen:raise ValueError("Workday duplicate pagination")
                seen.add(path)
                loc=str(item.get("locationsText") or "")
                if not egypt_location(loc):
                    detail=fetch_json(endpoint+path)["jobPostingInfo"]
                    loc=" ".join([loc,str(detail.get("location") or ""),location_text(detail.get("additionalLocations"))])
                if not egypt_location(loc):continue
                url=f"https://{host}/{prefix.strip('/')}{path}" if prefix else f"https://{host}/{site}{path}"
                out[path]={"url":url,"title":item["title"]}
            offset+=len(rows)
            if offset>=total:return kind,list(out.values()),total
            if not rows:raise ValueError("Workday incomplete page")
        raise ValueError("Workday page limit")


    if kind in ("cib_egypt","etisalat_egypt"):
        import requests
        from bs4 import BeautifulSoup
        host="cibeg.taleo.net" if kind=="cib_egypt" else "etisalatmisr.taleo.net"
        section="cib_ex" if kind=="cib_egypt" else "ex"
        base=f"https://{host}/careersection/{section}/jobsearch.ftl?lang=en"
        session=requests.Session()
        session.headers.update({"User-Agent":"Mozilla/5.0","Accept":"application/json,text/html,*/*"})
        response=session.get(base,timeout=25)
        response.raise_for_status()
        html=response.text
        # Portal is the public site configuration, never guessed or sourced
        # from another employer. Log only public numeric portal evidence.
        patterns=[r'\bportal\s*[:=]\s*["\']?(\d{5,})',
                  r'\bportalId\s*[:=]\s*["\']?(\d{5,})',
                  r'["\']portal["\']\s*,\s*["\'](\d{5,})',
                  r'name=["\']portal["\'][^>]*value=["\'](\d{5,})']
        candidates=[]
        for pattern in patterns:
            candidates.extend(re.findall(pattern,html,re.I))
        candidates=list(dict.fromkeys(candidates))
        print("TALEO_PUBLIC_PORTAL",name,candidates,flush=True)
        if len(candidates)!=1:
            for m in list(re.finditer(r'\bportal(?:Id|Number)?\b',html,re.I))[:12]:
                snippet=html[max(0,m.start()-28):m.end()+60]
                safe=re.sub(r'[^A-Za-z0-9_:=,.\s"\'<>/-]',' ',snippet)
                print("TALEO_PUBLIC_HINT",name,safe[:120],flush=True)
            raise ValueError("Cannot establish unique public Taleo portal identifier")
        url=f"https://{host}/careersection/rest/jobboard/searchjobs"
        headers={"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest","Referer":base,"Origin":f"https://{host}","tz":"GMT+02:00","tzname":"Africa/Cairo"}
        out={}
        seen=set()
        total=None
        unknown=0
        for page in range(1,101):
            fields={"KEYWORD":"","JOB_TITLE":"","JOB_NUMBER":"","LOCATION":""}
            body={"multilineEnabled":False,"sortingSelection":{"sortBySelectionParam":"3","ascendingSortingOrder":"false"},
                  "fieldData":{"fields":fields,"valid":True},
                  "filterSelectionParam":{"searchFilterSelections":[{"id":k,"selectedValues":[]} for k in ("POSTING_DATE","LOCATION","JOB_FIELD","JOB_SCHEDULE","JOB_TYPE")]},
                  "advancedSearchFiltersSelectionParam":{"searchFilterSelections":[{"id":k,"selectedValues":[]} for k in ("ORGANIZATION","LOCATION","JOB_FIELD","URGENT_JOB","EMPLOYEE_STATUS")]},
                  "pageNo":page}
            response=session.post(url,params={"lang":"en","portal":candidates[0]},headers=headers,json=body,timeout=30)
            response.raise_for_status()
            payload=response.json()
            paging=payload["pagingData"]
            count=int(paging["totalCount"])
            rows=payload["requisitionList"]
            if total is not None and count!=total:raise ValueError("Taleo total changed during paging")
            total=count
            print("TALEO_PUBLIC_PAGE",name,page,"total",total,"rows",len(rows),flush=True)
            for row in rows:
                ident=str(row["jobId"])
                if ident in seen:raise ValueError("Taleo repeated a requisition while paging")
                seen.add(ident)
                cols=row["column"]
                title=str(cols[int(row["linkedColumn"])])
                loc=" ".join(str(cols[int(i)]) for i in row.get("locationsColumns",[]))
                if not egypt_location(loc):
                    if not re.search(r'\b(?:UAE|Saudi Arabia|Dubai|Jordan|United States|United Kingdom|India)\b',loc,re.I):unknown+=1
                    continue
                job_no=str(row.get("contestNo") or ident)
                link=f"https://{host}/careersection/{section}/jobdetail.ftl?job="+quote(job_no,safe="")+"&lang=en"
                out[ident]={"url":link,"title":title}
            if len(seen)>=total:
                if unknown:
                    raise ValueError(f"Taleo official total {total}; {len(out)} explicit Egypt; {unknown} unknown location")
                return kind,list(out.values()),total
            if not rows:raise ValueError("Taleo returned an empty page before total")
        raise ValueError("Taleo exceeded public pagination budget")

    if kind=="linkdevelopment":
        import requests
        from bs4 import BeautifulSoup
        from app.custom_sources import _bytes
        base="https://linkdevelopment.com/careers/opportunities/"
        doc=BeautifulSoup(_bytes(base),"html.parser")
        nonce=doc.select_one("input[name='careers_nonce'],input#careers_nonce")
        if nonce is None or not nonce.get("value"):raise ValueError("Link Development public form token not found")
        result={}
        expected=None
        for page in range(1,51):
            payload={"action":"load_careers_listing_results",
                     "query_data":"&careers_keywords=&position_type=&position_department=&careers_nonce="+nonce["value"],
                     "current_page":str(page)}
            response=requests.post("https://linkdevelopment.com/wp/wp-admin/admin-ajax.php",data=payload,
                headers={"User-Agent":"Mozilla/5.0","Referer":base},timeout=30)
            response.raise_for_status()
            markup=response.text
            pages=re.search(r'ajax_careers\.latest_page\s*=\s*(\d+)',markup)
            if not pages:raise ValueError("Link Development pagination total not present")
            count=int(pages.group(1))
            if expected is not None and count!=expected:raise ValueError("Link Development source changed")
            expected=count
            doc=BeautifulSoup(markup,"html.parser")
            for a in doc.select("a[href]"):
                link=urljoin(base,a["href"]).split("?",1)[0].split("#",1)[0]
                p=urlsplit(link)
                if p.hostname not in ("linkdevelopment.com","www.linkdevelopment.com") or not re.fullmatch(r"/careers/opportunities/[a-z0-9-]+/?",p.path,re.I):continue
                title=a.get_text(" ",strip=True)
                if not title or re.match(r"^(?:apply|view|share)",title,re.I):continue
                if not egypt_location(title+" "+p.path.replace("-"," ")):continue
                result[listing_key(link)]={"url":link,"title":title}
            if page>=expected:
                if not result:raise ValueError("No explicit Egypt vacancies on public list")
                return kind,list(result.values()),len(result)
        raise ValueError("Link Development pagination limit")

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
