"""Fast read-only Siemens Software ATS probe (bounded to public API pages)."""
from app.custom_sources import _json, _bytes, _job
from app.egypt_public_feeds import siemens_software
from app.filters import relevance

def main():
 jobs=siemens_software("Siemens",_json,_job,None)
 print("ATS_TOTAL",len(jobs),flush=True)
 for j in jobs:
  if j.get("external_id")=="527985" or "Software Development Engineer" in j.get("title",""):
   print("ATS_MATCH",j.get("external_id"),j.get("title"),j.get("url"),j.get("location"),j.get("seniority"),relevance(j,{})[0],flush=True)
   try:
    html=_bytes(j["url"]).decode("utf-8","replace")
    import re
    for marker in ("Experience level","Early Professional","Job Posting Date","527985"):
     match=re.search(marker,html,re.I)
     if match:print("ATS_DETAIL",marker,repr(html[max(0,match.start()-160):match.start()+200]),flush=True)
   except Exception as exc:print("ATS_ERROR",type(exc).__name__,str(exc)[:120],flush=True)

if __name__=="__main__":main()
