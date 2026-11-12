"""Read-only discovery of publicly rendered careers sites.

No login, evasion, credential capture, or URL query/body logging.
Print only listing links, broad JSON schemas and public site status.
"""
import asyncio, json, re
from urllib.parse import urlsplit, urljoin
from playwright.async_api import async_playwright

SITES={
 "IBM":"https://www.ibm.com/careers/search",
 "Schneider":"https://careers.se.com/Defaultlandingpage/jobs/categories?lang=en-US",
 "Orange":"https://orange.jobs/gb/en/egypt-results",
 "Paymob Recruitera":"https://app.recruitera.ai/careers/paymob",
 "Fawry":"https://www.fawry.com/jobs/",
}
KEYS=re.compile(r"job|career|search|position|vacancy|requisition|posting|jobs|graphql|api/v2|widgets|wp-json|ajax",re.I)
TITLES=re.compile(r"software|engineer|developer|AI|intern|junior|machine learning|fullstack|application|data",re.I)
def loc(u):
 p=urlsplit(u)
 return (p.hostname or "")+(p.path[:110] or "/")
def schema(data,depth=0):
 if depth>2:return type(data).__name__
 if isinstance(data,dict):return {k:schema(v,depth+1) for k,v in list(data.items())[:25]}
 if isinstance(data,list):return {"length":len(data),"first":schema(data[0],depth+1) if data else None}
 return type(data).__name__
async def probe(browser,sem,name,url):
 async with sem:
  context=await browser.new_context(ignore_https_errors=False)
  page=await context.new_page()
  tasks=[]
  seen=set()
  def resp(r):
   p=urlsplit(r.url)
   content_type=r.headers.get("content-type","")
   if p.scheme!="https" or len(seen)>24:return
   if not KEYS.search(p.path) or not ("json" in content_type or "/api" in p.path):return
   key=(p.hostname,p.path,r.request.method)
   if key in seen:return
   seen.add(key)
   async def read():
    entry={"site":name,"endpoint":loc(r.url),"method":r.request.method,"status":r.status}
    try:
     payload=await r.json()
     entry["response_shape"]=schema(payload)
     if isinstance(payload,dict):
      for field in ("jobs","jobPostings","results","items","data","content","postings"):
       if field in payload and isinstance(payload[field],list) and payload[field]:
        sample=payload[field][0]
        entry["sample_keys"]=list(sample.keys())[:40] if isinstance(sample,dict) else []
    except Exception:pass
    try:
     data=r.request.post_data_json
     if isinstance(data,dict):
      entry["request_shape"]=schema(data)
    except Exception:pass
    print("API",json.dumps(entry,ensure_ascii=False),flush=True)
   tasks.append(asyncio.create_task(read()))
  page.on("response",resp)
  try:
   response=await page.goto(url,wait_until="domcontentloaded",timeout=30000)
   await page.wait_for_timeout(5000)
   anchors=await page.locator("a[href]").evaluate_all("""nodes=>nodes.map(a=>({text:(a.innerText||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,90),href:a.href})).slice(0,900)""")
   likely=[]
   for a in anchors:
    if (KEYS.search(urlsplit(a["href"]).path) or TITLES.search(a["text"])) and a["href"].startswith("https:"):
     likely.append({"title":a["text"],"path":loc(a["href"])})
   body=(await page.locator("body").inner_text(timeout=4500))[:230].replace("\n"," ")
   print("PAGE",json.dumps({"site":name,"http":response.status if response else None,"title":(await page.title())[:100],"text":body,"links":likely[:20],"anchor_count":len(anchors)},ensure_ascii=False),flush=True)
  except Exception as ex:
   print("PAGE",json.dumps({"site":name,"error":str(ex).splitlines()[0][:150]}),flush=True)
  if tasks:await asyncio.gather(*tasks,return_exceptions=True)
  await context.close()
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  sem=asyncio.Semaphore(2)
  await asyncio.gather(*(probe(browser,sem,name,url) for name,url in SITES.items()))
  await browser.close()
if __name__=="__main__":asyncio.run(main())
