"""Independent official-ATS source vs adapter ID comparison fixture tests."""
import importlib.util
from pathlib import Path
sp=importlib.util.spec_from_file_location("reconcile",Path("scripts/reconcile-official-egypt-jobs.py"))
mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)

def test_egypt_only_and_explicit_foreign_exclusion():
    assert mod.egypt_location("Cairo, Egypt")
    assert mod.egypt_location({"city":"Tanta","country":"Egypt"})
    assert mod.egypt_location("Giza, Egypt")
    assert mod.egypt_location("New Cairo, Egypt; United Arab Emirates")
    assert mod.egypt_location("","EG")
    assert not mod.egypt_location("Berlin, Germany")
    assert not mod.egypt_location("Dubai, UAE")
    assert not mod.egypt_location("Unknown")
    assert not mod.egypt_location("Dubai, UAE","AE")


def test_workable_independent_collector_keeps_nontech_egypt():
    company={"name":"Example","url":"https://apply.workable.com/example/"}
    urls=[]
    def fetch(url):
        urls.append(url)
        return {"jobs":[
           {"title":"Accountant","shortcode":"AA","country":"Egypt","city":"Cairo"},
           {"title":"Senior Engineer","shortcode":"BB","country":"UAE","city":"Dubai"},
           {"title":"Marketing Intern","shortcode":"CC","location":{"city":"Giza","country":"Egypt"}},
        ]}
    kind,jobs,count=mod.raw_ats(company,fetch)
    assert kind=="workable" and count==3 and len(jobs)==2
    assert all("example/j/" in j["url"] for j in jobs)
    assert len(urls)==1


def test_ashby_independent_collector_ignores_unlisted_and_foreign():
    company={"name":"Example","url":"https://jobs.ashbyhq.com/example"}
    def fetch(_):
        return {"jobs":[
          {"title":"HR Generalist","location":"Cairo, Egypt","jobUrl":"https://jobs.ashbyhq.com/example/111","isListed":True},
          {"title":"Manager","location":"Dubai, UAE","jobUrl":"https://jobs.ashbyhq.com/example/222","isListed":True},
          {"title":"Hidden","location":"Cairo, Egypt","jobUrl":"https://jobs.ashbyhq.com/example/333","isListed":False}
        ]}
    _,jobs,count=mod.raw_ats(company,fetch)
    assert count==3 and [j["title"] for j in jobs]==["HR Generalist"]


def test_comparator_lists_missing_official_job_ids_without_guessing():
    company={"name":"Example","url":"https://apply.workable.com/example"}
    official=lambda _:("workable",[
        {"title":"Marketing","url":"https://apply.workable.com/example/j/AAA/"},
        {"title":"HR Intern","url":"https://apply.workable.com/example/j/BBB/"}],2)
    scanner=lambda _:([{"title":"Marketing","url":"https://apply.workable.com/example/j/AAA/","location":"Cairo, Egypt"}],
                       "monitoring","ok")
    result=mod.compare(company,official,scanner)
    assert result["status"]=="MISMATCH"
    assert result["missing_count"]==1
    assert result["missing_jobs"][0]["title"]=="HR Intern"


def test_no_independent_collector_is_not_a_false_match():
    result=mod.compare({"name":"Example","url":"https://example.com/careers"},
                       lambda _:("html",None,None),lambda _:([], "monitoring","ok"))
    assert result["status"]=="UNVERIFIED"


def test_multilocation_duplicate_official_rows_are_not_false_missing_jobs():
    company={"name":"Multi location board","url":"https://apply.workable.com/example/"}
    official=lambda _:("workable",[
        {"title":"Accountant","url":"https://apply.workable.com/example/j/AAA/"},
        {"title":"Accountant","url":"https://apply.workable.com/example/j/AAA/"}],2)
    scanner=lambda _:([{"title":"Accountant",
                        "url":"https://apply.workable.com/example/j/AAA/",
                        "location":"Cairo, Egypt"}],"monitoring","ok")
    result=mod.compare(company,official,scanner)
    assert result["status"]=="MATCHED"
    assert result["official_duplicate_rows"]==1
    assert result["official_egypt_count"]==result["adapter_egypt_count"]==1


