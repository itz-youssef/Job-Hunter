"""Fast read-only Siemens Software ATS probe (bounded to public API pages)."""
from app.custom_sources import _json, _bytes, _job
from app.egypt_public_feeds import siemens_software
from app.filters import relevance

def main():
 jobs=siemens_software("Siemens",_json,_job,None)
 print("ATS_TOTAL",len(jobs),flush=True)
 for j in jobs:
  if j.get("external_id")=="527985" or "Software Development Engineer" in j.get("title",""):
   print("ATS_MATCH",j.get("external_id"),j.get("title"),j.get("url"),j.get("location"),j.get("seniority"),relevance(j,{})[0],flush=True)
   try:
    html=_bytes(j["url"]).decode("utf-8","replace")
    import re
    for marker in ("Experience level","Early Professional","Job Posting Date","527985"):
     match=re.search(marker,html,re.I)
     if match:print("ATS_DETAIL",marker,repr(html[max(0,match.start()-160):match.start()+200]),flush=True)
   except Exception as exc:print("ATS_ERROR",type(exc).__name__,str(exc)[:120],flush=True)


def direct_avature():
 import requests
 from bs4 import BeautifulSoup
 url="https://jobs.siemens.com/en_US/externaljobs/JobDetail/527985"
 try:
  response=requests.get(url,timeout=12,headers={"User-Agent":"Mozilla/5.0"})
  print("DIRECT",response.status_code,response.url,len(response.content),flush=True)
  soup=BeautifulSoup(response.text,"html.parser")
  print("DIRECT_TITLE",soup.title.get_text(" ",strip=True) if soup.title else None,flush=True)
  print("DIRECT_FIELDS",[(x.get_text(" ",strip=True)[:170]) for x in soup.select(".article__content__view__field")][:18],flush=True)
 except Exception as exc:print("DIRECT_ERROR",type(exc).__name__,str(exc)[:180],flush=True)
def first_avature_page():
 import requests,re
 from bs4 import BeautifulSoup
 url="https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt?folderRecordsPerPage=100"
 try:
  r=requests.get(url,timeout=14,headers={"User-Agent":"Mozilla/5.0"})
  print("FIRST_PAGE",r.status_code,r.url,len(r.content),flush=True)
  soup=BeautifulSoup(r.text,"html.parser")
  anchors=[(a.get_text(" ",strip=True)[:65],a.get("href")) for a in soup.select('a[href]') if re.search(r'/JobDetail/\d+',a.get("href",""))]
  print("FIRST_LINKS",len(anchors),"MATCH527985",any("527985" in str(x) for x in anchors),"SAMPLE",anchors[:15],flush=True)
  print("FIRST_NEXT",[(a.get_text(" ",strip=True),a.get("href")) for a in soup.select('a[href]') if a.get_text(" ",strip=True).lower().startswith("next")][:3],flush=True)
 except Exception as e:print("FIRST_PAGE_ERROR",type(e).__name__,str(e)[:150],flush=True)
if __name__=="__main__":
 direct_avature()
 first_avature_page()
 main()

