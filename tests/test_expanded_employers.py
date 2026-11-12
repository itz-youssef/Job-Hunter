"""Offline regression tests for verified employer listing adapters."""
import pytest
from app.custom_sources import _ats, _job
from app.expanded_employers import luxoft_egypt, deloitte_egypt_partial, link_development_ajax

def test_routes():
    assert _ats("https://career.luxoft.com/locations/egypt")[0]=="luxoft_egypt"
    assert _ats("https://linkdevelopment.com/careers/opportunities/")[0]=="linkdevelopment"
    assert _ats("https://middleeastjobs.deloitte.com/careersME/SearchJobs/")[0]=="deloitte_partial"

def test_luxoft_egypt_only_verified_links():
    html=b'''<a href="/jobs/junior-ai-engineer-1234">Junior AI Engineer Python Egypt Egypt</a>
       <a href="/jobs/senior-swe-1235">Senior SWE India India</a>'''
    rows=luxoft_egypt("Luxoft Egypt",lambda _:html,_job)
    assert len(rows)==1
    assert rows[0]["url"]=="https://career.luxoft.com/jobs/junior-ai-engineer-1234"
    assert rows[0]["location"]=="Egypt"

def test_luxoft_rejects_foreign_only():
    with pytest.raises(ValueError):
        luxoft_egypt("Luxoft Egypt",lambda _:b'<a href="/jobs/tester-5555">Tester India</a>',_job)

def test_deloitte_pages_and_egypt_filter():
    pages=[]
    def fetch(url):
        pages.append(url)
        if "pipelineOffset=0" in url:
            return b'''<a href="/careersME/PipelineDetail/Junior-AI-Engineer-Cairo-Egypt/12345">Junior AI Engineer - Cairo, Egypt</a>
                        <a href="/careersME/SearchJobs/?pipelineRecordsPerPage=6&amp;pipelineOffset=6">Next &gt;&gt;</a>'''
        return b'''<a href="/careersME/PipelineDetail/Senior-Consultant-UAE/12347">Senior Consultant UAE</a>
                    <a href="/careersME/PipelineDetail/Software-Intern-Cairo-Egypt/12346">Software Intern Cairo Egypt</a>'''
    rows=deloitte_egypt_partial("Deloitte",fetch,_job)
    assert len(rows)==2
    assert len(pages)==2
    assert all(j["location"]=="Egypt" for j in rows)

def test_link_ajax_complete_pages_and_real_urls():
    first=b'''<input id="careers_nonce" name="careers_nonce" value="testnonce" />'''
    seen=[]
    def post(_,data):
        seen.append(data)
        if data["current_page"]=="1":
            return b'''<a href="https://linkdevelopment.com/careers/opportunities/junior-ai-engineer-egypt/">Junior AI Engineer Egypt</a><script>ajax_careers.latest_page = 2</script>'''
        return b'''<a href="https://linkdevelopment.com/careers/opportunities/software-intern-egypt/">Software Intern Egypt</a><script>ajax_careers.latest_page = 2</script>'''
    rows=link_development_ajax("Link Development",lambda _:first,_job,post)
    assert len(rows)==2
    assert seen[0]["query_data"].endswith("testnonce")
    assert [x["current_page"] for x in seen]==["1","2"]

def test_link_ajax_detects_incomplete_pages():
    first=b'<input id="careers_nonce" name="careers_nonce" value="token" />'
    with pytest.raises(ValueError):
        link_development_ajax("Link Development",lambda _:first,_job,
                              lambda endpoint,data:b'<script>ajax_careers.latest_page = 2</script>')
