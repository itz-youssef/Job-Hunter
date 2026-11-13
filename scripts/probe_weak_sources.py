"""Read-only source diagnostics for employer jobs that return zero results.

Never changes monitoring state, alerts, or published snapshots.
"""
from __future__ import annotations

import re
from collections import Counter
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from app.custom_sources import _bytes

SOURCES = [
    ("Blink22", "https://blink22.com/careers/"),
    ("Breadfast Tech", "https://www.breadfast.com/ar/careers_categories/technology/"),
    ("SAP", "https://jobs.sap.com/en/jobs/?location=Cairo"),
]

def inspect(name, url):
    print(f"\n=== {name} {url} ===", flush=True)
    try:
        html = _bytes(url).decode("utf-8", "replace")
    except Exception as exc:
        print("FETCH ERROR", type(exc).__name__, str(exc)[:160], flush=True)
        return
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.select("a[href]"):
        href = urljoin(url, a.get("href") or "")
        p = urlsplit(href)
        if p.scheme != "https":
            continue
        title = a.get_text(" ", strip=True)
        interesting = (
            (p.hostname or "").endswith("blink22.com")
            and "/careers/" in p.path and p.path.rstrip("/") != "/careers"
        ) or re.search(r"job|careers|vacanc|intern|engineer|apply|freshteam", href, re.I)
        if interesting and len(href) < 250:
            if (href, title) not in links:
                links.append((href, title[:95]))
    scripts = [
        x.get("src", "") for x in soup.select("script[src]")
        if re.search(r"careers|job|application|wp|api", x.get("src", ""), re.I)
    ]
    print("bytes",len(html), "page title",soup.title.get_text(strip=True) if soup.title else "",
          "anchors",len(soup.select("a[href]")), "candidate links", len(links),
          "job word count",len(re.findall(r"\b(?:jobs?|intern|position|opening)\b",html,re.I)),
          "script hints",scripts[:15],flush=True)
    for href, title in links[:55]:
        print("LINK", href,repr(title),flush=True)
    for term in ("Alexandria", "Egypt", "remote", "jobLocation", "jobTitle", "experience", "api/", "recruitment", "greenhouse", "workable"):
        found = re.search(re.escape(term),html,re.I)
        if found:
            snippet = re.sub(r"\s+"," ",BeautifulSoup(html[max(0,found.start()-130):found.end()+130],"html.parser").get_text(" ",strip=True))
            print("HINT",term,repr(snippet[:190]),flush=True)
    if name == "Blink22":
        candidate = [u for u,t in links if urlsplit(u).hostname in ("blink22.com","www.blink22.com")
                     and re.fullmatch(r"/careers/[a-z0-9-]+/?",urlsplit(u).path,re.I)]
        candidate = list(dict.fromkeys(candidate))
        print("CURRENT ADAPTER LINK COUNT",len(candidate),flush=True)
        for href in candidate[:3]:
            try:
                doc=BeautifulSoup(_bytes(href).decode("utf-8","replace"),"html.parser")
                main=doc.select_one("main") or doc.select_one("article") or doc
                body=main.get_text(" ",strip=True)
                print("DETAIL",href,"title",doc.title.get_text(" ",strip=True) if doc.title else "",
                      "length",len(body),"first",body[:370],flush=True)
                for word in ("Egypt","Alexandria","Cairo","remote","years of experience"):
                    m=re.search(re.escape(word),body,re.I)
                    if m:print("DETAIL HINT",word,repr(body[max(0,m.start()-85):m.end()+85]),flush=True)
            except Exception as exc:
                print("DETAIL ERROR",type(exc).__name__,str(exc)[:180],flush=True)

def main():
    for name,url in SOURCES:
        inspect(name,url)



def deeper():
    print("\n=== EXTRA JOB METADATA ===", flush=True)
    base="https://blink22.com/careers/"
    doc=BeautifulSoup(_bytes(base).decode("utf-8","replace"),"html.parser")
    for anchor in doc.select("a[href]"):
        href=urljoin(base,anchor.get("href") or "")
        if not re.fullmatch(r"/careers/[a-z0-9-]+/?",urlsplit(href).path,re.I):
            continue
        card=anchor.parent.parent if anchor.parent else anchor
        text=card.get_text(" ",strip=True)
        print("CARD",urlsplit(href).path,repr(text[:320]),flush=True)
    for slug in ["software-engineering-intern","software-engineer","qa-engineer","uiux-design-intern"]:
        href=base+slug+"/"
        try:
            doc=BeautifulSoup(_bytes(href).decode("utf-8","replace"),"html.parser")
            main=doc.select_one("main") or doc
            plain=main.get_text(" ",strip=True)
            print("\nJOB",slug,"HEAD",repr(plain[:1100]),flush=True)
            print("JOB TAIL",repr(plain[-550:]),flush=True)
            for script in doc.select("script[type='application/ld+json']"):
                print("JOB JSON-LD",repr(script.get_text()[:650]),flush=True)
            for word in ["Egypt","Alexandria","Cairo","remote","Work From Home","location","internship","experience"]:
                for match in list(re.finditer(re.escape(word),plain,re.I))[:3]:
                    print("JOB CONTEXT",slug,word,repr(plain[max(0,match.start()-60):match.end()+100]),flush=True)
        except Exception as exc:
            print("JOB ERROR",slug,str(exc)[:90],flush=True)
    try:
        html=_bytes("https://jobs.sap.com/en/jobs/?location=Cairo").decode("utf-8","replace")
        for marker in [r'displayDate',r'locations\\',r'__NEXT_DATA__',r'__next_f.push',r'\"jobTitle\"']:
            m=re.search(marker,html)
            if m:
                print("SAP PAYLOAD",marker,repr(html[max(0,m.start()-500):m.start()+1000]),flush=True)
    except Exception as exc:
        print("SAP EXTRA ERROR",str(exc)[:160],flush=True)

if __name__ == "__main__":
    main()
    deeper()
