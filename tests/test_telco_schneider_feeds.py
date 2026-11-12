"""Offline contracts: official Jibe, Taleo, inDrive and expansion registry."""
import json
from app import custom_sources as cs
from app.telco_schneider_feeds import schneider_egypt, etisalat_taleo_partial, indrive_egypt_partial

def test_route_identification():
    assert cs._ats("https://careers.se.com/Defaultlandingpage/jobs/categories?lang=en-US")[0]=="schneider_egypt"
    assert cs._ats("https://www.eand.com/ar/careers/careers.html")[0]=="etisalat_egypt"
    assert cs._ats("https://etisalatmisr.taleo.net/careersection/ex/joblist.ftl")[0]=="etisalat_egypt"
    assert cs._ats("https://careers.indrive.com/vacancies/?country=Egypt")[0]=="indrive_egypt"

def test_jibe_egypt_only_complete_and_stable():
    def get(url):
        assert "/api/jobs?location=Egypt" in url
        return {"jobs":[
            {"data":{"req_id":"123","title":"Junior AI Engineer","country_code":"EG","full_location":"New Cairo, Egypt","description":"Python AI"}},
            {"data":{"req_id":"124","title":"Internship Software","country_code":"EG","short_location":"Cairo, Egypt"}},
            {"data":{"req_id":"125","title":"Engineer","country_code":"DE","full_location":"Berlin, Germany"}}
        ],"totalCount":3}
    jobs=schneider_egypt("Schneider Electric",get,cs._job)
    assert len(jobs)==2
    assert jobs[0]["url"]=="https://careers.se.com/jobs/123?lang=en-US"
    assert jobs[0]["id"]=="custom-schneider-123"

def test_jibe_incomplete_fails():
    import pytest
    with pytest.raises(ValueError):
        schneider_egypt("Schneider Electric",lambda _:{"jobs":[],"totalCount":7},cs._job)

def test_taleo_first_page_verified_job_numbers():
    html=('<div>requisitionListInterface</div><script>var _ftl = {'
          "'260012','Junior Software Developer','260012','Junior Software Developer',"
          "'','12/Nov/2026','Apply','Apply for this position (Junior Software Developer)',"
          "'Submission for the position: Junior Software Developer - (Job Number: 260002GT)'"
          '};</script>')
    jobs=etisalat_taleo_partial("e& / Etisalat",lambda _:html.encode(),cs._job)
    assert len(jobs)==1
    assert jobs[0]["url"].endswith("jobdetail.ftl?job=260002GT&lang=en")
    assert jobs[0]["id"]=="custom-etisalat-260012"

def test_taleo_without_ids_fails():
    import pytest
    with pytest.raises(ValueError):
        etisalat_taleo_partial("Etisalat",lambda _:b"requisitionListInterface broken",cs._job)

def test_indrive_country_cards_only():
    doc=b'''<a href="https://indrive.pinpointhq.com/en/postings/c24f7a18-ad17-4c0b-aceb-8d89005a7321">Middle ML Engineer (Computer Vision) Hybrid - Full Time - Technology Egypt</a>
        <a href="https://indrive.pinpointhq.com/en/postings/e0f9f279-25b5-4860-a667-54c6618cbcc5">Senior Product Manager Hybrid - Full Time - Technology UAE</a>'''
    jobs=indrive_egypt_partial("inDrive",lambda _:doc,cs._job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Middle ML Engineer (Computer Vision)"
    assert jobs[0]["location"]=="Egypt"

def test_added_registry_unique():
    from pathlib import Path
    companies=json.loads(Path("companies.json").read_text())
    assert len(companies)>=45
    names=[x["name"] for x in companies]
    assert len(names)==len(set(names))
    assert all(x in names for x in ("Yassir","Integrant","inDrive","Incorta","SOUM","robusta / RTG"))
