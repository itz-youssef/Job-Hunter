"""Read official public source evidence independently, without production parsers."""
import json,re,sys
from urllib.parse import urlsplit,urljoin,urlencode
from bs4 import BeautifulSoup
from app.custom_sources import _bytes,_json

name=sys.argv[1]
reg={c["name"]:c["url"] for c in json.load(open("companies.json"))}
sources={
 "Siemens":["https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt?folderRecordsPerPage=100"],
 "Deloitte":[reg["Deloitte"],"https://middleeastjobs.deloitte.com/careersME/SearchJobs/Egypt?pipelineRecordsPerPage=100"],
 "Breadfast":["https://www.breadfast.com/careers/","https://careers.4dxventures.com/companies/breadfast"],
 "Breadfast Technology":["https://www.breadfast.com/careers_categories/technology/"],
 "Fawry":["https://www.fawry.com/jobs/"],
 "Finaira":["https://finaira.ai/work-at-finaira/"],
 "Uber Egypt":["https://jobs.uber.com/en/jobs/?country=egypt&pagesize=100","https://www.uber.com/global/en/careers/list/?location=EG"],
 "inDrive":["https://careers.indrive.com/vacancies/?country=Egypt"],
 "Luciq (formerly Instabug)":["https://www.luciq.ai/careers"],
 "Konecta Egypt":["https://konecta.com/en/careers"],
 "Paymob":["https://origin.paymob.com/en/careers"],
}
PAT={
 "Siemens":r"/externaljobs/JobDetail/\d+",
 "Deloitte":r"/careersME/PipelineDetail/[^/]+/\d+",
 "Breadfast":r"/companies/breadfast/jobs/\d+-[^/]+",
 "Breadfast Technology":r"/companies/breadfast/jobs/\d+-[^/]+",
 "Fawry":r"post_type=job_listing.*[?&]p=\d+",
 "Finaira":r"/job/[^/]+",
 "Uber Egypt":r"/en/jobs/\d+",
 "inDrive":r"/en/postings/[0-9a-f-]{36}",
}
for url in sources.get(name,[]):
 try:
  html=_bytes(url).decode("utf-8","replace")
  doc=BeautifulSoup(html,"html.parser")
  body=doc.get_text(" ",strip=True)
  print("OFFICIAL_PAGE",name,url,len(html),flush=True)
  for m in list(re.finditer(r"\b(?:\d[\d,]*\s+(?:jobs?|vacancies|positions|results|openings)(?:\s+found)?|(?:jobs?|results|positions)\s+\d+\s*[-–]\s*\d+\s+of\s+\d+|showing\s+\d+\s*[-–]\s*\d+\s+of\s+\d+)\b",body,re.I))[:15]:
   print("OFFICIAL_TOTAL_HINT",name,m[0],flush=True)
  links={}
  for a in doc.select("a[href]"):
   link=urljoin(url,a["href"]).split("#",1)[0]
   title=a.get_text(" ",strip=True)
   if name in PAT and re.search(PAT[name],link,re.I):
    card=a
    for parent in list(a.parents)[:4]:
     text=parent.get_text(" ",strip=True)
     if len(text)<450 and re.search(r"\b(?:Egypt|Cairo|Giza|Alexandria)\b",text,re.I):
      card=parent;break
    links[link]={"title":title,"card":card.get_text(" ",strip=True)[:350]}
   elif re.search(r"freshteam|bamboohr|workdayjobs|recruitera|ashbyhq|jobboard|getro|career.*egypt|apply.*job",link,re.I):
    print("BOARD_LINK",name,link[:240],title[:70],flush=True)
   if "next" in (a.get("rel") or []) or re.fullmatch(r"next|next page|›|»",title,re.I):
    print("NEXT_LINK",name,link[:240],flush=True)
  print("OFFICIAL_LINK_COUNT",name,len(links),flush=True)
  print("OFFICIAL_LINKS",name,json.dumps(links,ensure_ascii=False)[:30000],flush=True)
  for pattern in (r'"total(?:Count|Jobs|Results)"\s*:\s*\d+',r'"jobCount"\s*:\s*\d+',r'"total"\s*:\s*\d+'):
   matches=re.findall(pattern,html,re.I)
   if matches:print("PAYLOAD_TOTAL",name,matches[:10],flush=True)
 except Exception as exc:print("OFFICIAL_ERROR",name,url,type(exc).__name__,str(exc)[:160],flush=True)
if name=="Luciq (formerly Instabug)":
 try:
  data=_json("https://instabug.bamboohr.com/careers/list")
  rows=data["result"]
  print("LUCIQ_OFFICIAL_TOTAL",len(rows),flush=True)
  for item in rows:
   ident=str(item["id"])
   detail=_json("https://instabug.bamboohr.com/careers/"+ident+"/detail")
   record=detail.get("result") or detail.get("jobOpening") or detail
   print("LUCIQ_ROW",ident,item.get("jobOpeningName"),json.dumps({k:v for k,v in record.items() if re.search(r"locat|country|city|title|name",k,re.I)},ensure_ascii=False)[:1500],flush=True)
 except Exception as exc:print("LUCIQ_ERROR",type(exc).__name__,str(exc)[:200],flush=True)
if name=="Konecta Egypt":
 try:
  ep="https://konectagroup.wd3.myworkdayjobs.com/wday/cxs/konectagroup/Konecta/jobs"
  for query in ("Egypt","Cairo",""):
   d=_json(ep,{"appliedFacets":{},"limit":20,"offset":0,"searchText":query})
   print("KONECTA_QUERY",repr(query),"total",d.get("total"),"facets",json.dumps(d.get("facets"),ensure_ascii=False)[:16000],flush=True)
   print("KONECTA_RESULT",query,json.dumps([{"title":r.get("title"),"location":r.get("locationsText"),"url":r.get("externalPath")} for r in d.get("jobPostings",[])],ensure_ascii=False)[:10000],flush=True)
 except Exception as exc:print("KONECTA_ERROR",type(exc).__name__,str(exc)[:200],flush=True)
