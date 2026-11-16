"""Employer-original ATS fields: avoid dropping description lists and requirements."""
from app import custom_sources as cs

def test_lever_lists_have_explicit_applicant_requirements(monkeypatch):
    board="https://jobs.lever.co/Yassir/"
    response=[{
      "text":"Junior Backend Engineer","hostedUrl":"https://jobs.lever.co/Yassir/a123",
      "createdAt":"2026-11-16T00:00:00Z",
      "descriptionPlain":"Develop Python APIs and services.",
      "categories":{"location":"Cairo, Egypt","department":"Engineering",
                    "team":"Backend","commitment":"Full-time"},
      "level":"Junior",
      "lists":[
        {"text":"Responsibilities","content":"<li>Implement REST endpoints</li>"},
        {"text":"Requirements","content":"<li>0-2 years of backend development</li><li>Python</li>"},
        {"text":"Benefits","content":"<li>Insurance</li>"}
      ]
    }]
    monkeypatch.setattr(cs,"_json",lambda _:response)
    jobs=cs._board_jobs("Yassir",board)
    assert len(jobs)==1
    job=jobs[0]
    assert "0-2 years" in job["requirements"]
    assert "Insurance" not in job["requirements"]
    assert "REST endpoints" in job["description"]
    assert job["department"]=="Engineering"
    assert job["seniority"]=="Junior"
    assert job["source_detail_status"]=="lever-public-posting"

def test_ashby_department_and_detail_source_provenance(monkeypatch):
    board="https://jobs.ashbyhq.com/thndr"
    monkeypatch.setattr(cs,"_json",lambda _:{"jobs":[{
      "title":"Junior AI Engineer","location":"Cairo Office",
      "jobUrl":"https://jobs.ashbyhq.com/thndr/123",
      "descriptionPlain":"Develop ML models.",
      "department":"Tech","team":"Applied AI",
      "employmentType":"Full-time","publishedAt":"2026-11-16"
    }]})
    jobs=cs._board_jobs("Thndr",board)
    assert len(jobs)==1
    assert jobs[0]["department"]=="Tech"
    assert jobs[0]["source_detail_status"]=="ashby-public-posting"

def test_workable_separates_requirements_from_description(monkeypatch):
    board="https://apply.workable.com/integrant/"
    response={"jobs":[{
      "title":"Junior Software Developer",
      "shortcode":"ABC123",
      "location":{"city":"Cairo","country":"Egypt"},
      "description":"Build production services in Python.",
      "requirements":"0-2 years of software development experience.",
      "department":"Engineering","experience":"Entry Level",
      "employment_type":"Full-time"
    }]}
    monkeypatch.setattr(cs,"_json",lambda _:response)
    jobs=cs._board_jobs("Integrant",board)
    assert len(jobs)==1
    assert jobs[0]["requirements"].startswith("0-2")
    assert jobs[0]["department"]=="Engineering"
    assert jobs[0]["seniority"]=="Entry Level"
    assert jobs[0]["source_detail_status"]=="workable-widget-details"
