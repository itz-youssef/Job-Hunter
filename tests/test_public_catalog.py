"""Public job discovery must not inherit the original owner-specific filters."""
from app.custom_monitor import _enrich

def _job(title, url="https://jobs.example.com/job/12", location="Cairo, Egypt"):
    return {"id":title,"title":title,"company":"Example","url":url,
            "location":location,"description":"Job description","employment":"Full time",
            "source":"Custom Careers"}

def test_nontechnical_opening_remains_visible_but_not_personalized():
    result=_enrich(_job("Finance Analyst"))
    assert result is not None
    assert result["url"].startswith("https://")
    assert result["matched"] is False
    assert result["score"] == 0

def test_senior_opening_is_discoverable_but_not_eligible_for_email():
    result=_enrich(_job("Senior Software Engineering Manager"))
    assert result is not None
    assert result["matched"] is False

def test_invalid_application_links_are_rejected():
    assert _enrich(_job("Software Engineering Intern", "javascript:alert(1)")) is None
    assert _enrich(_job("Software Engineering Intern", "/job/12")) is None
    assert _enrich(_job("", "https://jobs.example.com/12")) is None

def test_legitimate_junior_role_retains_alert_eligibility():
    item=_job("Software Engineering Intern")
    item["employment"]="Internship"
    result=_enrich(item)
    assert result is not None
    assert result["matched"] is True
    assert result["score"] >= 8
