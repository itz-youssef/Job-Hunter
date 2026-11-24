"""Source completeness regressions: fail closed on truncated official paging."""
import pytest
from app import custom_sources as cs
from app.official_job_details import parse_detail


def test_workday_scans_beyond_original_five_page_limit(monkeypatch):
    offsets=[]
    def fake_json(url, body=None):
        if url.endswith("/jobs"):
            offset=body["offset"]
            offsets.append(offset)
            size=min(20, 121-offset)
            return {"total":121, "jobPostings":[
                {"title":f"Support Analyst {n}","locationsText":"Cairo, Egypt",
                 "externalPath":f"/job/EG/ROLE_{n}"} for n in range(offset,offset+size)
            ]}
        return {"jobPostingInfo":{}}
    monkeypatch.setattr(cs,"_json",fake_json)
    jobs=cs._board_jobs("Example","https://example.wd3.myworkdayjobs.com/Example")
    assert len(jobs)==121
    assert offsets==[0,20,40,60,80,100,120]


def test_workday_small_live_count_drift_keeps_jobs_but_marks_partial(monkeypatch):
    def fake_json(url,body=None):
        if url.endswith("/jobs"):
            offset=body["offset"]
            total=33 if offset==0 else 34
            size=min(20,34-offset)
            return {"total":total,"jobPostings":[
                {"title":f"Job {n}","externalPath":f"/job/EG/ROLE_{n}"}
                for n in range(offset,offset+size)
            ]}
        return {"jobPostingInfo":{}}
    monkeypatch.setattr(cs,"_json",fake_json)
    jobs=cs._board_jobs("Example","https://example.wd3.myworkdayjobs.com/Example")
    assert len(jobs)==34
    assert all(j["source_pagination_consistency"]=="changed-during-scan" for j in jobs)


def test_workday_repeating_page_is_not_reported_complete(monkeypatch):
    def fake_json(url,body=None):
        if url.endswith("/jobs"):
            return {"total":60,"jobPostings":[
                {"title":f"Job {n}","externalPath":f"/job/EG/ROLE_{n}"}
                for n in range(20)
            ]}
        return {"jobPostingInfo":{}}
    monkeypatch.setattr(cs,"_json",fake_json)
    jobs=cs._board_jobs("Example","https://example.wd3.myworkdayjobs.com/Example")
    assert len(jobs)==20
    assert all(j["source_pagination_consistency"]=="changed-during-scan" for j in jobs)


def test_workday_more_than_budget_is_an_error_not_a_false_complete_board(monkeypatch):
    def fake_json(url,body=None):
        if url.endswith("/jobs"):
            offset=body["offset"]
            return {"total":520,"jobPostings":[
                {"title":f"Job {n}","externalPath":f"/job/EG/ROLE_{n}"}
                for n in range(offset,offset+20)
            ]}
        return {"jobPostingInfo":{}}
    monkeypatch.setattr(cs,"_json",fake_json)
    jobs=cs._board_jobs("Example","https://example.wd3.myworkdayjobs.com/Example")
    assert len(jobs)==500
    assert all(j["source_pagination_consistency"]=="changed-during-scan" for j in jobs)


def test_workday_live_zero_count_after_first_page_does_not_discard_known_jobs(monkeypatch):
    def fake_json(url,body=None):
        if url.endswith("/jobs"):
            offset=body["offset"]
            if offset:
                return {"total":0,"jobPostings":[]}
            return {"total":36,"jobPostings":[
                {"title":f"Job {i}","externalPath":f"/job/EG/ROLE_{i}"}
                for i in range(20)
            ]}
        return {"jobPostingInfo":{}}
    monkeypatch.setattr(cs,"_json",fake_json)
    monkeypatch.setattr(cs,"_safe_url",lambda _:None)
    company={"name":"Konecta Egypt","url":"https://example.wd3.myworkdayjobs.com/Example"}
    jobs,status,message=cs.scan_company(company)
    assert status=="partial"
    assert len(jobs)==20
    assert "completeness remains unverified" in message


def test_smartrecruiters_more_than_budget_is_reported_incomplete(monkeypatch):
    def fake_json(url,body=None):
        return {"totalFound":600,"content":[
            {"id":str(i),"name":f"Engineer {i}","location":{"city":"Cairo","country":"Egypt"}}
            for i in range(100)
        ]}
    monkeypatch.setattr(cs,"_json",fake_json)
    with pytest.raises(ValueError,match="page budget"):
        cs._board_jobs("Example","https://careers.smartrecruiters.com/Example")


def test_exact_title_ey_style_jobdescription_is_readable():
    title="Data Protection Officer - Risk Management - Cairo, Egypt"
    job={"title":title,"url":"https://careers.ey.com/ey/job/Cairo-Data-Protection/1455401533"}
    document="""<html><h1>Data Protection Officer - Risk Management - Cairo, Egypt</h1>
    <div class="jobdescription"><h2>Job description</h2><p>Coordinate compliance
    requirements and data protection operations for internal stakeholders.
    Document risk controls and support review of internal procedures.</p>
    <h2>Qualifications</h2><p>Experience with data protection regulations.</p>
    </div></html>"""
    result=parse_detail(job,document)
    assert result and result["source_detail_status"]=="official-job-section"
    assert "data protection operations" in result["description"]
    assert parse_detail({**job,"title":"Unrelated Job"},document) is None
