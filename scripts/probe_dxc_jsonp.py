"""Read-only public JSONP feed diagnostics, no tokens."""
import json
from urllib.parse import urlencode
from app.custom_sources import _bytes

def main():
    params=[("callback","CWS.jobs.jobCallback"),
       ("facet[]","is_internal:DXCJobs"),
       ("sortfield","open_date"),("sortorder","descending"),
       ("Limit","10"),("Organization","2492"),("offset","1"),("fuzzy","false")]
    url="https://jobsapi-internal.m-cloud.io/api/job?"+urlencode(params)
    raw=_bytes(url).decode("utf-8","replace")
    prefix="CWS.jobs.jobCallback("
    if not raw.startswith(prefix):
        raise ValueError("Unrecognized public job callback")
    d=json.loads(raw[len(prefix):].rstrip(" ;\r\n").removesuffix(")"))
    print("DXC_KEYS",sorted(d.keys()),flush=True)
    for k,v in d.items():
        if isinstance(v,list):
            print("DXC_LIST",k,"count",len(v),"first",str(v[0] if v else None)[:2300],flush=True)
        elif isinstance(v,dict):
            print("DXC_DICT",k,"keys",list(v)[:12],flush=True)
        elif isinstance(v,(str,int,float)):
            print("DXC_VALUE",k,str(v)[:150],flush=True)

if __name__=="__main__":main()
