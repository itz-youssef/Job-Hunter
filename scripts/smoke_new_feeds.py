"""Live smoke test of public feeds. No secrets, writes, or notification sends."""
import json
from pathlib import Path
from app.custom_sources import scan_company

names={"Siemens","Telecom Egypt (WE)"}
registry=json.loads(Path("companies.json").read_text(encoding="utf-8"))
failed=False
for item in registry:
    if item.get("name") not in names:
        continue
    if item.get("name") == "Siemens":
        from app.custom_sources import _json
        from urllib.parse import urlencode
        query = urlencode({"location":"Cairo","page":1,
            "businessStructures":"electronic-design-automation-eda","num_items":10})
        data=_json("https://prod-search-api.jobsyn.org/api/v1/solr/search?"+query)
        print("SIEMENS_PAYLOAD_SUMMARY", json.dumps({
            "total":data.get("pagination",{}).get("total"),
            "has_more":data.get("pagination",{}).get("has_more_pages"),
            "samples":[{
                k:str(x.get(k))[:120] for k in (
                    "title_exact","city_slab_exact","city_exact","country_exact",
                    "country_short_exact","title_slug","guid","id","location_exact")
            } for x in data.get("jobs",[])[:3]]
        }, ensure_ascii=False),flush=True)
    jobs,status,msg=scan_company(item)
    print(json.dumps({
        "company":item["name"],"status":status,"reason":msg,
        "parsed":len(jobs),
        "samples":[{"title":j.get("title"),"location":j.get("location"),
                    "url":j.get("url")} for j in jobs[:2]]
    },ensure_ascii=False),flush=True)
    if status!="monitoring":failed=True
if failed:raise SystemExit(1)
