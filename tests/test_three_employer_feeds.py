"""Public VOIS, Ericsson and Fawry adapter regression tests (offline)."""
import json
from urllib.parse import parse_qs, urlsplit
from app import custom_sources as cs
from app.three_employer_feeds import eightfold_egypt, fawry_public_partial


def test_routing():
    assert cs._ats("https://jobs.vodafone.com/careers?location=Egypt")[0] == "vois_egypt"
    assert cs._ats("https://jobs.ericsson.com/careers?location=egypt")[0] == "ericsson_egypt"
    assert cs._ats("https://www.fawry.com/jobs/")[0] == "fawry_partial"


def test_vois_paging_egypt_only_and_stable_links():
    calls = []
    def fake_get(url):
        query = parse_qs(urlsplit(url).query)
        assert query["domain"] == ["vodafone.com"]
        assert query["filter_brand"] == ["vois"]
        start = int(query["start"][0])
        calls.append(start)
        rows = [{"id": 600+i, "name": "VOIS EG Work Experience Programme 2027 - Technology",
                 "locations": ["Egypt"], "postedTs": 1794500000,
                 "positionUrl": f"/careers/job/{600+i}"} for i in range(start,start+10)]
        if start == 10:
            rows = [{"id": 610, "name": "VOIS Software Intern",
                     "locations": ["Giza, Egypt"],"positionUrl":"/careers/job/610"},
                    {"id": 611, "name": "VOIS Senior Manager",
                     "locations": ["London, UK"],"positionUrl":"/careers/job/611"}]
        return {"data":{"positions":rows,"count":12}}
    jobs = eightfold_egypt("VOIS","jobs.vodafone.com","vodafone.com",fake_get,cs._job,vois=True)
    assert calls == [0,10]
    assert len(jobs) == 11
    assert all("egypt" in j["location"].lower() for j in jobs)
    assert len({j["id"] for j in jobs}) == len(jobs)
    assert all(j["url"].startswith("https://jobs.vodafone.com/careers/job/") for j in jobs)


def test_ericsson_multi_country_location():
    rows = [
        {"id": 300,"name":"Junior Software Engineer",
         "locations":["Riyadh, Saudi Arabia","Smart Village,Cairo,Egypt"],
         "positionUrl":"/careers/job/300"},
        {"id": 301,"name":"Senior Engineer",
         "locations":["London, UK"],"positionUrl":"/careers/job/301"},
    ]
    jobs=eightfold_egypt("Ericsson","jobs.ericsson.com","ericsson.com",
                          lambda _:{"data":{"positions":rows,"count":2}},cs._job)
    assert len(jobs)==1
    assert jobs[0]["location"]=="Smart Village,Cairo,Egypt"


def test_eightfold_incomplete_paging_is_not_success():
    import pytest
    with pytest.raises(ValueError):
        eightfold_egypt("Ericsson","jobs.ericsson.com","ericsson.com",
                        lambda _:{"data":{"positions":[],"count":12}},cs._job)


def test_fawry_index_is_partial_and_preserves_dates():
    source = b'''<a href="https://www.fawry.com/?post_type=job_listing&amp;p=38691">
      Senior Java Software Engineer Anywhere Posted on November 3, 2025</a>
      <a href="https://www.fawry.com/?post_type=job_listing&amp;p=38694">
      Operations Specialist Anywhere Posted on November 3, 2025</a>'''
    jobs=fawry_public_partial("Fawry",lambda _:source,cs._job)
    assert len(jobs)==1
    assert jobs[0]["published_at"]=="2025-11-03"
    assert jobs[0]["location"]=="Anywhere"
    assert jobs[0]["url"].startswith("https://www.fawry.com/")
