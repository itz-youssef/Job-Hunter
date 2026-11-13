"""Egypt expansion adapter regression tests with official source-shaped fixtures."""
import json
from app.egypt_expansion_feeds import (
    amazon_egypt,breadfast_egypt,talabat_egypt,uber_egypt_partial,
    ey_egypt,successfactors_egypt,blink22_egypt,
)
from app.custom_sources import _job


def test_talabat_two_pages_egypt_only_and_job_ids():
    def page(url):
        assert "options=252%2C845" in url
        n=1 if "page=1" in url else 2
        title="Software Engineer Internship" if n==1 else "Senior Software Engineer"
        data=f"""<html>2 result(s)<div data-jobid="{n}" class="attrax-vacancy-tile">
          <a href="/job/{title.lower().replace(' ','-')}-in-cairo-egypt-jid-{n}">{title}</a>
          Location Cairo, Egypt Brand talabat</div></html>"""
        return data.encode()
    jobs=talabat_egypt("Talabat",page,_job,max_pages=2)
    assert len(jobs)==2
    assert jobs[0]["external_id"]=="1"
    assert jobs[0]["url"].startswith("https://careers.deliveryhero.com/job/")


def test_uber_official_zero_egypt_and_verifiable_jobs():
    def empty(url):
        assert "expand=requisitionList" in url
        return json.dumps({"items":[{"TotalJobsCount":0,"requisitionList":[]}]}).encode()
    assert uber_egypt_partial("Uber Egypt",empty,_job)==[]
    def one(url):
        return json.dumps({"items":[{"TotalJobsCount":2,"requisitionList":[
            {"Id":12,"Title":"Junior Data Analyst","PrimaryLocation":"Cairo, Egypt",
             "PrimaryLocationCountry":"EG","PostedDate":"2026-11-13"},
            {"Id":11,"Title":"Senior Software Engineer","PrimaryLocation":"California, USA",
             "PrimaryLocationCountry":"US","PostedDate":"2026-11-13"}]}]}).encode()
    jobs=uber_egypt_partial("Uber Egypt",one,_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Junior Data Analyst"
    assert jobs[0]["external_id"]=="12"


def test_breadfast_portfolio_hiring_links_and_tech():
    data=b"""<html>
      <a href="/companies/breadfast/jobs/123-backend-engineer">Backend Engineer</a>
      <a href="/companies/breadfast/jobs/124-logistics-analyst">Logistics Analyst</a>
      <a href="/companies/bosta/jobs/345-platform-engineer">Platform Engineer</a>
      </html>"""
    get=lambda url:data
    full=breadfast_egypt("Breadfast",get,_job)
    tech=breadfast_egypt("Breadfast Technology",get,_job,tech_only=True)
    assert len(full)==2
    assert len(tech)==1
    assert tech[0]["title"]=="Backend Engineer"


def test_ey_successfactors_20_row_pagination():
    def get(url):
        from urllib.parse import parse_qs,urlsplit
        offset=int(parse_qs(urlsplit(url).query)["startrow"][0])
        entries=range(offset,min(21,offset+20))
        rows="".join(f"""<tr><td><a class="jobTitle-link" href="/ey/job/Cairo-Dev-{i}/1000{i:03d}/">Junior Developer {i}</a></td>
              <td>Cairo, EG</td></tr>""" for i in entries)
        return (f"<html>Results {offset+1}-{min(offset+20,21)} of 21<table>{rows}</table></html>").encode()
    jobs=ey_egypt("EY",get,_job)
    assert len(jobs)==21
    assert all("Cairo" in j["location"] for j in jobs)


def test_blink22_does_not_invent_egypt_location():
    base=b'<a href="/careers/software-engineer/">Software Engineer</a>'
    page=b'<main><h1>Software Engineer</h1>Remote opportunity; apply online</main>'
    jobs=blink22_egypt("Blink22",lambda url:base if url.rstrip("/").endswith("careers") else page,_job)
    assert jobs==[]


def test_amazon_api_eg_country_guard():
    def api(url):
        return {"hits":2,"jobs":[
          {"country_code":"EGY","title":"Junior Software Engineer","job_path":"/en/jobs/123/junior-software-engineer",
           "location":"EG, Cairo","posted_date":"2026-11-13"},
          {"country_code":"USA","title":"AI Engineer","job_path":"/en/jobs/124/ai-engineer",
           "location":"Seattle","posted_date":"2026-11-13"}]}
    jobs=amazon_egypt("Amazon Egypt",api,_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Junior Software Engineer"


def test_cib_taleo_job_titles_location_dates_not_requisition_codes():
    from app.egypt_expansion_feeds import taleo_bank_partial
    page="""<html><input type="hidden" name="initialHistory"
    value="ftlx0!|!jobsearch_processSearchInitialHistory!%24!requisitionListInterface!|!listRequisition!|!rlPager!|!
    121071!|!AI ENGINEER!|!121071!|!AI ENGINEER!|!121071!|!121071!|!121071!|!121071!|!2600028W!|!Egypt-Cairo-MERRYLAND!|!false!|!!|!Nov 12, 2026!|!Apply!|!Submission for the position%5C: AI ENGINEER - (Job Number%5C: 2600028W)"></html>"""
    jobs=taleo_bank_partial("CIB Egypt","https://cibeg.taleo.net/careersection/cib_ex/moresearch.ftl",
                            lambda _:page.encode(),_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="AI ENGINEER"
    assert jobs[0]["location"]=="Egypt, Cairo, MERRYLAND"
    assert jobs[0]["published_at"]=="2026-11-12"
    assert jobs[0]["url"].endswith("jobdetail.ftl?job=2600028W&lang=en")


def test_ey_foreign_row_in_results_not_misreported_as_incomplete():
    foreign='<tr><td><a class="jobTitle-link" href="/ey/job/Karachi-Director/999/">Director</a></td><td>Karachi, PK</td></tr>'
    egypt='<tr><td><a class="jobTitle-link" href="/ey/job/Cairo-Intern/888/">Software Engineering Intern</a></td><td>Cairo, EG</td></tr>'
    html=f"<html>Results 1-2 of 2<table>{egypt}{foreign}</table></html>"
    jobs=ey_egypt("EY Egypt",lambda _:html.encode(),_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Software Engineering Intern"
    assert "Cairo" in jobs[0]["location"]


def test_expansion_registry_no_duplicates():
    from pathlib import Path
    registry=json.loads(Path("companies.json").read_text())
    names=[x["name"].lower() for x in registry]
    assert len(names)==len(set(names))
    assert len(registry)>=55
    for name in ("EY Egypt","PwC Egypt","Blink22","Talabat Egypt","Uber Egypt","Amazon Egypt","AWS Egypt","CIB Egypt"):
        assert name.lower() in names
