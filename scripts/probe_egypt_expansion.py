"""Breadfast portfolio site card links and rendered hydration diagnostics."""
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re,json
url="https://careers.4dxventures.com/companies/breadfast"
html=_bytes(url).decode("utf-8","replace")
soup=BeautifulSoup(html,"html.parser")
print("BREAD_LINKS",[(a.get("href"),a.get_text(" ",strip=True)[:120]) for a in soup.select("a[href]") if "/jobs" in (a.get("href")or"")][:36],flush=True)
print("BREAD_SCRIPT",[(sc.get("id"),sc.get("type"),len(sc.get_text())) for sc in soup.select("script") if sc.get_text()][:20],flush=True)
print("BREAD_IDS",[(x,html.find(x)) for x in ["98855990","Breadfast","openJobs","jobListings","jobs_count","jobPage","__NEXT_DATA__"]],flush=True)
for m in list(re.finditer(r"98855990|Open jobs at Breadfast|jobs at Breadfast",html,re.I))[:5]:
 print("BREAD_AROUND",html[max(0,m.start()-250):m.start()+500],flush=True)
for url in [
 "https://careers.4dxventures.com/companies/breadfast/jobs",
 "https://www.breadfast.com/wp-json/",
 "https://blink22.com/careers/",
]:
 try:
  x=_bytes(url).decode("utf-8","replace")
  print("CHECK",url,len(x),flush=True)
  if "blink22" in url:
   d=BeautifulSoup(x,"html.parser")
   for a in d.select("a[href*='/careers/']")[:22]:
    print("BLINK",a.get_text(" ",strip=True)[:110],a.get("href"),flush=True)
 except Exception as exc:print("ERROR",url,str(exc)[:130],flush=True)
