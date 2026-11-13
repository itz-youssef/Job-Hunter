"""Final read-only acceptance test for verified employer integrations."""
from app.custom_sources import scan_company
from app.filters import relevance
targets={
"EY Egypt":"https://careers.ey.com/ey/search/?q=&locationsearch=Egypt",
"PwC Egypt":"https://careers.pwc.com/search/?q=&locationsearch=Egypt",
"Breadfast":"https://www.breadfast.com/careers/",
"Breadfast Technology":"https://www.breadfast.com/ar/careers_categories/technology/",
"Blink22":"https://blink22.com/careers/",
"Finaira":"https://finaira.ai/work-at-finaira/",
"Talabat Egypt":"https://careers.deliveryhero.com/jobs?options=252%2C845&page=1",
"Uber Egypt":"https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers/jobs",
"Amazon Egypt":"https://www.amazon.jobs/en/location/egypt",
"AWS Egypt":"https://www.amazon.jobs/en/search?country=EGY",
"Teleperformance Egypt":"https://tpegyptcareers.teleperformance.com.eg/vacancies",
"CIB Egypt":"https://cibeg.taleo.net/careersection/cib_ex/moresearch.ftl",
}
for name,url in targets.items():
 try:
  jobs,status,reason=scan_company({"name":name,"url":url})
  eligible=sum(relevance(j,{})[0]>=8 for j in jobs)
  print("ACCEPT",name,status,len(jobs),"eligible",eligible,reason,
   [(j.get("title"),j.get("location"),j.get("published"))for j in jobs[:2]],flush=True)
  if status in ("monitoring","partial"):
   assert all(not (j.get("title") or"").strip().isdigit() for j in jobs)
 except Exception as e:print("ACCEPT_ERROR",name,type(e).__name__,str(e)[:190],flush=True)
