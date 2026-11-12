"""One-shot read-only contract discovery: IBM public search and Paymob pagination."""
import json,re,urllib.request,urllib.error
from urllib.parse import urlsplit
from bs4 import BeautifulSoup

API="https://www-api.ibm.com/search/api/v2"
SOURCE=["_id","title","url","description","language","entitled","field_keyword_17","field_keyword_08","field_keyword_18","field_keyword_19","field_keyword_05"]
def ibm(query):
 body={"appId":"careers","scopes":["careers2"],"query":query,"size":30,"sort":[{"_score":"desc"},{"pageviews":"desc"}],
 "lang":"zz","localeSelector":{},"sm":{"query":"","lang":"zz"},"_source":SOURCE}
 request=urllib.request.Request(API,data=json.dumps(body).encode(),headers={
  "Content-Type":"application/json","Accept":"application/json","User-Agent":"Mozilla/5.0","Referer":"https://www.ibm.com/careers/search"
 })
 try:
  with urllib.request.urlopen(request,timeout=20) as r: d=json.load(r)
  rows=d.get("hits",{}).get("hits",[])
  return {"total":d.get("hits",{}).get("total",{}).get("value"),"hits":[
   {"title":h.get("_source",{}).get("title"),"location":h.get("_source",{}).get("field_keyword_19"),
    "other_country":h.get("_source",{}).get("field_keyword_05"),
    "experience":h.get("_source",{}).get("field_keyword_18")}
    for h in rows[:6]]}
 except urllib.error.HTTPError as e:return {"http":e.code,"message":e.read(300).decode(errors="replace")}
 except Exception as e:return {"error":str(e)[:150]}

def paymob(url):
 try:
  request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"text/html"})
  with urllib.request.urlopen(request,timeout=20) as r: text=r.read(900000).decode("utf-8","replace")
  soup=BeautifulSoup(text,"html.parser")
  roles=[]
  for a in soup.select('a[href*="/careers/paymob/"]'):
   path=urlsplit(a.get("href") or "").path
   if path.rstrip("/").endswith("/opportunities"):continue
   title=" ".join(a.get_text(" ",strip=True).split())
   if path and title:roles.append((path,title[:55]))
  return {"title":(soup.title.get_text(" ",strip=True) if soup.title else ""),
          "roles":roles[:4],"roles_in_html":len(roles),"has_next":bool(soup.select('a[rel=next]')),
          "page_tokens":[x[:100] for x in re.findall(r'(?i).{0,30}(?:pagination|page=2|next page|next-page|load more).{0,40}',text)[:6]]}
 except urllib.error.HTTPError as e:return {"http":e.code}
 except Exception as e:return {"error":str(e)[:120]}

def main():
 cases={
  "baseline":{"bool":{"must":[]}},
  "match_egypt_city":{"bool":{"must":[{"match":{"field_keyword_19":"Egypt"}}]}},
  "match_cairo":{"bool":{"must":[{"match":{"field_keyword_19":"Cairo"}}]}},
  "country_egypt":{"bool":{"must":[{"term":{"field_keyword_05":"Egypt"}}]}},
 }
 for name,query in cases.items():
  print("IBM",name,json.dumps(ibm(query),ensure_ascii=False),flush=True)
 for suffix in ("","?page=2","?page=3","?limit=100"):
  url="https://app.recruitera.ai/careers/paymob/opportunities"+suffix
  print("PAYMOB",suffix or "first",json.dumps(paymob(url),ensure_ascii=False),flush=True)

if __name__=="__main__":main()
