"""Read-only inspection of Breadfast-specific investor career board and pagination."""
from __future__ import annotations
import re
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from app.custom_sources import _bytes

URLS = (
    "https://careers.4dxventures.com/companies/breadfast",
    "https://careers.4dxventures.com/companies/breadfast?page=2",
    "https://careers.4dxventures.com/jobs",
    "https://careers.4dxventures.com/jobs?q=Software",
    "https://careers.4dxventures.com/jobs?q=Engineer",
    "https://careers.4dxventures.com/jobs?q=Technology",
    "https://careers.4dxventures.com/jobs?q=Intern",
    "https://careers.4dxventures.com/jobs?page=2",
    "https://www.breadfast.com/ar/careers_categories/technology/",
)

for url in URLS:
    print("\nSOURCE", url, flush=True)
    try:
        html = _bytes(url).decode("utf-8", "replace")
    except Exception as exc:
        print("FAIL", type(exc).__name__, str(exc)[:175], flush=True)
        continue
    soup=BeautifulSoup(html, "html.parser")
    links={}
    embedded=soup.select_one("script#__NEXT_DATA__")
    print("NEXT DATA length",len(embedded.get_text()) if embedded else 0, flush=True)
    for probe in ("information-technology-help-desk","98855989","breadfast/jobs/","jobsByCompany","openJobs","hasNextPage"):
        match=re.search(re.escape(probe),html,re.I)
        if match:
            print("EMBEDDED HINT",probe,repr(html[max(0,match.start()-110):match.start()+220][:320]),flush=True)
    for a in soup.select("a[href]"):
        href=urljoin(url,a.get("href") or "").split("#")[0]
        p=urlsplit(href)
        if p.hostname != "careers.4dxventures.com":
            continue
        if re.fullmatch(r"/companies/breadfast/jobs/\d+-[a-z0-9-]+/?",p.path,re.I):
            links[href]=a.get_text(" ",strip=True)
    print("PAGE",len(html),"anchors",len(soup.select("a[href]")),
          "breadfast_links",len(links),
          "job words", len(re.findall(r'\b(?:software|technology|data|engineer|devops)\b',html,re.I)),
          "page title",soup.title.get_text(" ",strip=True) if soup.title else "",
          flush=True)
    for link,title in list(links.items())[:35]:
        print("ROLE",link,repr(title[:120]),flush=True)
    for a in soup.select("a[href]"):
        href=urljoin(url,a.get("href") or "")
        if re.search(r'page=|cursor|next|view-all|q=|seniority|job-function',href,re.I) and len(href)<230:
            print("PAGINATION",href[:225],repr(a.get_text(" ",strip=True)[:60]),flush=True)
    for term in ("totalJobs","pageCount","NextPage","pageInfo","jobCount","open jobs","Showing","openingsList"):
        m=re.search(term,html,re.I)
        if m:
            print("HINT",term,repr(BeautifulSoup(html[max(0,m.start()-100):m.start()+140],"html.parser").get_text(" ",strip=True)[:180]),flush=True)
