"""Additional bounded structure diagnostics for official job result pages."""
import json
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

from bs4 import BeautifulSoup
from app import custom_sources as cs

SITES={
    "Siemens legacy":"https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt",
    "Siemens SW":"https://jobs.sw.siemens.com/locations/egy/business-structure/electronic-design-automation-eda/remotehybridonsite/hybrid/jobs/",
    "Deloitte":"https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
    "Fawry":"https://www.fawry.com/jobs/",
    "LinkDev":"https://linkdevelopment.com/careers/opportunities/",
    "Orange jobs":"https://orange.jobs/gb/en/egypt-results",
    "Orange IT":"https://orange.jobs/gb/en/egypt-network-search-results",
    "Telecom jobs":"https://te.eg/about-te/careers-and-training/jobs",
    "Breadfast technology":"https://www.breadfast.com/careers_categories/technology/",
    "Breadfast job sample":"https://www.breadfast.com/en/jobs/6000161774/",
    "Paymob legacy":"https://origin.paymob.com/en/careers.html",
}
PHRASES=["Software Engineer","Senior Software Engineer","Junior","JobDetail","Job Opening","REQ ID","Req ID","SearchJobs","jobsList","JobListing","Load More"]
def local_link(url):
    p=urllib.parse.urlsplit(url)
    return (p.hostname or "")+(p.path[:110] or "/")

def check(name,url):
    try:
        raw=cs._bytes(url).decode("utf-8","replace")
        soup=BeautifulSoup(raw,"html.parser")
        candidates=[]
        for a in soup.select("a[href]"):
            href=urllib.parse.urljoin(url,str(a.get("href")))
            title=" ".join(a.get_text(" ",strip=True).split())[:85]
            if re.search(r"jobdetail|/job/|/jobs/|/opening/|/career|/opportunit",href,re.I) and (
                re.search(r"software|engineer|developer|intern|analyst|graduate|jobdetail",title,re.I)
                or re.search(r"JobDetail|/jobs/\\d|/job/\\d",href,re.I)
            ):
                candidates.append({"title":title,"link":local_link(href),"classes":a.get("class",[])[:3]})
        around={}
        for phrase in PHRASES:
            pos=raw.lower().find(phrase.lower())
            if pos>=0:
                snippet=re.sub(r"<[^>]+>"," ",raw[max(0,pos-120):pos+210])
                around[phrase]=" ".join(snippet.split())[:170]
        attrs={}
        for tag in soup.find_all(True):
            cl=" ".join(tag.get("class", []))
            if re.search(r"(job-card|job-item|job-title|position-card|job_list|job-item)",cl,re.I):
                text=" ".join(tag.get_text(" ",strip=True).split())
                if re.search(r"software|engineer|intern|analyst|job",text,re.I) and len(text)<1200:
                    attrs.setdefault(cl[:100],text[:125])
                if len(attrs)>6:break
        return {"name":name,"bytes":len(raw),"candidate_links":candidates[:7],
                "job_classes":attrs,"context":around,
                "jobposting_blocks":len(soup.select('script[type="application/ld+json"]'))}
    except Exception as exc:
        return {"name":name,"error":str(exc)[:150]}

def main():
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs=[pool.submit(check,n,u) for n,u in SITES.items()]
        for j in as_completed(jobs):
            print(json.dumps(j.result(),ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
