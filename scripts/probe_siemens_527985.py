"""Read-only sanity probe for Siemens Avature's public job listing."""
from app.sources import siemens, SourceError
from app.filters import relevance
import requests

class Client:
 def get(self,url):
  r=requests.get(url,timeout=14,headers={"User-Agent":"Mozilla/5.0 (compatible; JobHunter/1.0)"})
  print("FETCH",r.status_code,r.url,len(r.content),flush=True)
  r.raise_for_status()
  return r

def main():
 from app import sources
 old=sources.cached_jobs
 sources.cached_jobs=lambda src:{}
 try:
  jobs=siemens({"id":0},Client())
  matches=[j for j in jobs if j["external_id"]=="527985" or j["title"]=="Software Development Engineer"]
  print("TOTAL",len(jobs),"MATCHES",len(matches),flush=True)
  for j in matches[:10]:
   score,reasons=relevance(j,{})
   print("MATCH",j["external_id"],repr(j["title"]),repr(j["location"]),repr(j.get("seniority")),score,reasons,flush=True)
 finally:
  sources.cached_jobs=old

if __name__=="__main__":main()
