"""Isolated regression fixtures: no production histories or SMTP changed."""
from app.egypt_extra_feeds import blnk_zenats, henkel_egypt
from app.custom_sources import _ats, _job

def test_new_sources_routed_without_changing_old():
    assert _ats("https://blnk.zenats.com/en/careers_page")[0] == "blnk_zenats"
    assert _ats("https://www.henkel.com/careers/find-your-job-apply")[0] == "henkel_egypt"
    assert _ats("https://careers.ey.com/ey/search/?locationsearch=Egypt")[0] == "ey_egypt"
    assert _ats("https://www.breadfast.com/ar/careers_categories/technology/")[0] == "breadfast_tech"

def test_blnk_posted_date_and_egypt_location():
    index=b'<a href="https://app.zenats.com/en/public_job/h-yYjlSnvXWBj7ZbFSu-ng">Backend Engineer - Django</a>'
    job=b'<h1>Backend Engineer - Django</h1><div>Posted on: Sep 27, 2026</div><p>Location: Cairo</p>'
    rows=blnk_zenats("blnk Egypt",lambda url:index if "careers_page" in url else job,_job)
    assert len(rows)==1
    assert rows[0]["published_at"]=="2026-09-27"
    assert rows[0]["location"]=="Cairo, Egypt"

def test_blnk_cannot_invent_location():
    index=b'<a href="https://app.zenats.com/en/public_job/abc">Software Engineer</a>'
    job=b'<h1>Software Engineer</h1><p>Our headquarters are in Egypt, remote worldwide</p>'
    assert blnk_zenats("blnk Egypt",lambda url:index if "careers_page" in url else job,_job)==[]

def test_henkel_only_explicit_egypt_jobs():
    index=b'<a href="/careers/find-your-job-apply/2182732-2182732">AI Engineer</a><a href="/careers/find-your-job-apply/99-99">AI Director</a>'
    egypt=b'<h1>AI Engineer</h1><p>Global Business Solutions+ IT Egypt Full Time Regular</p>'
    foreign=b'<h1>AI Director</h1><p>Germany Full Time Regular</p>'
    rows=henkel_egypt("Henkel Egypt",lambda url:index if url.endswith("find-your-job-apply") else (egypt if "2182732" in url else foreign),_job)
    assert len(rows)==1
    assert rows[0]["title"]=="AI Engineer"

def test_missing_live_board_is_error_not_success():
    try:
        blnk_zenats("blnk Egypt",lambda url:b'<html>JavaScript required</html>',_job)
    except ValueError as exc:
        assert "did not expose" in str(exc)
    else:
        raise AssertionError("Dynamic boards must not be marked healthy")

def test_blnk_location_and_date_read_from_listing_row():
    index=b'''<table><tr><td><a href="https://app.zenats.com/en/public_job/abc">Junior Backend Engineer</a></td><td>Cairo</td><td>Nov 12, 2026</td></tr></table>'''
    detail=b'<h1>Junior Backend Engineer</h1><p>Python, Django and REST APIs</p>'
    rows=blnk_zenats("blnk Egypt",lambda url:index if "careers_page" in url else detail,_job)
    assert len(rows)==1
    assert rows[0]["location"]=="Cairo, Egypt"
    assert rows[0]["published_at"]=="2026-11-12"

def test_adcb_collects_actual_job_detail_and_rejects_generic_apply():
    from app.egypt_extra_feeds import adcb_egypt
    listing=b'<a href="/adcb_careers/junior-software-engineer/">Junior Software Engineer</a><a href="/about-us/careers/apply-now/?id=1">Apply</a>'
    detail=b'<main><h1>Junior Software Engineer</h1><p>Python graduate programme</p></main>'
    jobs=adcb_egypt("ADCB Egypt",lambda url:listing if "available-careers" in url else detail,_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Junior Software Engineer"
    assert "/adcb_careers/" in jobs[0]["url"]

def test_fab_minds_collects_job_pages_not_marketing_links():
    from app.egypt_extra_feeds import fab_minds_egypt
    listing=b'<a href="/careers/junior-software-developer/">Junior Software Developer</a><a href="/careers/">Careers</a>'
    detail=b'<h1>Junior Software Developer</h1><p>Python and SQL</p>'
    jobs=fab_minds_egypt("Fab Minds Egypt",lambda url:listing if url.rstrip("/").endswith("careers") else detail,_job)
    assert len(jobs)==1
    assert jobs[0]["title"]=="Junior Software Developer"

def test_adib_konecta_use_existing_supported_ats():
    from app.custom_sources import _ats
    assert _ats("https://adibegypt.taleo.net/careersection/ex/jobsearch.ftl?lang=en")[0]=="adib_egypt"
    kind, _ = _ats("https://konectagroup.wd3.myworkdayjobs.com/Konecta")
    assert kind=="workday"
