"""Bank and global engineering employers: real Egypt job-source probes."""
from app.custom_sources import _bytes,scan_company
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re
URLS={
"CIB Taleo":"https://cibeg.taleo.net/careersection/cib_ex/moresearch.ftl",
"HSBC":"https://mycareer.hsbc.com/en_GB/external/SearchJobs/?3_56_3=Egypt",
"HSBC search":"https://mycareer.hsbc.com/en_GB/external/SearchJobs/",
"Banque Misr":"https://banquemisr.com/careers",
"Banque du Caire":"https://www.bdc.com.eg/bdcwebsite/careers.html",
"QNB Egypt":"https://www.qnb.com.eg/sites/qnb/qnbegypt/page/en/encareers.html",
"NBE":"https://www.nbe.com.eg/NBE/E/#/EN/Careers",
"FAB Egypt":"https://careers.bankfab.com/",
"ADIB Egypt":"https://www.adib.eg/careers",
"Konecta":"https://konecta.com/join-us",
"Globant":"https://career.globant.com/",
"System Limited SAP":"https://career55.sapsf.eu/career?company=systemvent&career_ns=job_listing_summary&navBarLevel=JOB_SEARCH",
"PwC":"https://careers.pwc.com/search/?q=&locationsearch=Egypt",
"Henkel":"https://www.henkel.com/careers/find-your-job-apply",
"Octane":"https://www.octane-tech.io/",
"blnk":"https://blnk.zenats.com/en/careers_page",
}
for name,url in URLS.items():
 try:
  data=_bytes(url).decode("utf8","replace")
  soup=BeautifulSoup(data,"html.parser")
  anchors=[]
  for a in soup.select("a[href]"):
   h=urljoin(url,a.get("href")or"")
   if re.search(r"/job/|jobid|JobDetail|vacanc|career|SearchJobs|taleo|apply|/jobs/",h,re.I):
    anchors.append((h,a.get_text(" ",strip=True)[:75]))
  print("BANK",name,"bytes",len(data),"links",len(anchors),"sample",anchors[:10],flush=True)
  if name in ("CIB Taleo","HSBC","PwC","System Limited SAP"):
   print("BANK_MARK",name,[(key,len(re.findall(key,data,re.I)))for key in ['requisitionListInterface','Job Number','jobTitle-link','Jobs - Page','ProjectDetail','Jobs Found','country']],flush=True)
 except Exception as exc:
  print("BANK_ERROR",name,type(exc).__name__,str(exc)[:140],flush=True)
for n,u in [
 ("Globant","https://career.globant.com/"),
 ("Konecta","https://konecta.com/join-us"),
 ("Finaira","https://finaira.ai/work-at-finaira/"),
 ("PwC","https://careers.pwc.com/search/?q=&locationsearch=Egypt")
]:
 try:
  jobs,status,msg=scan_company({"name":n,"url":u})
  print("SCAN",n,status,len(jobs),msg,[(x.get("title"),x.get("location"))for x in jobs[:3]],flush=True)
 except Exception as e:print("SCAN_ERROR",n,str(e)[:160],flush=True)
