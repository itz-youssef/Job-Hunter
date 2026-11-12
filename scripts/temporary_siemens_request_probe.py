"""One-shot browser request probe: only public query keys, no cookies or credentials."""
import asyncio
import json
from urllib.parse import urlsplit, parse_qs
from playwright.async_api import async_playwright

async def main():
    url="https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo"
    async with async_playwright() as pw:
        browser=await pw.chromium.launch()
        page=await browser.new_page()
        requests=[]
        def handle(request):
            p=urlsplit(request.url)
            if p.hostname=="prod-search-api.jobsyn.org" and p.path=="/api/v1/solr/search":
                params=parse_qs(p.query,keep_blank_values=True)
                requests.append({k:v[:3] for k,v in params.items()})
        page.on("request",handle)
        await page.goto(url,wait_until="domcontentloaded",timeout=25000)
        await page.wait_for_timeout(4800)
        print("SIEMENS_PUBLIC_SEARCH_QUERIES",json.dumps(requests,ensure_ascii=False),flush=True)
        await browser.close()
if __name__=="__main__":
    asyncio.run(main())
