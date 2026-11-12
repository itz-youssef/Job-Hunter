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

def probe_endpoints():
 from app.custom_sources import _bytes,_json
 import re
 for page in (1,2):
  for mode,url in (
   ("Jibe",f"https://careers.se.com/api/jobs?location=Egypt&limit=50&page={page}"),
   ("Jibe exact",f"https://careers.se.com/api/jobs?country=Egypt&limit=30&page={page}"),
  ):
   try:
    data=_json(url)
    print("JIBE",mode,page,"type",type(data).__name__,"keys",list(data)[:18] if isinstance(data,dict) else "list",
          "sample",str(data)[:1900],flush=True)
   except Exception as exc:print("JIBE_ERROR",mode,type(exc).__name__,str(exc)[:150],flush=True)
 try:
  h=_bytes("https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl").decode("utf-8","replace")
  for term in ("rlPager.currentPage","rlPager","requisitionList","requisitionno","jobDetail","requisition-title","reqList","requisitionDescription","Integration Senior"):
   m=re.search(re.escape(term),h,re.I)
   if m:print("TALEO_HTML",term,repr(h[max(0,m.start()-220):m.start()+950]),flush=True)
  for p in re.findall(r'<tr[^>]*>.*?</tr>',h,re.I|re.S):
   if "requisition" in p.lower() or "Job Posting" in p:print("TALEO_ROW",re.sub(r"\\s+"," ",p)[:1600],flush=True);break
 except Exception as exc:print("TALEO_ERROR",type(exc).__name__,str(exc)[:130],flush=True)
if __name__=="__main__":probe_endpoints()

def candidates():
 from app.custom_sources import scan_company
 src={
  "Yassir":"https://jobs.lever.co/Yassir/",
  "Integrant":"https://apply.workable.com/integrant/",
  "PetroApp":"https://apply.workable.com/petroapp/",
  "SSC HR Solutions":"https://apply.workable.com/ssc-hr/",
  "Mondia":"https://apply.workable.com/mondia-group/",
  "mylo":"https://apply.workable.com/mylo-btech/",
  "Infomineo":"https://apply.workable.com/infomineo/",
  "ArpuPlus":"https://apply.workable.com/arpu-telecommunication-services/",
  "Madar":"https://apply.workable.com/madarplatform/",
 }
 for name,url in src.items():
  try:
   jobs,status,reason=scan_company({"name":name,"url":url})
   egypt=[j for j in jobs if __import__('re').search("egypt|cairo|giza|alexandria",j.get("location",""),__import__('re').I)]
   print("CANDIDATE",name,status,len(jobs),"egypt",len(egypt),"sample",[(x["title"],x["location"]) for x in egypt[:3]],flush=True)
  except Exception as exc:print("CANDIDATE_ERROR",name,str(exc)[:200],flush=True)
if __name__=="__main__": candidates()

def precision():
 from app.custom_sources import _bytes,_json
 import re
 for pag in (0,1,2):
  try:
   a=_json(f"https://careers.se.com/api/jobs?location=Egypt&limit=50&page={pag}")
   rows=a.get("jobs") or []
   print("JIBE_PAGE",pag,"total",a.get("totalCount"),"count",a.get("count"),"len",len(rows),flush=True)
   for itm in rows[:3]:
    d=itm.get("data") or {}
    print("JIBE_ROW","outer",list(itm)[:15],"keys",list(d)[:32],"title",d.get("title"),
      "location_fields",[(key,str(d[key])[:240]) for key in d if any(w in key.lower() for w in ("locat","city","country","publish","date","region"))],flush=True)
  except Exception as exc:print("JIBE_PAGE_ERR",pag,str(exc)[:130],flush=True)
 try:
  h=_bytes("https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl").decode("utf-8","replace")
  for needle in ("Integration Senior Developer","requisitionListInterface.ID2335","260002GT","requisitionListInterface.ID","rlPager.gotoPage"):
   hits=list(re.finditer(re.escape(needle),h,re.I))
   for m in hits[-2:]:print("TALEO_DETAIL",needle,"at",m.start(),repr(h[max(0,m.start()-330):m.start()+950]),flush=True)
 except Exception as exc:print("TALEO_DETAIL_ERR",str(exc)[:200],flush=True)
if __name__=="__main__":precision()
