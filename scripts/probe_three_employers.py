"""One-off, read-only diagnostics: official careers pages and public fetch requests."""
from playwright.sync_api import sync_playwright
from urllib.parse import urlsplit

SITES = {
 "VOIS":"https://jobs.vodafone.com/careers?location=Egypt&filter_brand=vois",
 "Ericsson":"https://jobs.ericsson.com/careers?location=egypt",
 "Fawry":"https://www.fawry.com/careers/",
}
def main():
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=["--disable-dev-shm-usage"])
  for name,url in SITES.items():
   page=browser.new_page()
   seen=set()
   def track(response):
    addr=response.url
    if not response.ok or len(seen)>35:return
    if any(t in addr.lower() for t in ("api/", "/positions", "/search", "career", "jobs", "joblist", ".json")):
     key=(response.request.method,urlsplit(addr).hostname,urlsplit(addr).path)
     if key in seen:return
     seen.add(key)
     print("REQUEST",name,response.status,response.request.method,addr[:480],"body",str(response.request.post_data)[:200],flush=True)
     if any(host in addr for host in ("eightfold.ai","vodafone.com/careers","ericsson.com/careers","fawry.com/")):
      try:
       data=response.json()
       print("RESPONSE",name,addr[:150],"type",type(data).__name__,"keys",list(data)[:18] if isinstance(data,dict) else "list","head",str(data)[:1200],flush=True)
      except Exception: pass
   page.on("response",track)
   try:
    res=page.goto(url,wait_until="domcontentloaded",timeout=25000)
    page.wait_for_timeout(2200)
    anchors=page.locator('a[href]').evaluate_all("""els=>els.filter(a=>/job|apply|career|position|intern|software|graduate/i.test(a.href+' '+a.innerText)).map(a=>[a.innerText.trim().slice(0,65),a.href]).slice(0,22)""")
    print("PAGE",name,res.status if res else None,page.url,"TITLE",page.title(),"LINKS",anchors,flush=True)
   except Exception as exc: print("PAGE_ERROR",name,type(exc).__name__,str(exc)[:250],flush=True)
   page.close()
  browser.close()
if __name__=="__main__":main()

def server_probes():
 from app.custom_sources import _bytes,_PageParser
 import re
 urls={
 "VOIS-0":"https://jobs.vodafone.com/careers?location=Egypt&filter_brand=vois&start=0",
 "VOIS-10":"https://jobs.vodafone.com/careers?location=Egypt&filter_brand=vois&start=10",
 "Ericsson-0":"https://jobs.ericsson.com/careers?location=egypt&start=0",
 "Ericsson-10":"https://jobs.ericsson.com/careers?location=egypt&start=10",
 "Fawry-jobs":"https://www.fawry.com/jobs/",
 "Fawry-feed":"https://www.fawry.com/?feed=job_feed&posts_per_page=50",
 "Fawry-rss":"https://www.fawry.com/?post_type=job_listing&feed=rss2",
 }
 for name,url in urls.items():
  try:
   doc=_bytes(url).decode("utf-8","replace")
   parser=_PageParser();parser.feed(doc)
   matches=[(h,t[:130]) for h,t in parser.links if
            re.search(r'/careers/job/[0-9]+|/job/|job_listing',h,re.I)]
   print("HTTP_PROBE",name,"bytes",len(doc),"links",len(matches),"first",matches[:5],"xml",doc[:90],flush=True)
  except Exception as exc:print("HTTP_ERROR",name,type(exc).__name__,str(exc)[:200],flush=True)
if __name__=="__main__": server_probes()
