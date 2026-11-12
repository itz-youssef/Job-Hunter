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
