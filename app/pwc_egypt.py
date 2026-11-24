"""Union PwC Egypt's official regional and global career boards."""
from concurrent.futures import ThreadPoolExecutor
import re

HOST="https://pwc.wd3.myworkdayjobs.com"
SITES=("Global_Experienced_Careers","Global_Campus_Careers")
EGYPT=re.compile(r"\b(?:egypt|cairo|giza|alexandria|maadi|smart village|6th of october|EGY)\b",re.I)

def places(value):
    if isinstance(value,dict):
        return " ".join(places(value.get(k)) for k in ("descriptor","name","city","country","location","address"))
    if isinstance(value,list):return "; ".join(places(x) for x in value)
    return str(value or "")

def egypt_facet(facets):
    # Use the site's own opaque filter IDs; never hardcode a tenant facet ID.
    for key in ("locationCountry","locations","location"):
        for facet in facets:
            if facet.get("facetParameter")!=key:continue
            vals=[v for v in facet.get("values",[]) if EGYPT.search(places(v.get("descriptor"))) and v.get("id")]
            if vals:return {key:[v["id"] for v in vals]}
    raise ValueError("PwC public Egypt location facet missing")

def workday_egypt(name,site,get_json,make_job,max_pages=100):
    endpoint=HOST+"/wday/cxs/pwc/"+site
    def query(offset,facets):
        return get_json(endpoint+"/jobs",{"appliedFacets":facets,"limit":20,"offset":offset,"searchText":""})
    initial=query(0,{})
    if not isinstance(initial.get("facets"),list):raise ValueError("PwC Workday facets missing")
    selected=egypt_facet(initial["facets"])
    seen={}
    total=None
    offset=0
    for _ in range(max_pages):
        payload=query(offset,selected)
        count=int(payload["total"])
        rows=payload["jobPostings"]
        if count<0 or not isinstance(rows,list):raise ValueError("Invalid PwC Workday page")
        if total is not None and count!=total:raise ValueError("PwC filtered total changed")
        total=count
        for row in rows:
            path=str(row.get("externalPath") or "")
            if not path.startswith("/job/") or path in seen:raise ValueError("PwC missing/repeated job path")
            seen[path]=row
        offset+=len(rows)
        if offset==total:break
        if not rows or offset>total:raise ValueError("PwC incomplete filtered page")
    else:raise ValueError("PwC Egypt paging limit exceeded")
    def enrich(pair):
        path,row=pair
        title=str(row.get("title") or "").strip()
        if not title:raise ValueError("PwC vacancy title missing")
        loc=places(row.get("locationsText")).strip()
        detail={}
        try:
            detail=get_json(endpoint+path).get("jobPostingInfo") or {}
        except (OSError,ValueError,TypeError,KeyError):
            pass
        detail_loc="; ".join(filter(None,[places(detail.get("location")).strip(),places(detail.get("additionalLocations")).strip()]))
        # Country/office-filtered results are Egyptian even for a summary with
        # "Multiple locations". Retain explicit details whenever available.
        evidence="; ".join(dict.fromkeys(x for x in (loc,detail_loc) if x and EGYPT.search(x)))
        if not evidence:
            evidence="Egypt"
        elif not re.search(r"\bEgypt\b",evidence,re.I):
            evidence+=", Egypt"
        req=str(detail.get("jobReqId") or "").strip()
        if not req:
            m=re.search(r"_([0-9]+WD)(?:/)?$",path,re.I)
            req=m[1] if m else ""
        if not req:raise ValueError("PwC requisition identity missing")
        link=HOST+"/"+site+path
        job=make_job(name,title,evidence,link,detail.get("jobDescription") or "",detail.get("startDate") or row.get("postedOn") or "",detail.get("timeType") or "")
        job.update(external_id=req.upper(),source_detail_status="workday-official-detail" if detail.get("jobDescription") else "workday-summary",pwc_board=site,pwc_division="ETIC" if re.search(r"\bETIC\b|Egypt Technology and Innovation Centre",title+" "+evidence,re.I) else "PwC")
        return job
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs=list(pool.map(enrich,seen.items()))
    if len({j["external_id"] for j in jobs})!=total:raise ValueError("PwC board duplicate requisition IDs")
    return jobs

def pwc_egypt(name,get_bytes,get_json,make_job):
    from app.egypt_expansion_feeds import successfactors_egypt
    # Keep existing regional source and its stable URLs. A failed source
    # prevents publishing a misleading truncated company catalog.
    regional=successfactors_egypt(name,get_bytes,make_job,"https://careers.pwc.com/search/?q=&locationsearch=Egypt")
    merged={}
    for site in SITES:
        for job in workday_egypt(name,site,get_json,make_job):
            key=job["external_id"]
            if key not in merged or len(job.get("description",""))>len(merged[key].get("description","")):
                merged[key]=job
    # Separate ATS IDs are not assumed equivalent based solely on a title.
    # If the regional posting explicitly embeds the Workday requisition ID,
    # use it as the cross-board identity; otherwise preserve both postings.
    for job in regional:
        try:
            html=get_bytes(job["url"]).decode("utf-8","replace")
            ids=set(re.findall(r'(?:wdjobreqid=|_)([0-9]+WD)\b',html,re.I))
            ids={x.upper() for x in ids}
        except (OSError,ValueError,TypeError):
            ids=set()
        if len(ids)==1 and next(iter(ids)) in merged:continue
        job["pwc_board"]="regional"
        job["pwc_division"]="PwC"
        merged["regional:"+job["url"]]=job
    return list(merged.values())
