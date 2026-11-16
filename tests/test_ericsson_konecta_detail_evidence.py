"""Bounded original ATS detail extraction for Ericsson Eightfold and Konecta Workday."""
from app import custom_sources as cs

def test_ericsson_detail_is_requested_from_original_public_vacancy(monkeypatch):
    calls=[]
    def fake_json(url):
        return {"data":{"count":1,"positions":[
          {"id":2001,"name":"Junior Software Engineer",
           "locations":["Cairo, Egypt"],"positionUrl":"/careers/job/2001"}]}}
    def fake_bytes(url,body=None):
        calls.append(url)
        return b"""<script type="application/ld+json">
        {"@type":"JobPosting","title":"Junior Software Engineer",
         "description":"Required 1 year software development experience. Build backend APIs with Python."}
        </script>"""
    monkeypatch.setattr(cs,"_json",fake_json)
    monkeypatch.setattr(cs,"_bytes",fake_bytes)
    jobs=cs._board_jobs("Ericsson","https://jobs.ericsson.com/careers?location=Egypt")
    assert len(jobs)==1
    assert calls==["https://jobs.ericsson.com/careers/job/2001"]
    assert "1 year software development" in jobs[0]["description"]
    assert jobs[0]["source_detail_status"]=="jsonld-jobposting"

def test_konecta_workday_unlabeled_geo_still_gets_original_detail(monkeypatch):
    def fake_json(url,body=None):
        if url.endswith("/jobs"):
            return {"total":1,"jobPostings":[{
              "title":"Software Engineer",
              "locationsText":"Smart Village",
              "externalPath":"/job/eg/SWE_001",
              "postedOn":"Posted Today"
            }]}
        assert "/job/eg/SWE_001" in url
        return {"jobPostingInfo":{
          "jobDescription":"<p>Required two years developing internal applications.</p>",
          "jobFamily":"Engineering","timeType":"Full time"}}
    monkeypatch.setattr(cs,"_json",fake_json)
    jobs=cs._board_jobs("Konecta Egypt","https://konectagroup.wd3.myworkdayjobs.com/Konecta")
    assert len(jobs)==1
    assert "Required two years" in jobs[0]["description"]
    assert jobs[0]["department"]=="Engineering"
    assert jobs[0]["source_detail_status"]=="workday-official-detail"
