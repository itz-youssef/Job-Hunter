"""Read-only ITWorx public job API schema inspection (PR CI only)."""
import json
import urllib.request

url="https://careers.itworx.com/ServerApp/api/Requisition/GetAllRequisitions"
payload=json.dumps({"StartIndex":1,"PageSize":30,"SortBy":1,"IsTokenPresent":False}).encode()
req=urllib.request.Request(url,data=payload,headers={"Content-Type":"application/json","User-Agent":"Mozilla/5.0","Accept":"application/json"})
try:
    with urllib.request.urlopen(req,timeout=18) as response:
        data=json.load(response)
    rows=data.get("AllRequisitions") or []
    print("ITWORX_TOTAL",data.get("TotalCount"),"FETCHED",len(rows))
    if rows:
        print("ITWORX_FIELDS",list(rows[0].keys()))
        for row in rows[:12]:
            print("ITWORX_SUMMARY",str(row.get("Position") or "")[:75],
                  "level",str(row.get("CareerLevel") or "")[:45],
                  "location-fields",{k:str(v)[:100] for k,v in row.items()
                                    if any(t in k.lower() for t in ("locat","city","country","office","site"))})
except Exception as exc:
    print("ITWORX_ERROR",type(exc).__name__,str(exc)[:160])
