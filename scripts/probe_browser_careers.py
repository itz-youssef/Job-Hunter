"""One-off Playwright diagnostics for JS-rendered public career pages.

No authentication, stealth, anti-bot bypass, write actions, or scraping private content.
Outputs only page title, job anchors and response URL paths (no query strings).
"""
from __future__ import annotations
import asyncio
import json
import re
from urllib.parse import urlsplit

from playwright.async_api import async_playwright

SITES = {
    "Siemens Software": "https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo",
    "Orange Egypt": "https://orange.jobs/gb/en/egypt-results",
    "Orange IT": "https://orange.jobs/gb/en/egypt-network-search-results",
    "Telecom Egypt": "https://te.eg/about-te/careers-and-training/jobs",
    "Paymob": "https://origin.paymob.com/en/careers",
    "Breadfast": "https://www.breadfast.com/careers_categories/technology/",
    "Link Development": "https://linkdevelopment.com/careers/opportunities/",
    "Deloitte": "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
}
WORDS = re.compile(r"engineer|developer|intern|graduate|software|machine learning|data|job|career|vacanc|opening|position", re.I)

def short_url(url):
    parsed=urlsplit(url)
    return (parsed.hostname or "")+(parsed.path[:140] or "/")

async def probe(browser, lock, name, url):
    async with lock:
        context=await browser.new_context(ignore_https_errors=False, java_script_enabled=True)
        page=await context.new_page()
        endpoints=[]
        def on_response(response):
            try:
                parsed=urlsplit(response.url)
                if parsed.scheme!="https":
                    return
                ctype=(response.headers.get("content-type") or "").lower()
                if "json" in ctype or re.search(r"search|job|requisition|position|graphql",parsed.path,re.I):
                    endpoint=short_url(response.url)
                    if endpoint not in endpoints and len(endpoints)<25:
                        endpoints.append(endpoint)
            except Exception:
                pass
        page.on("response",on_response)
        result={"company":name}
        try:
            response=await page.goto(url,wait_until="domcontentloaded",timeout=22000)
            await page.wait_for_timeout(4500)
            result["status"]=response.status if response else None
            result["title"]=(await page.title())[:90]
            result["visible_text"]=(await page.locator("body").inner_text(timeout=3000))[:300].replace("\n"," ")
            anchors=await page.locator("a[href]").evaluate_all("""nodes=>nodes.map(n=>({title:(n.innerText||'').trim().replace(/\\s+/g,' ').slice(0,90),href:n.href||''})).filter(x=>x.href&&x.title).slice(0,600)""")
            result["jobs"]=[
                {"text":a["title"],"path":short_url(a["href"])}
                for a in anchors
                if WORDS.search(a["title"])
                and (len(a["title"])>9 or "jobdetail" in a["href"].lower())
            ][:20]
            result["anchor_count"]=len(anchors)
            result["api_paths"]=endpoints
        except Exception as e:
            result["error"]=str(e).splitlines()[0][:200]
        finally:
            await context.close()
        print(json.dumps(result,ensure_ascii=False),flush=True)

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        try:
            lock=asyncio.Semaphore(2)
            await asyncio.gather(*(probe(browser,lock,name,url) for name,url in SITES.items()))
        finally:
            await browser.close()

if __name__=="__main__":
    asyncio.run(main())
