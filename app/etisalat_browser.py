"""Public legacy Taleo browser navigation. No account, application or login."""
from __future__ import annotations
import re
from datetime import datetime
from urllib.parse import quote
from bs4 import BeautifulSoup

ROOT="https://etisalatmisr.taleo.net/careersection/ex/"
NUMBER=re.compile(r"Job Number\s*:\s*([A-Z0-9]{5,16})",re.I)
DATE=re.compile(r"Job Posting\s*:\s*(\d{1,2}/[A-Za-z]{3}/\d{4})",re.I)

def parse_rendered(html):
    doc=BeautifulSoup(html,"html.parser")
    out={}
    for a in doc.select("a"):
        title=a.get_text(" ",strip=True)
        if not title or title.lower() in ("apply","add to my job cart","next","previous") or len(title)>180:continue
        attrs=" ".join(str(v) for v in a.attrs.values())
        if not re.search(r"requisition|jobdetail|Job Number",attrs,re.I):continue
        for node in [a,*list(a.parents)[:5]]:
            if node.name in ("body","html","form"):break
            markup=str(node)
            numbers=set(NUMBER.findall(markup))
            if len(numbers)!=1:continue
            number=next(iter(numbers)).upper()
            content=node.get_text(" ",strip=True)
            m=DATE.search(content)
            date=""
            if m:
                try:date=datetime.strptime(m[1],"%d/%b/%Y").date().isoformat()
                except ValueError:pass
            # Board belongs to e& Egypt. Do not invent individual city.
            # If location not displayed, leave it unknown until detail evidence.
            loc=""
            lm=re.search(r"(?:Primary Location|Work Location|Location)\s*:\s*([^|]{1,100}?)(?=\s+(?:Job Posting|Apply|Add to)|$)",content,re.I)
            if lm:loc=lm[1].strip()
            out[number]={"title":title,"number":number,"date":date,"location":loc,"url":ROOT+"jobdetail.ftl?job="+quote(number)+"&lang=en"}
            break
    return out

def collect_public_board():
    from playwright.sync_api import sync_playwright
    rows={}
    total=None
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            page=browser.new_page()
            page.goto(ROOT+"joblist.ftl",wait_until="domcontentloaded",timeout=60000)
            page.get_by_text(re.compile(r"Job Openings\s*\(")).first.wait_for(timeout=30000)
            # Use the actual public page-size control where available.
            size=page.locator('select[name="dropListSize"],select[id$="dropListSize"]')
            if size.count():
                try:
                    size.first.select_option(label="100",timeout=3000)
                    page.wait_for_timeout(1200)
                except Exception:pass
            signatures=set()
            for _ in range(80):
                body=page.locator("body").inner_text()
                match=re.search(r"Job Openings\s*\(([\d,]+)\s+jobs?\s+found\)",body,re.I)
                if not match:raise ValueError("Etisalat public result count missing")
                count=int(match[1].replace(",",""))
                if total is not None and count!=total:raise ValueError("Etisalat total changed during paging")
                total=count
                current=parse_rendered(page.content())
                signature=frozenset(current)
                if signature in signatures or (not current and count):raise ValueError("Etisalat page empty or repeated")
                signatures.add(signature)
                rows.update(current)
                if len(rows)==total:return list(rows.values()),total
                if len(rows)>total:raise ValueError("Etisalat extracted more identities than official count")
                nxt=page.locator('a[id$=".Next"]')
                if not nxt.count() or not nxt.first.is_visible():raise ValueError(f"Etisalat paging ended at {len(rows)}/{total}")
                nxt.first.click(timeout=10000)
                # Wait for a genuinely new set of job numbers, not a timer alone.
                for __ in range(25):
                    page.wait_for_timeout(400)
                    if frozenset(parse_rendered(page.content()))!=signature:break
                else:raise ValueError("Etisalat next page did not update")
            raise ValueError("Etisalat page budget exhausted")
        finally:browser.close()

def etisalat_browser_jobs(name,make_job):
    rows,total=collect_public_board()
    out=[]
    for row in rows:
        # All jobs are retained in the public catalog; only explicit geography
        # is eligible for Egypt-specific alerts.
        job=make_job(name,row["title"],row["location"],row["url"],"",row["date"],"")
        job["id"]="custom-etisalat-"+row["number"]
        job["external_id"]=row["number"]
        job["source_reported_total"]=total
        job["source_pagination_consistency"]="complete" if row["location"] else "incomplete-location"
        out.append(job)
    return out
