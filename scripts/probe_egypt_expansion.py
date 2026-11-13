"""Read-only focused Henkel Coca-Cola HBC, Breadfast job feed probes."""
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import json,re
URLS=[
"https://www.henkel.jobs/",
"https://www.henkel.jobs/search/?q=&locationsearch=Egypt",
"https://www.henkel.com/careers/find-your-job-apply",
"https://www.henkel.com/careers/find-your-job-apply/2182732-2182732",
"https://eg.coca-colahellenic.com/en/working-with-us",
"https://www.coca-colahellenic.com/en/careers",
"https://careers.coca-colacompany.com/",
"https://careers.4dxventures.com/jobs",
"https://careers.4dxventures.com/companies/breadfast"
]
for u in URLS:
 try:
  html=_bytes(u).decode("utf-8","replace")
  d=BeautifulSoup(html,"html.parser")
  links=[(urljoin(u,a.get("href","")),a.get_text(" ",strip=True)[:75])
        for a in d.select("a[href]") if re.search(r"job|vacanc|career|work|apply|search",a.get("href","")+" "+a.get_text(" ",strip=True),re.I)]
  print("FETCH",u,len(html),"LINKS",links[:33],flush=True)
  for label,regex in [
    ("HENKEL_JOB",r'.{0,100}(?:henkel.jobs|henkel.com/careers/find-your-job-apply/|graphql|algolia|jobOffers|jobList|searchResult).{0,150}'),
    ("COCA_SOURCE",r'.{0,90}(?:successfactors|oraclecloud|workday|apply|jobSearch|searchjobs|vacancies|careers.coca-colahellenic).{0,150}'),
    ("BREAD_NEXT",r'.{0,60}(?:__NEXT_DATA__|Breadfast|jobs).{0,100}'),
   ]:
   matches=re.findall(regex,html,re.I)
   print("MATCH",label,u,matches[:12],flush=True)
  if "4dxventures.com" in u:
   node=d.find("script",id="__NEXT_DATA__")
   if node:
    j=json.loads(node.get_text())
    print("NEXT_KEYS",u,list(j.keys()),str(j.get("props",{}))[:2800],flush=True)
 except Exception as e:print("ERROR",u,type(e).__name__,str(e)[:170],flush=True)
