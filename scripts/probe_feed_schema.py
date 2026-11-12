"""One-off schema inspector for official public job feeds; only structural keys logged."""
import asyncio
import json
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

SITES={
    "Siemens Software":"https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo",
    "Orange Egypt":"https://orange.jobs/gb/en/egypt-results",
    "Telecom Egypt":"https://te.eg/about-te/careers-and-training/jobs",
    "Breadfast":"https://www.breadfast.com/careers_categories/technology/",
    "Link Development":"https://linkdevelopment.com/careers/opportunities/",
}
TARGET_HOSTS=("jobsyn.org","phenompeople.com","te.eg","breadfast.com","linkdevelopment.com")
TARGET_PATHS=("solr","search","vacanc","freshteams","wp-json","ajax","jobs","requisition","position")

def shape(node,depth=0):
    if depth>2:return type(node).__name__
    if isinstance(node,dict):
        return {k:shape(v,depth+1) for k,v in list(node.items())[:28]}
    if isinstance(node,list):
        return {"length":len(node),"item":shape(node[0],depth+1) if node else None}
    return type(node).__name__

async def check(browser,name,url):
    context=await browser.new_context(ignore_https_errors=False)
    page=await context.new_page()
    recorded=set()
    pending=[]
    def inspect_response(response):
        p=urlsplit(response.url)
        if p.scheme!="https" or not any(p.hostname==h or (p.hostname or "").endswith("."+h) for h in TARGET_HOSTS):
            return
        if not any(k in p.path.lower() for k in TARGET_PATHS):
            return
        key=(p.hostname,p.path,response.request.method)
        if key in recorded or len(recorded)>16:return
        recorded.add(key)
        async def extract():
            entry={"site":name,"host":p.hostname,"path":p.path[:145],
                   "method":response.request.method,"status":response.status}
            try:
                data=json.loads(response.request.post_data or "null")
                entry["request_shape"]=shape(data)
            except (ValueError,TypeError):
                pass
            try:
                if "json" in (response.headers.get("content-type") or "").lower():
                    data=await response.json()
                    entry["response_shape"]=shape(data)
            except Exception:
                pass
            print(json.dumps(entry,ensure_ascii=False),flush=True)
        pending.append(asyncio.create_task(extract()))
    page.on("response",inspect_response)
    try:
        await page.goto(url,wait_until="domcontentloaded",timeout=22000)
        await page.wait_for_timeout(6500)
        if pending:await asyncio.gather(*pending,return_exceptions=True)
    except Exception as e:
        print(json.dumps({"site":name,"error":str(e).splitlines()[0][:100]}))
    finally:
        await context.close()

async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        try:
            for name,url in SITES.items():
                await check(browser,name,url)
        finally:
            await browser.close()

if __name__=="__main__":
    asyncio.run(main())