def test_eightfold_egypt_independent_id_listing():
    c={"name":"VOIS","url":"https://jobs.vodafone.com/careers?location=Egypt"}
    def get(url):
        assert "filter_brand=vois" in url and "location=Egypt" in url
        return {"data":{"count":2,"positions":[
            {"id":123,"name":"HR Internship","locations":["Cairo, Egypt"],
             "positionUrl":"/careers/job/123"},
            {"id":124,"name":"Marketing Intern","locations":["Dubai, UAE"],
             "positionUrl":"/careers/job/124"}
        ]}}
    kind,jobs,total=mod.raw_ats(c,get)
    assert kind=="vois_egypt" and total==2
    assert len(jobs)==1 and jobs[0]["url"].endswith("/careers/job/123")


def test_schneider_pages_two_official_result_sets():
    company={"name":"Schneider Electric",
             "url":"https://careers.se.com/Defaultlandingpage/jobs/categories"}
    calls=[]
    def get(url):
        from urllib.parse import parse_qs,urlsplit
        p=int(parse_qs(urlsplit(url).query)["page"][0]);calls.append(p)
        start=(p-1)*50
        return {"totalCount":52,"jobs":[{"data":{
            "req_id":str(i+100),"title":f"Job {i}","country_code":"EG"
        }} for i in range(start,min(start+50,52))]}
    kind,jobs,total=mod.raw_ats(company,get)
    assert kind=="schneider_egypt" and total==52
    assert len(jobs)==52 and calls==[1,2]


def test_itworx_egypt_keeps_nontech_only_from_egypt():
    company={"name":"ITWorx","url":"https://careers.itworx.com/"}
    def get(url,body):
        return {"success":True,"TotalCount":3,"AllRequisitions":[
            {"ReqId":111,"Position":"Marketing Specialist","Location":"Egypt"},
            {"ReqId":112,"Position":"Senior Engineer","Location":"UAE"},
            {"ReqId":113,"Position":"HR Officer","Location":"Giza, Egypt"}
        ]}
    _,jobs,total=mod.raw_ats(company,get)
    assert total==3 and len(jobs)==2
    assert jobs[0]["title"]=="Marketing Specialist"


def test_amazon_and_aws_scopes_distinct():
    company={"name":"AWS Egypt","url":"https://www.amazon.jobs/en/search?country=EGY"}
    def get(_):
        return {"hits":2,"jobs":[
            {"country_code":"EGY","title":"Cloud Engineer","job_path":"/en/jobs/111/cloud-engineer",
             "team":"AWS"},
            {"country_code":"EGY","title":"HR Generalist","job_path":"/en/jobs/222/hr-generalist",
             "team":"Operations"}
        ]}
    _,jobs,total=mod.raw_ats(company,get)
    assert total==2 and len(jobs)==1 and jobs[0]["title"]=="Cloud Engineer"


def test_oracle_verified_egypt_only_independent():
    company={"name":"Nokia","url":
        "https://fa-example.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs"}
    def get(_):
        return {"items":[{"TotalJobsCount":3,"requisitionList":[
            {"Id":"1","Title":"Accounting Manager","PrimaryLocationCountry":"EG","PrimaryLocation":"Cairo"},
            {"Id":"2","Title":"Software Engineer","PrimaryLocationCountry":"DE","PrimaryLocation":"Berlin"},
            {"Id":"3","Title":"UX Intern","PrimaryLocationCountry":"EG","PrimaryLocation":"Giza"}
        ]}]}
    kind,jobs,total=mod.raw_ats(company,get)
    assert kind=="oracle" and total==3 and len(jobs)==2
    assert {j["title"] for j in jobs}=={"Accounting Manager","UX Intern"}
