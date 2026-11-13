"""Targeted Egypt employer source structure probing, read-only."""
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import json,re
URLS={
"PwC":"https://careers.pwc.com/search/?q=&locationsearch=Egypt",
"PwC cairo":"https://careers.pwc.com/search/?q=&locationsearch=Cairo",
"Systems":"https://www.systemsltd.com/careers/",
"Finaira":"https://finaira.ai/work-at-finaira/",
"Octane":"https://www.octane-tech.io/",
"blnk":"https://blnk.zenats.com/en/careers_page",
"Henkel":"https://www.henkel.com/careers/find-your-job-apply",
"Coca HBC":"https://careers.coca-colahellenic.com/en_US/careers/SearchJobs/?1293=%5B7423%5D&1293_format=2880&493=%5B7466%5D&493_format=2198&listFilterMode=1&projectRecordsPerPage=10",
"Breadfast 4DX":"https://careers.4dxventures.com/jobs",
"TP Egypt":"https://tpegyptcareers.teleperformance.com.eg/vacancies",
}
for name,u in URLS.items():
 try:
  html=_bytes(u).decode("utf-8","replace")
  soup=BeautifulSoup(html,"html.parser")
  links=[(urljoin(u,a.get("href","")),a.get_text(" ",strip=True)[:100]) for a in soup.select("a[href]")
       if re.search(r"/job/|/jobs/|/ProjectDetail/|career|vacanc|/positions/|/details/",a.get("href","")+" "+a.get_text(" ",strip=True),re.I)]
  print("PROBE",name,len(html),"LINKS",links[:17],flush=True)
  if name in ("PwC","Coca HBC","blnk","Finaira","Systems","Henkel"):
   print("STRUCT",name,[(x,len(soup.select(x))) for x in ['tr','a.jobTitle-link','a.jobTitle','[class*=job]','[class*=Job]','iframe','script[src]']],flush=True)
   print("MARK",name,re.findall(r'.{0,75}(?:api/|[a-z]+_api|jobTitle-link|Job offers:|job-count|jobportal|requisition|open positions|vacancies|workday|successfactors).{0,180}',html,re.I)[:13],flush=True)
  if name=="Breadfast 4DX":
   j=json.loads(soup.select_one("script#__NEXT_DATA__").text)
   pg=j.get("props",{}).get("pageProps",{})
   print("GETRO_KEYS",list(pg.keys()),flush=True)
   print("GETRO_LIST_KEYS",[(k,type(v).__name__,len(v) if isinstance(v,(list,dict)) else str(v)[:50])for k,v in pg.items() if re.search('job|page|filter|search',k,re.I)],flush=True)
   print("GETRO_JOB",str(pg.get('jobs',None))[:1200],flush=True)
 except Exception as exc:
  print("PROBE_ERROR",name,type(exc).__name__,str(exc)[:160],flush=True)
