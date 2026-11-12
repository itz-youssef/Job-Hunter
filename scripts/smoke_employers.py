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
    jobs,status,message=scan_company({
        "name":"Paymob",
        "url":"https://origin.paymob.com/en/careers"
    })
    print("PAYMOB_LIVE",status,message,"total",len(jobs),flush=True)
    print("PAYMOB_SAMPLES",[(j["title"],j["location"]) for j in jobs[:4]],flush=True)
    if status!="monitoring" or not jobs:
        raise SystemExit("Paymob public career feed was not completely parsed")
    jobs,status,message=scan_company({
        "name":"Orange Egypt",
        "url":"https://orange.jobs/gb/en/africa-middle-east/egypt?utm_source=chatgpt.com"
    })
    print("ORANGE_LIVE",status,message,"total",len(jobs),flush=True)
    print("ORANGE_SAMPLES",[(j["title"],j["location"]) for j in jobs[:4]],flush=True)
    if status!="monitoring" or not jobs:
        raise SystemExit("Orange Egypt Phenom public jobs feed was not fully parsed")



if __name__=="__main__":main()
