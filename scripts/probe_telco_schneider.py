"""Temporary read-only diagnostics for employer-hosted public career feeds."""
import re
from urllib.parse import urljoin
from app.custom_sources import _bytes, _PageParser, scan_company
PAGES={
"Schneider":"https://careers.se.com/Defaultlandingpage/jobs/categories?lang=en-US",
"Schneider job":"https://careers.se.com/jobs/140047?lang=en-US",
"Etisalat":"https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl",
"Etisalat search":"https://etisalatmisr.taleo.net/careersection/ex/moresearch.ftl",
"robusta":"https://www.robustagroup.com/careers",
"inDrive":"https://careers.indrive.com/vacancies/?country=Egypt",
}
DIRECT={
"incorta":"https://jobs.lever.co/incorta",
"soum":"https://jobs.lever.co/soum",
"econstruct":"https://jobs.lever.co/econstruct",
"robusta-workable":"https://apply.workable.com/robusta/",
"robusta-rtg":"https://apply.workable.com/rtg/",
}
def main():
 for name,url in PAGES.items():
  try:
   doc=_bytes(url).decode("utf-8","replace")
   parser=_PageParser();parser.feed(doc)
   matches=[(urljoin(url,h)," ".join(t.split())[:110]) for h,t in parser.links if re.search(r"job|career|position|apply|egypt|engineer|page|next|backend|software|api",h+" "+t,re.I)]
   print("PAGE",name,len(doc),"match",len(matches),"sample",matches[:14],flush=True)
   for term in ("__NEXT_DATA__","__NUXT__","_next/data","joblist.ajax","search.ajax","jobId","api/jobs","jobs/search","api/v1","positionId","jobPosting"):
    match=re.search(re.escape(term),doc,re.I)
    if match:print("MARK",name,term,repr(doc[max(0,match.start()-100):match.start()+240]),flush=True)
  except Exception as exc:print("PAGE_ERROR",name,type(exc).__name__,str(exc)[:180],flush=True)
 for name,url in DIRECT.items():
  try:
   jobs,status,msg=scan_company({"name":name,"url":url})
   print("FEED",name,status,len(jobs),msg,[(x.get("title"),x.get("location")) for x in jobs[:5]],flush=True)
  except Exception as exc:print("FEED_ERROR",name,type(exc).__name__,str(exc)[:160],flush=True)
if __name__=="__main__":main()

def inspect_internal():
 from app.custom_sources import _bytes
 import re
 urls={
  "Schneider jobs":"https://careers.se.com/jobs?location=Egypt",
  "Schneider Cairo":"https://careers.se.com/jobs?location=Cairo",
  "Etisalat Taleo":"https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl",
 }
 for name,url in urls.items():
  try:
   doc=_bytes(url).decode('utf-8','replace')
   print("STRUCT",name,"length",len(doc),flush=True)
   for marker in ("/api/","/api/v1","api.se.com","positions","jobList","jobResults","jobsearch","data-job","\"jobs\"","jobItems","JobPosting","jobId","totalCount","totalResults","eg","Egypt","/jobdetail.ftl","joblist.ajax"):
    for m in list(re.finditer(re.escape(marker),doc,re.I))[:2]:
     print("FIELD",name,marker,repr(doc[max(0,m.start()-140):m.start()+450]),flush=True)
  except Exception as exc: print("STRUCT_ERROR",name,type(exc).__name__,str(exc)[:120],flush=True)
if __name__=="__main__":inspect_internal()
