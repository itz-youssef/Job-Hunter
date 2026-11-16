"""Offline contract tests for verified Egyptian public recruitment sources."""
from datetime import datetime, timedelta, timezone
import pytest
from app import custom_sources as cs
from app.egypt_public_feeds import telecom_egypt


def test_telecom_provider_detected():
    assert cs._ats("https://te.eg/en/web/guest/about-te/careers-and-training")[0] == "telecom_egypt"


def test_telecom_public_eg_jobs_and_expiry():
    future=(datetime.now(timezone.utc).date()+timedelta(days=5)).isoformat()
    past=(datetime.now(timezone.utc).date()-timedelta(days=5)).isoformat()
    calls=[]
    def api(url):
        calls.append(url)
        return {
            "totalCount": 3,
            "items": [
                {"id": 123, "titleEnglish": "Junior Software Engineer",
                 "locationEnglish": "Cairo, Egypt",
                 "descriptionEnglishRawText": "Python, 0-2 years experience",
                 "expiryDate": future, "dateCreated": "2026-11-01T00:00:00Z"},
                {"id": 124, "titleEnglish": "Senior Software Engineer",
                 "locationEnglish": "Cairo, Egypt", "expiryDate": future},
                {"id": 125, "titleEnglish": "Software Engineer",
                 "locationEnglish": "Cairo, Egypt", "expiryDate": past},
            ]
        }
    jobs=telecom_egypt("Telecom Egypt",api,cs._job)
    assert len(calls)==1
    assert len(jobs)==2
    assert jobs[0]["id"]=="custom-telecom-eg-123"
    assert jobs[0]["application_link_type"]=="career_list"
    from app.filters import relevance
    assert relevance(jobs[0],{})[0]>0
    assert relevance(jobs[1],{})[0]==0


def test_telecom_fails_closed_on_changed_schema():
    with pytest.raises(ValueError,match="schema"):
        telecom_egypt("Telecom Egypt",lambda _: {"error":"bad request"},cs._job)


def test_telecom_incomplete_result_detected():
    def api(url):
        return {"totalCount": 500, "items": []}
    with pytest.raises(ValueError,match="stopped"):
        telecom_egypt("Telecom Egypt",api,cs._job)



def test_siemens_software_public_api_pagination():
    from app.egypt_public_feeds import siemens_software
    assert cs._ats(
        "https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo"
    )[0] == "siemens_software"
    calls=[]
    def api(url):
        calls.append(url)
        if "page=1" in url:
            return {"jobs":[
                {"title_exact":"Junior Software Development Engineer",
                 "city_slab_exact":"new-cairo/none/egy/jobs::New Cairo, EGY",
                 "city_exact":"New Cairo",
                 "country_short_exact":"EGY", "country_exact":"Egypt",
                 "location_exact":"New Cairo, EGY",
                 "title_slug":"junior-software-development-engineer",
                 "guid":"60D405D19D6448C084990544511BC189",
                 "description":"Python, 0-2 years experience", "is_posted":True},
                {"title_exact":"Senior Software Engineer", "country_exact":"USA",
                 "guid":"ABCEFF1234567890"}],
                "pagination":{"has_more_pages":True}}
        return {"jobs": [],"pagination":{"has_more_pages":False}}
    jobs=siemens_software("Siemens",api,cs._job)
    assert len(calls)==2
    assert "businessStructures=electronic-design-automation-eda" in calls[0]
    assert "num_items=10" in calls[0]
    assert len(jobs)==1
    assert jobs[0]["url"]=="https://jobs.sw.siemens.com/new-cairo-egy/junior-software-development-engineer/60D405D19D6448C084990544511BC189/job/"
    from app.filters import relevance
    assert relevance(jobs[0],{})[0]>0


def test_siemens_missing_pagination_is_an_error():
    from app.egypt_public_feeds import siemens_software
    with pytest.raises(ValueError,match="pagination"):
        siemens_software("Siemens",lambda _: {"jobs":[]},cs._job)


def test_siemens_official_search_keeps_distinct_department_and_requirements():
    from app.egypt_public_feeds import siemens_software
    payload={"jobs":[{
      "country_exact":"Egypt","title_exact":"Junior Software Development Engineer",
      "city_exact":"Cairo","title_slug":"junior-software-development-engineer",
      "guid":"AABBCCDD00112233445566778899FF00",
      "description":"Develop Python APIs and backend services with a collaborative engineering team.",
      "qualifications":"Required: 0-2 years relevant software development experience",
      "job_family_exact":"Research & Development",
      "experience_level_exact":"Early Professional",
      "location_exact":"Cairo, Egypt"
    }],"pagination":{"has_more_pages":False}}
    jobs=siemens_software("Siemens",lambda _:payload,cs._job)
    assert len(jobs)==1
    assert jobs[0]["requirements"].startswith("Required:")
    assert jobs[0]["department"]=="Research & Development"
    assert jobs[0]["seniority"]=="Early Professional"
    assert jobs[0]["source_detail_status"] in ("ats-search","ats-summary-only")


def test_siemens_detail_jobposting_description_requires_matching_title():
    from app.egypt_public_feeds import siemens_software
    payload={"jobs":[{
      "country_exact":"Egypt","title_exact":"Software Development Engineer",
      "city_exact":"Cairo","title_slug":"software-development-engineer",
      "guid":"11223344556677889900AABBCCDDEEFF",
      "location_exact":"Cairo, Egypt"
    }],"pagination":{"has_more_pages":False}}
    html=b'''<div>Experience level: Early Professional</div>
    <script type="application/ld+json">{"@type":"JobPosting",
    "title":"Software Development Engineer",
    "description":"<p>Build APIs with Python and work on backend engineering. Junior-friendly development opportunity.</p>",
    "datePosted":"2026-11-01"}</script>'''
    jobs=siemens_software("Siemens",lambda _:payload,cs._job,lambda _:html)
    assert len(jobs)==1
    assert "Build APIs with Python" in jobs[0]["description"]
    assert jobs[0]["source_detail_status"]=="official-jsonld-detail"
    assert jobs[0]["seniority"]=="Early Professional"
