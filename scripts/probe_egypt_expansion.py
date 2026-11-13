"""One-time read-only diagnostics for official Egypt employer sources."""
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from html.parser import HTMLParser
import json,re
from app.custom_sources import scan_company,_bytes

URLS={
"EY-successfactors":"https://careers.ey.com/ey/search/?q=&locationsearch=Egypt",
"EY-direct":"https://careers.ey.com/ey/go/EY-Consulting/9613801/0/",
"Breadfast-careers":"https://www.breadfast.com/careers/",
"Breadfast-tech":"https://www.breadfast.com/careers_categories/technology/",
"Breadfast-json":"https://www.breadfast.com/wp-json/wp/v2/jobs?per_page=5",
"Breadfast-jobs":"https://www.breadfast.com/jobs/",
"Blink22-careers":"https://blink22.com/careers",
"Blink22-home":"https://blink22.com",
"Teleperformance":"https://tpegyptcareers.teleperformance.com.eg/vacancies",
"Amazon-Egypt":"https://www.amazon.jobs/en/search?country=EGY",
"Amazon-Jobs-Egypt":"https://www.amazon.jobs/en/location/egypt",
"Accenture-Egypt":"https://www.accenture.com/eg-en/careers/jobsearch",
"Oracle-Egypt":"https://careers.oracle.com/jobs/#en/sites/jobsearch",
}
class P(HTMLParser):
 def __init__(self):super().__init__();self.link=None;self.text=[];self.found=[]
 def handle_starttag(self,tag,attrs):
  if tag=="a":self.link=dict(attrs).get("href");self.text=[]
 def handle_data(self,d):
  if self.link is not None:self.text.append(d)
 def handle_endtag(self,tag):
  if tag=="a" and self.link is not None:
   self.found.append((self.link," ".join(" ".join(self.text).split())[:100]));self.link=None
for k,u in URLS.items():
 try:
  data=_bytes(u)
  txt=data.decode("utf-8","replace")
  p=P();p.feed(txt)
  links=[(urljoin(u,x),y) for x,y in p.found if re.search(r"job|career|position|opening|vacanc|egypt|cairo|apply",x+" "+y,re.I)]
  print("URL",k,"OK","bytes",len(data),"jobsLinks",len(links),"sample",links[:15],flush=True)
  if "breadfast" in k.lower():
   print("BREADFAST_MATCHES",k,re.findall(r'.{0,65}(?:wp-json|/jobs/[0-9]+|careers_categories|smartrecruiters|lever|workable).{0,130}',txt,re.I)[:15],flush=True)
  if k.startswith("EY"):
   print("EY_MATCHES",k,re.findall(r'.{0,40}(?:Cairo, EG|/ey/job/|pagination|SearchJobs|results-header).{0,160}',txt,re.I)[:15],flush=True)
 except Exception as e:print("URL",k,"ERROR",type(e).__name__,str(e)[:140],flush=True)
for name,url in [
 ("EY","https://careers.ey.com/ey/search/?q=&locationsearch=Egypt"),
 ("Blink22","https://blink22.com/careers"),
 ("Breadfast","https://www.breadfast.com/careers/"),
 ("Breadfast Technology","https://www.breadfast.com/careers_categories/technology/"),
 ("Teleperformance Egypt","https://tpegyptcareers.teleperformance.com.eg/vacancies")
]:
 try:
  jobs,status,msg=scan_company({"name":name,"url":url})
  print("SCAN",name,status,len(jobs),msg,[(x["title"],x["location"]) for x in jobs[:5]],flush=True)
 except Exception as e:print("SCAN",name,"EXCEPTION",type(e).__name__,str(e)[:140],flush=True)
