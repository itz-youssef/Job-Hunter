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
