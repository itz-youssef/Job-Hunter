"""Uber Oracle Recruiting CE expanded jobs, real source scope."""
from app.custom_sources import _json
from urllib.parse import urlencode
root="https://iaziqy.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05/recruitingCEJobRequisitions"
queries=[
 {"onlyData":"true","expand":"requisitionList","finder":"findReqs;siteNumber=CX_1,limit=12,offset=0"},
 {"onlyData":"true","expand":"requisitionList","finder":"findReqs;siteNumber=CX_1,limit=20,offset=0,location=Egypt"},
 {"onlyData":"true","expand":"requisitionList","finder":"findReqs;siteNumber=CX_1,limit=12,offset=0,workLocationCountryCode=EG"},
 {"onlyData":"true","expand":"requisitionList","finder":"findReqs;siteNumber=CX_1,limit=12,offset=0,sortBy=POSTING_DATES_DESC"}
]
for q in queries:
 try:
  r=_json(root+"?"+urlencode(q))
  a=(r.get("items")or[{}])[0]
  jobs=a.get("requisitionList")or[]
  print("ORACLE",q,"total",a.get("TotalJobsCount"),"returned",len(jobs),"keys",list(a)[:60],flush=True)
  for job in jobs[:4]:
   print("JOB",[(k,str(job.get(k))[:230])for k in ("Id","Title","PrimaryLocation","PostedDate","ExternalUrl","ExternalUrlSeo","PrimaryLocationCountry","EmployerName","Country","City")],flush=True)
  print("FACET",[(x.get("Name"),x.get("TotalCount"))for x in a.get("locationsFacet",[])if "Egypt" in x.get("Name","")],flush=True)
 except Exception as e:print("ORACLE_ERROR",str(e)[:250],flush=True)
