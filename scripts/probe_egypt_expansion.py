"""Focused source-schema probe; read-only and bounded."""
from app.custom_sources import _bytes,_json
from bs4 import BeautifulSoup
import json,re
def get(url):
 try:
  data=_bytes(url)
  print("GET",url,len(data),flush=True)
  return data.decode("utf-8","replace")
 except Exception as e:print("GET_ERR",url,type(e).__name__,str(e)[:150],flush=True);return ""
for url in [
 "https://www.breadfast.com/wp-json/freshteams/v1/jobs",
 "https://www.breadfast.com/wp-json/freshteams/v1/jobs?category=technology",
 "https://careers.ey.com/ey/search/?q=&locationsearch=Egypt&startrow=0",
 "https://careers.ey.com/ey/search/?q=&locationsearch=Egypt&startrow=25",
 "https://blink22.com/careers/",
 "https://blink22.com/careers/software-engineer/",
 "https://www.amazon.jobs/en/search.json?offset=0&result_limit=10&country=EGY",
 "https://www.amazon.jobs/en/search?country=EGY&offset=0",
]:
 html=get(url)
 if not html:continue
 if "freshteams" in url:
  try:
   data=json.loads(html);print("BREAD_JSON",type(data).__name__,str(data)[:19000],flush=True)
  except:print("BREAD_RAW",html[:2500],flush=True)
 elif "ey.com" in url:
  soup=BeautifulSoup(html,"html.parser")
  print("EY_ROWS",[(x.get_text(" ",strip=True)[:240],[(a.get("href"),a.get_text(" ",strip=True)[:100])for a in x.select("a.jobTitle-link")])for x in soup.select("tr") if x.select("a.jobTitle-link")][:6],flush=True)
  print("EY_PAGINATION",[x.get_text(" ",strip=True)[:120] for x in soup.select(".pagination")][:3],flush=True)
  print("EY_TOTAL",re.findall(r'Results\s+\d+\s*[-–]\s*\d+\s+of\s+[\d,]+',soup.get_text(" ",strip=True))[:4],flush=True)
 elif "blink22" in url:
  soup=BeautifulSoup(html,"html.parser")
  entries=[]
  for a in soup.select("a[href*='/careers/']"):
   if a.get("href","").rstrip("/").endswith("/careers"):continue
   entries.append((a.get("href"),a.get_text(" ",strip=True)[:160],a.parent.parent.get_text(" ",strip=True)[:250]))
  print("BLINK_LINKS",entries[:22],flush=True)
  print("BLINK_TEXT",soup.get_text(" ",strip=True)[:2600] if "/software-engineer/" in url else "",flush=True)
 elif "amazon.jobs" in url:
  print("AMAZON_SAMPLE",html[:900],flush=True)
  print("AMAZON_KEYS",re.findall(r'.{0,30}(?:jobId|job_id|total_hits|totalHits|/en/jobs/).{0,90}',html,re.I)[:10],flush=True)
