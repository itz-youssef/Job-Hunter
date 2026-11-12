"""Regression tests for public Oracle HCM job board and source discovery."""
from urllib.parse import parse_qs, urlparse
from app.oracle_adapter import supports, scan
from app import custom_sources as cs

URL = "https://fa-example.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs"

def test_oracle_url_recognition():
    assert supports(URL)
    assert cs._ats(URL)[0] == "oracle"
    assert not supports("https://www.nokia.com/careers/")
    assert not supports("https://example.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs")

def test_oracle_egypt_jobs(monkeypatch):
    requests = []
    def get_json(url):
        requests.append(url)
        qs = parse_qs(urlparse(url).query)
        assert "siteNumber=CX_1" in qs["finder"][0]
        if "recruitingCEJobRequisitionDetails" in url:
            return {"items": [{"ExternalDescriptionStr": "0-2 years Python and PyTorch"}]}
        return {"items": [{"TotalJobsCount": 3, "requisitionList": [
            {"Id": "a1", "Title": "Junior Software Engineer", "PrimaryLocation": "Cairo, Egypt", "PrimaryLocationCountry": "EG"},
            {"Id": "a2", "Title": "Software Engineer", "PrimaryLocation": "Berlin, Germany", "PrimaryLocationCountry": "DE"},
            {"Id": "a3", "Title": "Marketing Coordinator", "PrimaryLocation": "Cairo, Egypt", "PrimaryLocationCountry": "EG"},
        ]}]}
    rows = scan("Test", URL, get_json, cs._job)
    assert len(rows) == 1
    assert rows[0]["title"] == "Junior Software Engineer"
    assert rows[0]["description"] == "0-2 years Python and PyTorch"
    assert rows[0]["url"].endswith("/sites/CX_1/job/a1")
    assert len(requests) == 2

def test_oracle_empty_feed():
    assert scan("Test", URL,
        lambda _: {"items": [{"requisitionList": [], "TotalJobsCount": 0}]},
        cs._job) == []

def test_discovery_prefers_linked_board_over_single_posting(monkeypatch):
    index = "https://example.com/careers"
    board = "https://jobs.ashbyhq.com/example"
    html = '<a href="' + board + '">Jobs</a>'
    monkeypatch.setattr(cs, "_bytes", lambda _: html.encode())
    monkeypatch.setattr(cs, "_structured_jobs", lambda *args: [
        cs._job("Example", "Junior Software Engineer", "Cairo, Egypt",
                "https://example.com/job/featured")])
    monkeypatch.setattr(cs, "_board_jobs", lambda *args: [
        cs._job("Example", "Junior AI Engineer", "Giza, Egypt",
                "https://jobs.ashbyhq.com/example/second")])
    jobs, status, msg = cs._discover("Example", index)
    assert status == "monitoring"
    assert len(jobs) == 2
    assert "linked boards" in msg

def test_single_featured_job_is_partial_not_full_monitoring(monkeypatch):
    monkeypatch.setattr(cs, "_bytes", lambda _: b"<html></html>")
    monkeypatch.setattr(cs, "_structured_jobs", lambda *args: [
        cs._job("Example", "Junior Software Engineer", "Cairo, Egypt",
                "https://example.com/job/featured")])
    jobs, status, msg = cs._discover("Example", "https://example.com/careers")
    assert len(jobs) == 1
    assert status == "partial"
    assert "no complete job feed" in msg
