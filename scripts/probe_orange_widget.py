"""Probe publicly documented Phenom widget search for Orange Egypt."""
import json,re
import requests

URL="https://orange.jobs/gb/en/egypt-results"
API="https://orange.jobs/widgets"

def shape(data):
 if isinstance(data,dict):
  return {k:(len(v) if isinstance(v,list) else list(v)[:12] if isinstance(v,dict) else type(v).__name__)
          for k,v in list(data.items())[:22]}
 return type(data).__name__

def main():
 s=requests.Session()
 h={"User-Agent":"Mozilla/5.0","Accept":"text/html"}
 r=s.get(URL,timeout=18,headers=h,allow_redirects=False)
 print("SEED",r.status_code,"host",requests.utils.urlparse(r.url).hostname,flush=True)
 if r.status_code!=200:raise SystemExit("Seed was not public")
 match=re.search(r'["\\']csrfToken["\\']\s*:\s*["\\']([^"\\']+)',r.text)
 token=match.group(1) if match else ""
 if not token:
  for cookie in s.cookies:
   if "csrf" in cookie.name.lower():
    token=cookie.value
    break
 print("CSRF_PRESENT",bool(token),flush=True)
 headers={"User-Agent":"Mozilla/5.0","Accept":"application/json","Content-Type":"application/json",
          "Origin":"https://orange.jobs","Referer":URL}
 if token:headers["x-csrf-token"]=token
 base={
    "ddoKey":"refineSearch","jobs":True,"counts":True,"from":0,"size":100,
    "pageName":"Egypt results","pageType":"landingPage",
    "rk":"l-egypt-results","sortBy":"","subsearch":"",
    "all_fields":["phLocSlider","category","contractType","country","city","companyName","workModel","hiringType"],
    "selected_fields":{"country":["EGYPT"],"companyName":["Orange Egypt"]},
    "lang":"en_gb","deviceType":"desktop","country":"gb",
    "pageId":"page549-prod","siteType":"external","refNum":"OYVOCZGB"
 }
 for mode in ("direct","enriched"):
  body=dict(base)
  if mode=="enriched":
   body.update({"clearAll":False,"jdsource":"facets","isSliderEnable":True,
                "locationData":{"sliderRadius":51,"aboveMaxRadius":True,"LocationUnit":"kilometers"},
                "rkstatus":True,"global":True,"keywords":""})
  try:
   response=s.post(API,headers=headers,json=body,timeout=22,allow_redirects=False)
   payload=response.json()
   rs=payload.get("refineSearch") or {}
   data=rs.get("data") if isinstance(rs,dict) else {}
   rows=(data or {}).get("jobs",[]) if isinstance(data,dict) else []
   print("SEARCH",mode,"status",response.status_code,
         "shape",json.dumps(shape(rs),ensure_ascii=False),
         "data_shape",json.dumps(shape(data),ensure_ascii=False),
         "jobs",len(rows),
         "sample",json.dumps([{k:row.get(k) for k in (
           "title","jobId","jobSeqNo","city","country","jobUrl","applyUrl"
           ) if k in row} for row in rows[:2]],ensure_ascii=False),flush=True)
  except Exception as ex:print("SEARCH",mode,type(ex).__name__,str(ex)[:140],flush=True)

if __name__=="__main__":main()
