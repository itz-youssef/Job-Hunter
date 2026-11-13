"""Retest official employer career adapters after corrections."""
from app.custom_sources import scan_company
targets={
"EY":"https://careers.ey.com/ey/search/?q=&locationsearch=Egypt",
"PwC Egypt":"https://careers.pwc.com/search/?q=&locationsearch=Egypt",
"Breadfast":"https://www.breadfast.com/careers/",
"Breadfast Technology":"https://www.breadfast.com/careers_categories/technology/",
"Blink22":"https://blink22.com/careers/",
"Finaira":"https://finaira.ai/work-at-finaira/",
"Talabat":"https://careers.deliveryhero.com/jobs?options=252%2C845&page=1",
"Uber Egypt":"https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers/jobs",
"Amazon Egypt":"https://www.amazon.jobs/en/location/egypt",
"AWS Egypt":"https://www.amazon.jobs/en/search?country=EGY",
"Teleperformance Egypt":"https://tpegyptcareers.teleperformance.com.eg/vacancies",
}
for name,url in targets.items():
 try:
  jobs,status,reason=scan_company({"name":name,"url":url})
  print("RESULT",name,status,len(jobs),reason,
        [(j.get("title"),j.get("location"))for j in jobs[:2]],flush=True)
 except Exception as e:print("RESULT_ERROR",name,type(e).__name__,str(e)[:190],flush=True)
