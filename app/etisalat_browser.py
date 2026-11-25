"""Read public legacy Taleo detail pages using the employer's own pager."""
from __future__ import annotations
import re
from urllib.parse import quote

ROOT="https://etisalatmisr.taleo.net/careersection/ex/"
POSITION=re.compile(r"\bJob\s+(\d+)\s+out of\s+([\d,]+)\b",re.I)
HEADING=re.compile(r"^Job Description\s*[-–]\s*(.+?)\s*\(([A-Z0-9]{5,16})\)\s*$",re.I|re.M)
COUNTRY=re.compile(r"\b(?:Egypt|Cairo|Giza|Alexandria|Egyptian|EGY)\b",re.I)

def parse_detail(body):
    pager=POSITION.search(body)
    head=HEADING.search(body)
    if not pager or not head:raise ValueError("Etisalat public detail identity missing")
    index,total=int(pager[1]),int(pager[2].replace(",",""))
    title,number=head[1].strip(),head[2].upper()
    loc=""
    # Legacy Taleo exposes labelled fields after the job description.
    for m in re.finditer(r"(?im)^\s*(?:Primary Location|Other Locations?|Job Location|Work Location)\s*:?\s*(?:\n\s*)?([^\n]{1,150})",body):
        place=m[1].strip()
        if COUNTRY.search(place):
            loc=place
            break
    date=""
    m=re.search(r"(?im)^\s*(?:Job Posting|Posting Date)\s*:?\s*(?:\n\s*)?(\d{1,2}/[A-Za-z]{3}/\d{4})",body)
    if m:
        from datetime import datetime
        try:date=datetime.strptime(m[1],"%d/%b/%Y").date().isoformat()
        except ValueError:pass
    description=body[head.end():]
    end=re.search(r"(?im)^\s*(?:Apply|Add to My Job Cart|Back to prior page)\s*$",description)
    if end:description=description[:end.start()]
    return {"index":index,"total":total,"title":title,"number":number,
            "location":loc,"date":date,"description":description.strip()[:18000],
            "url":ROOT+"jobdetail.ftl?job="+quote(number,safe="")+"&lang=en"}

def collect_public_board():
    from playwright.sync_api import sync_playwright
    rows={}
    total=None
    with sync_playwright() as p:
        # Suppress decorative image downloads using Chromium's native
        # setting. Keep its normal HTTP cache enabled; do not intercept
        # requests or disable scripts, stylesheets, pagination or job text.
        browser=p.chromium.launch(headless=True,args=["--blink-settings=imagesEnabled=false"])
        try:
            page=browser.new_page()
            page.goto(ROOT+"joblist.ftl",wait_until="domcontentloaded",timeout=60000)
            page.locator('a[id*="reqTitleLinkAction"]').first.click(timeout=30000)
            page.get_by_text(re.compile(r"Job\s+1\s+out of\s+\d+")).first.wait_for(timeout=30000)
            for expected in range(1,601):
                row=parse_detail(page.locator("body").inner_text())
                if total is None:total=row["total"]
                if row["total"]!=total or row["index"]!=expected:
                    raise ValueError("Etisalat public detail pager changed or skipped a record")
                if row["number"] in rows:raise ValueError("Etisalat repeated job number")
                rows[row["number"]]=row
                if expected==total:return list(rows.values()),total
                nxt=page.get_by_text("Next",exact=True)
                if not nxt.count():raise ValueError("Etisalat detail pager ended prematurely")
                nxt.last.click(timeout=10000)
                # Wait on the employer's displayed index, not arbitrary sleep.
                page.get_by_text(re.compile(r"\bJob\s+"+str(expected+1)+r"\s+out of\s+\d+\b")).first.wait_for(timeout=15000)
            raise ValueError("Etisalat detail page budget exhausted")
        finally:browser.close()

def etisalat_browser_jobs(name,make_job):
    rows,total=collect_public_board()
    out=[]
    for row in rows:
        job=make_job(name,row["title"],row["location"],row["url"],row["description"],row["date"],"")
        job["id"]="custom-etisalat-"+row["number"]
        job["external_id"]=row["number"]
        job["source_reported_total"]=total
        job["source_pagination_consistency"]="complete" if row["location"] else "incomplete-location"
        out.append(job)
    return out
