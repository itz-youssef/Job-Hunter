"""Read-only smoke scan for IBM careers on GitHub Actions."""
from app.custom_sources import scan_company

def main():
    jobs,status,message=scan_company({
        "name":"IBM",
        "url":"https://www.ibm.com/careers/search?"
    })
    print("IBM_LIVE",status,message,"total",len(jobs),flush=True)
    from app.filters import relevance
    good=[job for job in jobs if relevance(job,{})[0]>0]
    print("IBM_ELIGIBLE",len(good),[(j["title"],j["location"]) for j in good[:5]],flush=True)
    if status!="monitoring" or not jobs:
        raise SystemExit("IBM public integration did not yield current jobs")

if __name__=="__main__":main()
