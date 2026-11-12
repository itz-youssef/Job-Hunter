"""Read-only browser check for publicly visible official vacancy APIs."""
from playwright.sync_api import sync_playwright

PAGES = {
    "Breadfast": "https://www.breadfast.com/careers/",
    "Capgemini": "https://www.capgemini.com/eg-en/careers/join-us/",
    "DXC": "https://careers.dxc.com/job-search-results/",
    "Deloitte": "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
    "e& Egypt": "https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl",
}
def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        try:
            for name,url in PAGES.items():
                page=browser.new_page()
                api=[]
                def handle(response):
                    u=response.url
                    if any(t in u.lower() for t in ("/api/",".json","searchjobs","joblist","jobsearch","/jobs","/search")) and len(api)<25:
                        api.append((response.status,response.request.method,u.split("?")[0]))
                    if response.ok and any(host in u for host in (
                        "wp-json/freshteams/v1/jobs",
                        "cg-jobstream-api.azurewebsites.net/api/job-search",
                        "jobsapi-internal.m-cloud.io/api/job",
                        "joblist.ajax"
                    )):
                        try:
                            body = response.json()
                            info = ({"type":"list","count":len(body),"first":str(body[0])[:1100]}
                                    if isinstance(body,list) else
                                    {"type":"dict","keys":list(body)[:18],
                                     "first":str(body)[:1600]})
                            print("API_SCHEMA",name,response.request.method,
                                  response.url[:400], "request",
                                  str(response.request.post_data)[:300],
                                  "data",info,flush=True)
                        except Exception as exc:
                            print("API_SCHEMA_ERROR",name,type(exc).__name__,flush=True)
                page.on("response",handle)
                try:
                    res=page.goto(url,wait_until="domcontentloaded",timeout=20000)
                    page.wait_for_timeout(1800)
                    links=page.locator("a[href]").evaluate_all("""els=>els.filter(a=>/job|intern|career|apply/i.test(a.href+' '+a.innerText)).slice(0,15).map(a=>[a.innerText.trim().slice(0,60),a.href.split('?')[0]])""")
                    print("BROWSER",name,"status",res.status if res else None,"url",page.url,"links",links,"api",api,flush=True)
                except Exception as exc:
                    print("BROWSER_ERROR",name,type(exc).__name__,str(exc)[:160],flush=True)
                finally: page.close()
        finally: browser.close()
if __name__=="__main__": main()
