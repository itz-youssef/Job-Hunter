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

def inspect_more():
 from app.custom_sources import _bytes, _PageParser, _json
 import re
 urls={
  'Luxoft Egypt30':'https://career.luxoft.com/jobs?country%5B%5D=Egypt&perPage=30',
  'Luxoft Egypt second':'https://career.luxoft.com/jobs?country%5B%5D=Egypt&page=2',
  'Luxoft Egypt page60':'https://career.luxoft.com/jobs?country%5B%5D=Egypt&perPage=60',
  'Link AJAX JS':'https://linkdevelopment.com/app/themes/linkdev/js/ajaxLoadMoreCareersAndSearch.min.js?ver=1.0.2',
 }
 for name,url in urls.items():
  try:
   page=_bytes(url).decode('utf-8','replace')
   parser=_PageParser();parser.feed(page)
   joblinks=[(h," ".join(t.split())[:80]) for h,t in parser.links if "/jobs/" in h]
   pages=[h for h,t in parser.links if 'page=' in h]
   print('MORE',name,'bytes',len(page),'jobs',len(joblinks),'job_first',joblinks[:3],'pagers',pages[-12:],'code',page[:1200] if 'JS' in name else '',flush=True)
   if 'JS' in name:
    for word in ('action','careers_listing','ajaxurl','page','posts_per_page'):
     k=re.search(word,page,re.I)
     if k: print('JS_MARK',word,repr(page[max(0,k.start()-200):k.start()+400]),flush=True)
  except Exception as e:print('MORE_ERR',name,type(e).__name__,str(e)[:100],flush=True)
if __name__=='__main__': inspect_more()

def probe_link_ajax():
 from app.custom_sources import _bytes,_safe_url
 import re,urllib.request,urllib.parse
 base="https://linkdevelopment.com/careers/opportunities/"
 page=_bytes(base).decode('utf-8','replace')
 for needle in ("careers_nonce","ajax_careers","latest_page","load_careers_listing_results"):
  for m in list(re.finditer(needle,page,re.I))[:3]:
   print("NONCE_MARK",needle,repr(page[max(0,m.start()-120):m.start()+260]),flush=True)
 nonce=re.search(r'id=["\\\']careers_nonce["\\\'][^>]*value=["\\\']([^"\\\']+)',page,re.I)
 if not nonce:
  nonce=re.search(r'name=["\\\']careers_nonce["\\\'][^>]*value=["\\\']([^"\\\']+)',page,re.I)
 n=nonce.group(1) if nonce else ''
 data=urllib.parse.urlencode({'action':'load_careers_listing_results','current_page':'1','query_data':'&careers_keywords=&position_type=&position_department=&careers_nonce='+n}).encode()
 try:
  req=urllib.request.Request(_safe_url('https://linkdevelopment.com/wp/wp-admin/admin-ajax.php'),data=data,headers={'User-Agent':'Mozilla/5.0','Content-Type':'application/x-www-form-urlencoded','Referer':base})
  with urllib.request.urlopen(req,timeout=14) as resp:
   body=resp.read(1500000).decode('utf-8','replace')
   print("AJAX_RESULT",resp.status,"bytes",len(body),"sample",body[:600],flush=True)
   parsed=_PageParser();parsed.feed(body)
   print("AJAX_LINKS",[(h," ".join(t.split())[:100]) for h,t in parsed.links[:30]],flush=True)
   for term in ("opportunities/","latest_page","careers-page","Full Time","Egypt"):
    for m in list(re.finditer(re.escape(term),body,re.I))[:2]:
     print("AJAX_MARK",term,repr(body[max(0,m.start()-80):m.start()+180]),flush=True)
 except Exception as e:print("AJAX_ERROR",type(e).__name__,str(e)[:200],flush=True)
if __name__=='__main__':probe_link_ajax()
