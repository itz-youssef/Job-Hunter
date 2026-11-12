"""IBM Egypt public feed: offline contract and relevance tests."""
import pytest
from app import custom_sources as cs
from app.employer_feeds import ibm_egypt
from app.filters import relevance


def test_ibm_detection():
    assert cs._ats("https://www.ibm.com/careers/search?")[0] == "ibm_egypt"


def test_ibm_country_and_junior_roles():
    calls = []
    def api(endpoint, body):
        calls.append((endpoint, body))
        assert body["query"] == {"bool":{"must":[{"term":{"field_keyword_05":"Egypt"}}]}}
        return {
            "hits": {
                "total": {"value": 3, "relation": "eq"},
                "hits": [
                    {"_source": {
                        "title": "Application Developer-IBM Cloud FullStack",
                        "url": "https://careers.ibm.com/careers/JobDetail?jobId=123",
                        "description": "Python FastAPI internship",
                        "field_keyword_05": "Egypt",
                        "field_keyword_19": "Giza, EG",
                        "field_keyword_18": "Internship",
                        "field_keyword_08": "Software Engineering"
                    }},
                    {"_source": {
                        "title": "Senior Software Engineer",
                        "url": "https://careers.ibm.com/careers/JobDetail?jobId=456",
                        "field_keyword_05": "Egypt",
                        "field_keyword_19": "Cairo, EG",
                        "field_keyword_18": "Professional",
                        "field_keyword_08": "Software Engineering"
                    }},
                    {"_source": {
                        "title": "Software Engineering Intern",
                        "url": "https://careers.ibm.com/careers/JobDetail?jobId=789",
                        "field_keyword_05": "United States",
                        "field_keyword_18": "Internship"
                    }}
                ]
            }
        }

    jobs = ibm_egypt("IBM", api, cs._job)
    assert len(calls) == 1
    assert len(jobs) == 2
    assert jobs[0]["id"] == "custom-ibm-123"
    assert jobs[0]["seniority"] == "Internship"
    assert relevance(jobs[0], {})[0] > 0
    assert relevance(jobs[1], {})[0] == 0


def test_ibm_rejects_broken_schema():
    with pytest.raises(ValueError, match="schema"):
        ibm_egypt("IBM", lambda *args: {"error":"bad"}, cs._job)



def test_paymob_cursor_pagination_and_country_fidelity():
    from app.employer_feeds import paymob_recruitera
    calls = []
    def api(url):
        calls.append(url)
        if len(calls) == 1:
            return {"data": [
                {"id": "100", "title": "Junior Backend Engineer",
                 "slug": "junior-backend-engineer-paymob-cairo-egypt-100",
                 "location": "Cairo, Egypt", "excerpt": "0-2 years Python",
                 "employment_type": "Full-time"},
                {"id": "101", "title": "Commercial Sales", "slug": "sales",
                 "location": "Paymob Head Office"}],
                "meta": {"found": 3, "next_cursor": "PAGE2"}}
        return {"data": [
            {"id": "102", "title": "Intern AI Engineer", "slug": "ai-intern-102",
             "location": "Giza, Egypt", "excerpt": "PyTorch"}
        ], "meta": {"found": 3, "next_cursor": None}}

    assert cs._ats("https://origin.paymob.com/en/careers")[0] == "paymob_recruitera"
    jobs = paymob_recruitera("Paymob", api, cs._job)
    assert len(jobs) == 3
    assert "cursor=PAGE2" in calls[1]
    assert jobs[0]["id"] == "custom-paymob-100"
    assert relevance(jobs[0], {})[0] > 0
    assert relevance(jobs[1], {})[0] == 0


def test_paymob_incomplete_pagination_rejected():
    from app.employer_feeds import paymob_recruitera
    with pytest.raises(ValueError, match="stopped"):
        paymob_recruitera(
            "Paymob",
            lambda _: {"data": [], "meta": {"found": 9, "next_cursor": None}},
            cs._job,
        )



def test_orange_scans_country_limited_public_results():
    from app.employer_feeds import orange_egypt
    requests = []
    def api(url, body):
        requests.append((url, body))
        assert url == "https://orange.jobs/widgets"
        assert body["selected_fields"] == {
            "country": ["EGYPT"], "companyName": ["Orange Egypt"]
        }
        if len(requests) == 1:
            return {
                "refineSearch": {
                    "totalHits": 3,
                    "data": {"jobs": [
                        {"title": "Junior Software Engineer", "jobId": "MNT-123456",
                         "city": "Cairo", "country": "EGYPT",
                         "description": "Python, 0-2 years",
                         "applyUrl": "https://www.careers-page.com/orange-eg/job/123456/apply"},
                        {"title": "Junior Software Engineer", "jobId": "MNT-123457",
                         "city": "Paris", "country": "France"},
                    ]}
                }
            }
        assert body["from"] == 2
        return {
            "refineSearch": {
                "totalHits": 3,
                "data": {"jobs": [
                    {"title": "Senior Software Engineer", "jobId": "MNT-123458",
                     "city": "Cairo", "country": "EGYPT"}
                ]}
            }
        }
    assert cs._ats("https://orange.jobs/gb/en/africa-middle-east/egypt?utm_source=chatgpt.com")[0] == "orange_egypt"
    jobs = orange_egypt("Orange Egypt", api, cs._job)
    assert len(requests) == 2
    assert len(jobs) == 2
    assert jobs[0]["id"] == "custom-orange-MNT-123456"
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert relevance(jobs[0], {})[0] > 0
    assert relevance(jobs[1], {})[0] == 0


def test_orange_incomplete_page_fails_closed():
    from app.employer_feeds import orange_egypt
    with pytest.raises(ValueError, match="incomplete"):
        orange_egypt(
            "Orange Egypt",
            lambda *args: {"refineSearch": {"totalHits": 6, "data": {"jobs": []}}},
            cs._job
        )



def test_orange_ignores_untrusted_application_redirect():
    from app.employer_feeds import orange_egypt
    def api(_url, _body):
        return {"refineSearch": {"totalHits": 1, "data": {"jobs": [{
            "title": "Junior Software Engineer",
            "jobId": "MNT-123456",
            "country": "EGYPT", "city": "Cairo",
            "description": "Python 0-2 years",
            "applyUrl": "https://malicious.example/redirect",
        }]}}}
    jobs = orange_egypt("Orange Egypt", api, cs._job)
    assert len(jobs) == 1
    assert jobs[0]["url"].startswith("https://orange.jobs/gb/en/job/MNT-123456/")


def test_paymob_invalid_record_does_not_fake_incomplete_pagination():
    from app.employer_feeds import paymob_recruitera
    data = {
        "data": [
            {"id": "123", "title": "Junior AI Engineer", "slug": "ai-123",
             "location": "Cairo, Egypt"},
            {"id": "124", "title": "Sales", "slug": ""}
        ],
        "meta": {"found": 2, "next_cursor": None},
    }
    jobs = paymob_recruitera("Paymob", lambda _: data, cs._job)
    assert len(jobs) == 1
    assert jobs[0]["id"] == "custom-paymob-123"
