"""Offline tests for Capgemini's employer-owned Egypt vacancy listing."""
from app.requested_employers import capgemini_egypt
from app.custom_sources import _ats, _PageParser, _job
from app.filters import relevance


def parse(document):
    parser = _PageParser()
    parser.feed(document)
    return parser.links


def test_capgemini_canonical_source_routing():
    assert _ats("https://www.capgemini.com/eg-en/careers/join-us/")[0] == "capgemini_egypt"
    assert _ats("https://careers.capgemini.com/search/")[0] == "capgemini_egypt"


def test_capgemini_egypt_links_location_and_paging():
    def get(url):
        if "startrow=0" in url:
            return b'''<a href="/job/Cairo-Junior-Software-Engineer/123456/">Junior Software Engineer</a>
                         <a href="/job/London-Senior-Engineer/777777/">Senior Engineer</a>'''
        raise AssertionError("should stop at partial last page")
    jobs = capgemini_egypt("Capgemini Egypt", get, parse, lambda *args: [], _job)
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["title"] == "Junior Software Engineer"
    assert relevance(jobs[0], {})[0] > 0


def test_capgemini_empty_or_foreign_is_not_false_success():
    import pytest
    with pytest.raises(ValueError):
        capgemini_egypt("Capgemini Egypt", lambda _: b'<a href="/job/London-Manager/111/">Manager</a>', parse, lambda *a: [], _job)


def test_deloitte_egypt_posting_is_partial_not_fabricated():
    from app.requested_employers import deloitte_middle_east_partial
    page = b'''<a href="/careersME/PipelineDetail/Graduate-Software-Engineer-Egypt/263706">Graduate Software Engineer | Egypt</a>
                <a href="/careersME/PipelineDetail/Manager-UAE/263707">Manager | UAE</a>'''
    rows = deloitte_middle_east_partial(
        "Deloitte", "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
        lambda _: page, parse, _job
    )
    assert len(rows) == 1
    assert rows[0]["location"] == "Egypt"
    assert rows[0]["url"].endswith("/263706")
    assert relevance(rows[0], {})[0] > 0


def test_capgemini_api_complete_pagination_and_descriptions():
    from app.requested_employers import capgemini_egypt_api
    def fetch(url):
        assert "country_code=eg-en" in url
        return {"total": 2, "data": [
            {"title":"Junior Software Engineer", "country_code":"en-eg",
             "location":"Cairo", "experience_level":"Students/Graduates",
             "description_stripped":"Python 0-2 years experience",
             "apply_job_url":"https://careers.capgemini.com/job/Cairo-Junior-Software-Engineer/123/?utm=one"},
            {"title":"AI Intern", "country_code":"en-eg",
             "location":"Giza", "experience_level":"Students/Graduates",
             "description_stripped":"PyTorch internship",
             "apply_job_url":"https://careers.capgemini.com/job/Giza-AI-Intern/124/?utm=two"}
        ]}
    rows=capgemini_egypt_api("Capgemini Egypt",fetch,_job)
    assert len(rows)==2
    assert rows[0]["url"].endswith("/123/")
    assert rows[0]["location"]=="Cairo, Egypt"
    assert rows[0]["seniority"]=="Students/Graduates"
    assert all(relevance(j,{})[0]>0 for j in rows)


def test_dxc_egypt_jsonp_scoped_and_official():
    import json
    from app.requested_employers import dxc_egypt
    def fetch(url):
        assert "primary_country%3AEG" in url
        payload={"totalHits":2,"queryResult":[
            {"title":"Junior Software Engineer","primary_country":"EG","primary_city":"Cairo",
             "description":"<p>0-2 years Python</p>","url":"https://careers.dxc.com/job/123/junior-software-engineer-cairo-eg/"},
            {"title":"AI Intern","primary_country":"EG","primary_city":"Giza",
             "description":"<p>PyTorch intern</p>","url":"https://careers.dxc.com/job/124/ai-intern-giza-eg/"}
        ]}
        return ("CWS.jobs.jobCallback("+json.dumps(payload)+")").encode()
    rows=dxc_egypt("DXC Technology",fetch,_job)
    assert len(rows)==2
    assert rows[0]["location"]=="Cairo, Egypt"
    assert rows[0]["url"].startswith("https://careers.dxc.com/job/")
    assert all(relevance(j,{})[0]>0 for j in rows)
