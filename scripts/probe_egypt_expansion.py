"""Check Uber Oracle Cloud public job requisitions and investor-backed Getro feed."""
import json,re
from bs4 import BeautifulSoup
from app.custom_sources import _bytes
from urllib.parse import urlencode
root="https://iaziqy.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05/recruitingCEJobRequisitions"
queries=[
 {"finder":"findReqs;siteNumber=CX_1","onlyData":"true","limit":10},
 {"finder":"findReqs;siteNumber=CX_1,facetsList=LOCATIONS","onlyData":"true","limit":10},
 {"finder":"findReqs;siteNumber=CX_1,sortBy=POSTING_DATES_DESC","onlyData":"true","limit":10},
]
for q in queries:
 u=root+"?"+urlencode(q)
 try:
  txt=_bytes(u).decode("utf8","replace")
  print("ORACLE",q,"size",len(txt),"head",txt[:3300],flush=True)
 except Exception as e:print("ORACLE_ERROR",str(e)[:160],flush=True)
for url in ["https://jobs.innovationendeavors.com/companies/uber","https://careers.4dxventures.com/companies/breadfast"]:
 try:
  html=_bytes(url).decode("utf8","replace")
  soup=BeautifulSoup(html,"html.parser")
  node=soup.find("script",id="__NEXT_DATA__")
  if not node:print("GETRO_MISSING",url,flush=True);continue
  data=json.loads(node.text)
  state=data.get("props",{}).get("pageProps",{}).get("initialState",{})
  print("GETRO",url,"statekeys",list(state)[:45],"data",str(state)[:3500],flush=True)
  for key in ("jobs","searchResults","entities","allJobs"):
   print("GETRO_SUB",key,str(state.get(key))[:900],flush=True)
 except Exception as e:print("GETRO_ERROR",url,type(e).__name__,str(e)[:190],flush=True)
