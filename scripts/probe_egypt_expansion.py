"""Focused post-probe source verification."""
from app.custom_sources import _bytes,_json
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re
urls=[
 "https://careers.4dxventures.com/companies/breadfast",
 "https://careers.4dxventures.com/companies/breadfast?jobPage=2",
 "https://blink22.com/careers/software-engineering-intern/",
 "https://blink22.com/careers/qa-engineer/",
 "https://www.amazon.jobs/en/search.json?offset=0&result_limit=4&country=EGY",
]
for url in urls:
 try:
  data=_bytes(url)
  txt=data.decode("utf-8","replace")
  print("DETAIL_URL",url,len(txt),flush=True)
  if "amazon.jobs" in url:
   import json
   j=json.loads(txt)
   print("AMAZON_META",j.get("hits"),len(j.get("jobs",[])),flush=True)
   for x in j.get("jobs",[])[:3]:
    print("AMAZON_JOB",[(k,str(x.get(k))[:180]) for k in ["id","title","job_path","city","country_code","location","posted_date","updated_time","business_category","job_category","description"]],flush=True)
  elif "4dxventures" in url:
   soup=BeautifulSoup(txt,"html.parser")
   matches=[]
   for a in soup.select("a[href]"):
    href=urljoin(url,a.get("href")or"")
    if re.search(r"/companies/breadfast/jobs/[0-9]+-",href):
     parent=a
     for _ in range(4):
      if parent.parent:parent=parent.parent
     matches.append((href,a.get_text(" ",strip=True)[:90],parent.get_text(" ",strip=True)[:240]))
   print("BREADFAST_MATCHES",len(matches),matches[:15],flush=True)
   print("BREADFAST_TOTAL",re.findall(r"(?:Showing|Open jobs at Breadfast|jobs at Breadfast).{0,90}",soup.get_text(" ",strip=True),re.I)[:5],flush=True)
  else:
   soup=BeautifulSoup(txt,"html.parser")
   text=soup.get_text(" ",strip=True)
   for term in ("Remote","Egypt","Alexandria","Cairo","Location","Apply for"):
    for m in list(re.finditer(term,text,re.I))[:5]:print("BLINK_TERM",term,text[max(0,m.start()-100):m.start()+170],flush=True)
 except Exception as e:print("DETAIL_ERR",url,type(e).__name__,str(e)[:170],flush=True)
