"""Read-only employer discovery. No secrets, no modifying external sites."""
import re, json
from urllib.parse import urljoin
from app.custom_sources import _bytes, _PageParser, scan_company
SOURCES={
 "Deloitte Middle East":"https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
 "Link Development":"https://linkdevelopment.com/careers/opportunities/",
 "Luxoft Egypt":"https://career.luxoft.com/jobs",
 "Luxoft location":"https://career.luxoft.com/locations/egypt",
 "BlackStone eIT":"https://apply.workable.com/blackstone-eit-2/",
 "Lamdax":"https://apply.workable.com/lamdax/",
}
def main():
 for company,url in SOURCES.items():
  try:
   content=_bytes(url).decode('utf-8','replace')
   parser=_PageParser();parser.feed(content)
   links=[(urljoin(url,h), " ".join(t.split())[:110]) for h,t in parser.links
          if re.search('job|career|vacanc|egypt|cairo|intern|engineering|page|load',h+' '+t,re.I)]
   print('PAGE',company,'bytes',len(content),'links',len(links),'sample',links[:24],flush=True)
   for marker in ('__NEXT_DATA__','/api/','jobs-search','PipelineDetail','pagination','Load More','api/jobs','job-card','__NUXT__'):
    m=re.search(re.escape(marker),content,re.I)
    if m:print('MARKER',company,marker,repr(content[max(0,m.start()-100):m.start()+250]),flush=True)
  except Exception as e:print('ERROR',company,type(e).__name__,str(e)[:200],flush=True)
  if company in ('Deloitte Middle East','Link Development','Luxoft Egypt'):
   try:
    jobs,status,msg=scan_company({'name':company,'url':url})
    print('CURRENT',company,status,msg,len(jobs),[(x.get('title'),x.get('location')) for x in jobs[:5]],flush=True)
   except Exception as e:print('SCAN_ERROR',company,type(e).__name__,str(e)[:180],flush=True)
if __name__=='__main__':main()

def inspect_targeted():
 from app.custom_sources import _bytes,_PageParser,scan_company
 import re
 targets={
  "Luxoft Egypt Filter":"https://career.luxoft.com/jobs?keyword=&country[]=Egypt&perPage=60",
  "Luxoft Egypt Page2":"https://career.luxoft.com/jobs?keyword=&country[]=Egypt&perPage=60&page=2",
  "Deloitte Search Egypt":"https://middleeastjobs.deloitte.com/careersME/SearchJobs/?pipelineRecordsPerPage=50&pipelineOffset=0",
  "Deloitte Search Page2":"https://middleeastjobs.deloitte.com/careersME/SearchJobs/?pipelineRecordsPerPage=50&pipelineOffset=50",
  "Link Careers":"https://linkdevelopment.com/careers/opportunities/",
 }
 for name,url in targets.items():
  try:
   body=_bytes(url).decode("utf-8","replace")
   parser=_PageParser();parser.feed(body)
   relevant=[(h,t.strip()[:110]) for h,t in parser.links if "PipelineDetail/" in h or "/jobs/" in h or "/careers/opportunities/" in h and h != "https://linkdevelopment.com/careers/opportunities/"]
   print("FILTER",name,"bytes",len(body),"jobs",len(relevant),"sample",relevant[:6],flush=True)
   if name=="Link Careers":
    for term in ("careers_listing","ajaxurl","admin-ajax","load_more","loadMore","career-listing","job-listing","/wp-json","jQuery.post","jobFilter"):
     m=re.search(re.escape(term),body,re.I)
     if m:print("LINK_MARK",term,repr(body[max(m.start()-350,0):m.start()+700]),flush=True)
  except Exception as exc:print("FILTER_ERROR",name,type(exc).__name__,str(exc)[:200],flush=True)
 for company,site in [("BlackStone eIT","https://apply.workable.com/blackstone-eit-2/"),("Lamdax","https://apply.workable.com/lamdax/")]:
  try:
   jobs,status,msg=scan_company({"name":company,"url":site})
   print("ADD_SCAN",company,status,len(jobs),msg,[(j.get("title"),j.get("location")) for j in jobs[:8]],flush=True)
  except Exception as exc:print("ADD_ERROR",company,type(exc).__name__,str(exc)[:160],flush=True)
if __name__=='__main__':inspect_targeted()
