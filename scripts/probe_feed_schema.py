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
TARGET_HOSTS=("jobsyn.org","phenompeople.com","orange.jobs","te.eg","breadfast.com","linkdevelopment.com")
TARGET_PATHS=("solr","widgets","search","vacanc","freshteams","wp-json","ajax","jobs","requisition","position")

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
                if "linkdevelopment.com" in (p.hostname or ""):
                    try:
                        from urllib.parse import parse_qs
                        parts=parse_qs(response.request.post_data or "")
                        entry["form_keys"]=sorted(parts.keys())
                        entry["form_action"]=parts.get("action",[""])[0][:70]
                    except Exception:
                        pass
            except (ValueError,TypeError):
                pass
            try:
                if "json" in (response.headers.get("content-type") or "").lower():
                    data=await response.json()
                    entry["response_shape"]=shape(data)
                    if p.hostname == "prod-search-api.jobsyn.org":
                        from urllib.parse import parse_qs
                        params=parse_qs(p.query)
                        entry["public_query"]={
                            k:(v[0][:150] if k.lower() in ("location","offset","page","limit","keywords","q","query","sort","category") else "[redacted]")
                            for k,v in params.items()
                        }
                        if isinstance(data,dict) and isinstance(data.get("jobs"),list) and data["jobs"]:
                            first=data["jobs"][0]
                            entry["job_fields"]=sorted(first.keys())
                            entry["job_sample"]={
                                k:str(first.get(k))[:100]
                                for k in ("title","title_exact","city_exact","country_exact","location_exact","description","id","url","job_url","apply_url","job_slug","slug")
                                if k in first
                            }
                    if p.path=="/o/c/vacancies/" and isinstance(data,dict) and data.get("items"):
                        item=data["items"][0]
                        entry["public_job_sample"]={
                            k:str(item.get(k))[:120] for k in (
                                "id","titleEnglish","locationEnglish","expiryDate","status","dateCreated"
                            )
                        }
                    if "freshteams" in p.path and isinstance(data,dict):
                        entry["public_errors"]=[
                            {k:str(err.get(k))[:100] for k in ("code","message")}
                            for err in data.get("errors",[]) if isinstance(err,dict)
                        ]
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
