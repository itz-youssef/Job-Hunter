"""Read-only public careers reconnaissance. Never prints secrets or full query strings."""
import json
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser

from app import custom_sources as sources

TARGETS = {
    "Siemens": "https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo",
    "Siemens legacy": "https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt",
    "Orange Egypt": "https://orange.jobs/gb/en/africa-middle-east/egypt",
    "e& group": "https://www.eand.com/en/careers/careers.html",
    "e& Egypt portal": "https://careers.etisalat.eg/",
    "Telecom Egypt": "https://te.eg/en/web/guest/about-te/careers-and-training",
    "Paymob": "https://origin.paymob.com/en/careers",
    "Paymob new": "https://www.paymobsolutions.com/en/careers",
    "Breadfast": "https://www.breadfast.com/careers/",
    "Breadfast technology": "https://www.breadfast.com/ar/careers_categories/technology/",
    "Fawry": "https://www.fawry.com/jobs/",
    "Link Development": "https://linkdevelopment.com/careers/opportunities/",
    "Deloitte": "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
}

class Hints(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]
        self.scripts=[]
        self._href = None
        self._text=[]

    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag == "a":
            self._href=a.get("href")
            self._text=[]
        if tag in ("script","iframe") and (a.get("src") or ""):
            self.scripts.append(a["src"])

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag=="a" and self._href is not None:
            self.links.append((self._href," ".join(self._text).strip()))
            self._href=None

def safe_summary(url):
    p=urllib.parse.urlsplit(url)
    return (p.hostname or "")+(p.path[:100] or "/")

def check(name,url):
    try:
        html=sources._bytes(url).decode("utf-8","replace")
        p=Hints()
        p.feed(html)
        links=[]
        for href,title in p.links:
            target=urllib.parse.urljoin(url,href)
            if urllib.parse.urlsplit(target).scheme!="https":
                continue
            s=(title+" "+target).lower()
            if any(key in s for key in (
                "career", "job", "position", "vacanc", "apply",
                "workday", "oraclecloud", "greenhouse", "ashby", "lever",
                "recruitee", "bamboohr", "smartrecruiters", "workable"
            )):
                links.append((safe_summary(target),title[:45]))
        candidates=re.findall(
            r'https?://[A-Za-z0-9.-]+/(?:[^"\'\s<>\\]{0,100})',
            html
        )
        ats=sorted(set(
            safe_summary(x) for x in candidates
            if sources._ats(x)[0]!="html"
        ))[:8]
        return {
            "name":name,"bytes":len(html),
            "job_word":html.lower().count("job"),
            "loading":bool(re.search(r"Loading\\.\\.\\.|id=[\"']__next|__NEXT_DATA__",html)),
            "anchors":links[:10],
            "scripts":[safe_summary(urllib.parse.urljoin(url,x)) for x in p.scripts[:8]
                       if urllib.parse.urlsplit(urllib.parse.urljoin(url,x)).scheme=="https"],
            "recognized_ats":ats,
        }
    except Exception as exc:
        return {"name":name,"error":str(exc)[:150]}

def main():
    with ThreadPoolExecutor(max_workers=4) as executor:
        jobs=[executor.submit(check,name,url) for name,url in TARGETS.items()]
        for job in as_completed(jobs):
            print(json.dumps(job.result(),ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
