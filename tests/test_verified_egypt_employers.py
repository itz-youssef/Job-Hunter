"""Release-only tests for three independently live-verified Egypt employers."""
from app.custom_sources import _ats, _job
from app.verified_egypt_employers import adcb_egypt, fab_minds_egypt
from app.filters import relevance

def test_release_routes_only_verified_new_sources():
    assert _ats("https://www.adcb.com.eg/available-careers/")[0] == "adcb_egypt"
    assert _ats("https://www.fab-minds.com/careers/")[0] == "fab_minds_egypt"
    assert _ats("https://konectagroup.wd3.myworkdayjobs.com/Konecta")[0] == "workday"
    assert _ats("https://careers.ey.com/ey/search/?locationsearch=Egypt")[0] == "ey_egypt"

def test_adcb_extracts_real_detail_urls():
    page=b'<a href="/adcb_careers/junior-software-engineer/">Junior Software Engineer</a>'
    detail=b'<h1>Junior Software Engineer</h1><p>Python</p>'
    rows=adcb_egypt("ADCB Egypt",lambda url: page if "available-careers" in url else detail,_job)
    assert len(rows)==1 and rows[0]["title"]=="Junior Software Engineer"
    assert "/adcb_careers/" in rows[0]["url"]

def test_fab_minds_extracts_real_detail_urls():
    page=b'<a href="/careers/software-intern/">Software Intern</a>'
    detail=b'<h1>Software Intern</h1><p>Python</p>'
    rows=fab_minds_egypt("Fab Minds Egypt",lambda url: page if url.rstrip("/").endswith("careers") else detail,_job)
    assert len(rows)==1 and rows[0]["title"]=="Software Intern"

def test_no_fake_jobs_from_empty_pages():
    for adapter in (adcb_egypt, fab_minds_egypt):
        try:
            adapter("Employer", lambda url:b"<html>Careers</html>", _job)
        except ValueError:
            pass
        else:
            raise AssertionError("Unparsed career page cannot be reported as a working feed")

def test_existing_seniority_and_egypt_gate_preserved():
    early={"title":"Junior Software Engineer","location":"Cairo, Egypt",
           "description":"Python, 1 year experience"}
    senior=dict(early,title="Senior Software Engineer")
    overseas=dict(early,location="Dubai, UAE")
    assert relevance(early,{})[0]>0
    assert relevance(senior,{})[0]==0
    assert relevance(overseas,{})[0]==0

def test_registry_contains_only_three_new_employers():
    import json
    from pathlib import Path
    data=json.loads(Path("companies.json").read_text())
    assert len(data)==58
    for n in ("Konecta Egypt","ADCB Egypt","Fab Minds Egypt"):
        assert sum(c["name"]==n for c in data)==1
    for n in ("Henkel Egypt","blnk Egypt","Coca-Cola HBC Egypt"):
        assert all(c["name"]!=n for c in data)
