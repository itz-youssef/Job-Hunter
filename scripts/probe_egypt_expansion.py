"""Talabat Delivery Hero and Uber official job APIs read-only verification."""
import json,re
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
URLS={
"Talabat":"https://careers.deliveryhero.com/jobs?options=845%2C243&page=1",
"Talabat Egypt":"https://careers.deliveryhero.com/jobs?options=845%2C243&page=2",
"Talabat API":"https://careers.deliveryhero.com/api/jobs?options=845%2C243&page=1",
"Talabat GH":"https://boards-api.greenhouse.io/v1/boards/talabat/jobs?content=true",
"Uber":"https://jobs.uber.com/en/",
"Uber Cairo":"https://jobs.uber.com/en/search/?location=Egypt",
"Uber API":"https://jobs.uber.com/api/en/search/?location=Egypt",
"Uber Egypt":"https://jobs.uber.com/en/search/?query=&location=Cairo",
"Uber board":"https://jobs.innovationendeavors.com/companies/uber",
}
for name,u in URLS.items():
 try:
  data=_bytes(u).decode("utf-8","replace")
  print("CHECK",name,u,len(data),flush=True)
  if data.lstrip()[:1] in ("{","["):
   obj=json.loads(data)
   print("JSON",name,str(obj)[:3500],flush=True)
  else:
   doc=BeautifulSoup(data,"html.parser")
   print("LINKS",name,[(a.get("href"),a.get_text(" ",strip=True)[:100])for a in doc.select("a[href]") if re.search(r"/job/|/jobs/|search|careers|vacanc",a.get("href",""),re.I)][:18],flush=True)
   print("MARKERS",name,[(m.group(0)[:240])for m in list(re.finditer(r'.{0,65}(?:__NEXT_DATA__|__NUXT__|jobListings|jobResults|jobId|jobs-api|workday|api/jobs|search.json|graphql).{0,100}',data,re.I))[:12]],flush=True)
 except Exception as e:print("ERROR",name,type(e).__name__,str(e)[:200],flush=True)
