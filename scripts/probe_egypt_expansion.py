"""Oracle Uber job JSON schema / facet scoping reconnaissance."""
from app.custom_sources import _json
from urllib.parse import urlencode
root="https://iaziqy.fa.ocs.oraclecloud.com/hcmRestApi/resources/11.13.18.05/recruitingCEJobRequisitions"
queries=[
 {"finder":"findReqs;siteNumber=CX_1","onlyData":"true"},
 {"finder":"findReqs;siteNumber=CX_1,location=Egypt","onlyData":"true"},
 {"finder":"findReqs;siteNumber=CX_1,selectedLocationsFacet=Egypt","onlyData":"true"},
 {"finder":"findReqs;siteNumber=CX_1,workLocationCountryCode=EG","onlyData":"true"},
 {"finder":"findReqs;siteNumber=CX_1,facetsList=LOCATIONS","onlyData":"true"},
]
for q in queries:
 try:
  j=_json(root+"?"+urlencode(q))
  print("SCHEMA",q,"topkeys",list(j),"items",len(j.get("items",[])),"more",j.get("hasMore"),flush=True)
  if j.get("items"):
   row=j["items"][0]
   print("SCHEMA_ROW",list(row),flush=True)
   print("COUNTS",row.get("TotalJobsCount"),"EgyptFacet",[(x.get("Name"),x.get("Id"),x.get("TotalCount"))for x in row.get("locationsFacet",[])if "Egypt" in x.get("Name","")][:10],flush=True)
   for k,v in row.items():
    if any(word in k.lower() for word in ("requisition","job","title","search","locations")) and isinstance(v,(list,dict)):
     print("ROW_DETAIL",k,str(v)[:1400],flush=True)
 except Exception as e:print("SCHEMA_ERR",str(e)[:180],flush=True)
