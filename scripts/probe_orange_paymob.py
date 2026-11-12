"""Read-only UI contract diagnostics for Paymob and Orange careers pages."""
import asyncio,json
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

def shape(obj,depth=0):
    if depth>3:return type(obj).__name__
    if isinstance(obj,list):
        return {"length":len(obj),"first":shape(obj[0],depth+1) if obj else None}
    if isinstance(obj,dict):
        return {str(k):shape(v,depth+1) for k,v in list(obj.items())[:24]}
    return type(obj).__name__

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True)
        for name,url in [
          ("Paymob","https://app.recruitera.ai/careers/paymob/opportunities"),
          ("Orange","https://orange.jobs/gb/en/egypt-results")
        ]:
            page=await b.new_page()
            observations=[]
            requests=[]
            def resp(r):
                path=urlsplit(r.url).path
                host=urlsplit(r.url).hostname
                if not r.request.method in ("GET","POST"):return
                if name=="Paymob" and not (host or "").endswith("recruitera.ai"):return
                if name=="Orange" and host!="orange.jobs":return
                if name=="Orange" and path!="/widgets":return
                key=(path,r.request.method,r.request.post_data or "")
                if key in requests:return
                requests.append(key)
                async def read():
                    data={"site":name,"host":host,"path":path[:120],"method":r.request.method,"status":r.status}
                    try:
                        body=r.request.post_data_json
                        if isinstance(body,dict):
                            data["request"]=body if len(json.dumps(body))<1200 else shape(body)
                    except Exception:pass
                    try:
                        if "json" in (r.headers.get("content-type") or ""):
                            obj=await r.json()
                            data["response"]=shape(obj)
                            if name=="Orange" and isinstance(obj,dict):
                                result=obj.get("dynaData",{})
                                if isinstance(result,dict) and isinstance(result.get("data"),dict):
                                    data["data_keys"]=list(result["data"].keys())[:30]
                    except Exception:pass
                    observations.append(data)
                asyncio.create_task(read())
            page.on("response",resp)
            try:
                await page.goto(url,wait_until="domcontentloaded",timeout=30000)
                await page.wait_for_timeout(6000)
                selector='a[href*="/careers/paymob/"]' if name=="Paymob" else 'a[href*="/gb/en/job/"]'
                before=await page.locator(selector).count()
                print("INITIAL",name,before,flush=True)
                if name=="Paymob":
                    for n in range(4):
                        btn=page.get_by_text("Load more",exact=True)
                        if await btn.count() and await btn.first.is_visible():
                            await btn.first.click()
                            await page.wait_for_timeout(1800)
                            after=await page.locator(selector).count()
                            print("AFTER_LOAD",name,n,after,flush=True)
                            if after<=before:break
                            before=after
                        else:break
                else:
                    print("ORANGE_BUTTON_TEXT",(await page.locator("button").all_inner_texts())[:40],flush=True)
                    print("ORANGE_NAV_TEXT",(await page.locator('a[aria-label]').all_inner_texts())[-15:],flush=True)
                await page.wait_for_timeout(1100)
            except Exception as e:
                print("ERROR",name,str(e).splitlines()[0][:140],flush=True)
            print("OBS",name,json.dumps(observations[:35],ensure_ascii=False),flush=True)
            await page.close()
        await b.close()
if __name__=="__main__":asyncio.run(main())
