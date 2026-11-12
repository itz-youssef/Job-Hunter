"""Read-only diagnostics of employer career sources; no credentials or emails."""
import json
from pathlib import Path
from app.custom_sources import scan_company

TARGETS = {"Breadfast", "Breadfast Technology", "Capgemini Egypt",
           "Deloitte", "DXC Technology", "e& / Etisalat", "Chatbase"}

def main():
    companies = json.loads(Path("companies.json").read_text(encoding="utf-8"))
    for company in companies:
        if company.get("name") not in TARGETS:
            continue
        jobs, status, message = scan_company(company)
        print("SOURCE", company["name"], status, message, "count", len(jobs), flush=True)
        for job in jobs[:3]:
            print("POSTING", job.get("title"), job.get("location"), job.get("url"), flush=True)

if __name__ == "__main__":
    main()

def inspect_public_pages():
    from app.custom_sources import _bytes, _PageParser
    sources = {
      "Capgemini search": "https://careers.capgemini.com/search/?q=&locationsearch=Egypt",
      "DXC results": "https://careers.dxc.com/job-search-results/",
      "Breadfast tech": "https://www.breadfast.com/ar/careers_categories/technology/",
      "Etisalat Taleo": "https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl",
      "Deloitte": "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
    }
    for name,url in sources.items():
      try:
        body=_bytes(url).decode("utf-8","replace")
        parser=_PageParser();parser.feed(body)
        links=[(txt.strip()[:75],href[:180]) for href,txt in parser.links if any(term in (href+" "+txt).lower() for term in ("job/","jobdetail","careers/","intern","engineer","developer","job-search"))]
        print("PAGE",name,"bytes",len(body),"links",len(parser.links),"joblinks",links[:12],flush=True)
      except Exception as exc:
        print("PAGE_ERROR",name,type(exc).__name__,str(exc)[:160],flush=True)

if __name__ == "__main__":
    inspect_public_pages()

def inspect_pagination():
    from app.custom_sources import _bytes, _PageParser
    import re
    urls = {
      "capgemini page 2": "https://careers.capgemini.com/search/?q=&locationsearch=Egypt&startrow=25",
      "dxc filtered": "https://careers.dxc.com/job-search-results/?country=Egypt",
    }
    for name,url in urls.items():
      try:
        body=_bytes(url).decode("utf-8","replace")
        parser=_PageParser();parser.feed(body)
        links=[href for href,txt in parser.links if re.search(r"/job/(?:Cairo|Giza|Alexandria|\d)",href,re.I)]
        candidates=re.findall(r'https?[^"\s<>]{0,150}/job/[^"\s<>]{3,120}',body,re.I)[:5]
        print("PAGED",name,"bytes",len(body),"links",len(links),"first",links[:5],"inline",candidates[:3],flush=True)
      except Exception as exc:print("PAGED_ERROR",name,type(exc).__name__,str(exc)[:130],flush=True)

if __name__ == "__main__":
    inspect_pagination()
