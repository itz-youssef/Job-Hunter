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
        tasks=[]
        def handle(request):
            p=urlsplit(request.url)
            if p.hostname=="prod-search-api.jobsyn.org" and p.path=="/api/v1/solr/search":
                params=parse_qs(p.query,keep_blank_values=True)
                requests.append({k:v[:3] for k,v in params.items()})
                print("SIEMENS_BROWSER_URL",request.url,flush=True)
                async def inspect_real_headers(req):
                    all_headers=await req.all_headers()
                    safe_names=("origin","referer","host","sec-fetch-site","sec-fetch-mode","sec-fetch-dest","accept")
                    print("SIEMENS_CHROME_WIRE_HEADERS",json.dumps({k:v for k,v in all_headers.items() if k in safe_names}),flush=True)
                    print("SIEMENS_HEADER_NAMES",sorted(all_headers.keys()),flush=True)
                tasks.append(asyncio.create_task(inspect_real_headers(request)))
                print("SIEMENS_PUBLIC_REQUEST_HEADERS",json.dumps({k:v for k,v in request.headers.items() if k.lower() in ("accept","origin","referer","user-agent")}),flush=True)
        page.on("request",handle)
        await page.goto(url,wait_until="domcontentloaded",timeout=25000)
        await page.wait_for_timeout(4800)
        if tasks:
            results=await asyncio.gather(*tasks,return_exceptions=True)
            print("SIEMENS_TASK_ERRORS",[str(x) for x in results if isinstance(x,Exception)],flush=True)
        print("SIEMENS_PUBLIC_SEARCH_QUERIES",json.dumps(requests,ensure_ascii=False),flush=True)
        from urllib.request import Request, urlopen
        from urllib.error import HTTPError
        from urllib.parse import urlencode
        endpoint="https://prod-search-api.jobsyn.org/api/v1/solr/search?"
        params={"location":"Cairo","page":"1","businessStructures":"electronic-design-automation-eda","num_items":"10"}
        for variant in ("plain","referer-only","browser-ua-referer","referer","browser-ua"):
            headers={"User-Agent":"JobHunterCareersMonitor/2.0"}
            if variant in ("referer-only","browser-ua-referer","referer","browser-ua"):
                headers["Referer"]="https://jobs.sw.siemens.com/"
                if variant in ("referer","browser-ua"):
                    headers["Origin"]="https://jobs.sw.siemens.com"
                headers["Accept"]="application/json,text/plain,*/*"
            if variant in ("browser-ua","browser-ua-referer"):
                headers["User-Agent"]="Mozilla/5.0"
            try:
                with urlopen(Request(endpoint+urlencode(params),headers=headers),timeout=15) as response:
                    b=response.read(350)
                    print("SIEMENS_HTTP_TEST",variant,response.status,b.decode(errors="replace"),flush=True)
            except HTTPError as e:
                b=e.read(400)
                print("SIEMENS_HTTP_TEST",variant,e.code,b.decode(errors="replace"),flush=True)
            except OSError as e:
                print("SIEMENS_HTTP_TEST",variant,str(e)[:180],flush=True)
        await browser.close()
if __name__=="__main__":
    asyncio.run(main())
