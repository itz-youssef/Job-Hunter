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
    jobs,status,msg=scan_company(item)
    print(json.dumps({
        "company":item["name"],"status":status,"reason":msg,
        "parsed":len(jobs),
        "samples":[{"title":j.get("title"),"location":j.get("location"),
                    "url":j.get("url")} for j in jobs[:2]]
    },ensure_ascii=False),flush=True)
    if status!="monitoring":failed=True
if failed:raise SystemExit(1)
