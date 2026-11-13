"""Uber current Oracle Cloud recruiting and DeliveryHero Talabat SSR structured cards."""
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
import re
URLS=[
 "https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers/jobs",
 "https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers",
 "https://iaziqy.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&limit=10",
 "https://careers.deliveryhero.com/jobs?options=252%2C845&page=1",
 "https://careers.deliveryhero.com/jobs?options=252%2C845&page=2",
 "https://careers.deliveryhero.com/job/staff-software-engineer-in-maadi-egypt-jid-10904"
]
for u in URLS:
 try:
  h=_bytes(u).decode("utf-8","replace")
  s=BeautifulSoup(h,"html.parser")
  print("SITE",u,"bytes",len(h),"text",s.get_text(" ",strip=True)[:330],flush=True)
  if "deliveryhero" in u:
   for card in s.select("[data-jobid]")[:8]:
    print("TALABAT_CARD",card.get("data-jobid"),card.get("class"),card.get_text(" ",strip=True)[:700],flush=True)
    a=card.select_one("a[href*='/job/']")
    print("TALABAT_LINK",a.get("href") if a else "",flush=True)
   print("TALABAT_RESULTS",re.findall(r'(\d+)\s+result\(s\)',s.get_text(" ",strip=True),re.I)[:4],flush=True)
  if "oraclecloud" in u:
   print("ORACLE_MARK",[h[max(0,m.start()-90):m.start()+180] for m in list(re.finditer(r"jobRequisitions|JobRequisition|job-list|JobId|jobs|siteNumber|talent-community",h,re.I))[:9]],flush=True)
 except Exception as e:print("SITE_ERROR",u,type(e).__name__,str(e)[:180],flush=True)
