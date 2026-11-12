"""Verify public Eightfold positions API and Fawry job index paging."""
from app.custom_sources import _json,_bytes,_PageParser
from urllib.parse import urlencode
import re
def main():
 for name,host,domain in (("VOIS","jobs.vodafone.com","vodafone.com"),("Ericsson","jobs.ericsson.com","ericsson.com")):
  for api in ("pcsx/search","apply/v2/jobs"):
   params=urlencode({"domain":domain,"query":"","location":"Egypt","start":0,"num":10})
   url=f"https://{host}/api/{api}?{params}"
   try:
    result=_json(url)
    inner=result.get("data",result) if isinstance(result,dict) else {}
    rows=inner.get("positions",[]) if isinstance(inner,dict) else []
    print("API",name,api,"keys",list(result)[:12],"count",inner.get("count"),"rows",len(rows),"sample",str(rows[0])[:1350] if rows else "",flush=True)
   except Exception as e:print("API_ERROR",name,api,type(e).__name__,str(e)[:160],flush=True)
 for url in ["https://www.fawry.com/jobs/","https://www.fawry.com/jobs/page/2/","https://www.fawry.com/?feed=job_feed&posts_per_page=50"]:
  try:
   doc=_bytes(url).decode("utf-8","replace")
   parser=_PageParser();parser.feed(doc)
   listings=[(h," ".join(t.split())[:90]) for h,t in parser.links if "post_type=job_listing" in h and "p=" in h]
   pg=[(h," ".join(t.split())[:30]) for h,t in parser.links if any(term in h.lower() for term in ("page/2","paged=","job_page="))]
   print("FAWRY",url,"length",len(doc),"jobs",len(listings),"first",listings[:4],"pages",pg[:8],"xml",doc[:30],flush=True)
  except Exception as e:print("FAWRY_ERROR",url,type(e).__name__,str(e)[:140],flush=True)
if __name__=="__main__":main()
