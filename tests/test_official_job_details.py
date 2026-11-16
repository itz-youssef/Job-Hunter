"""Full-content recovery should be tied to exact original job, never site boilerplate."""
from app.official_job_details import enrich_missing,parse_detail

def make_job(title="PwC - Risk - IT Audit Senior Associate"):
    return {"title":title,"company":"PwC Egypt",
        "url":"https://careers.pwc.com/job/Cairo-PwC-Risk-IT-Audit-Senior-Associate/1454532233/",
        "description":"","published_at":""}

def test_successfactors_official_detail_section_title_guard():
    page="""<html><h1>PwC - Risk - IT Audit Senior Associate</h1>
      <div class="job-description"><h3>Responsibilities</h3>
        <p>Test IT general controls, document client information security processes,
        prepare audit working papers and collaborate with the risk assurance team.</p>
        <h3>Qualifications</h3><p>Experience with information systems and risk management.</p>
      </div></html>"""
    result=parse_detail(make_job(),page)
    assert result["source_detail_status"]=="official-job-section"
    assert "IT general controls" in result["description"]
    wrong=make_job("Junior AI Engineer")
    assert parse_detail(wrong,page) is None

def test_jobposting_structured_jsonld_requires_matching_original_title():
    j=make_job("Junior Software Engineer")
    raw="""<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"JobPosting",
       "title":"Junior Software Engineer",
       "description":"<h3>Job Requirements</h3><p>Minimum 1 year of Python development. Build backend API services, testing and deployment systems.</p>",
       "datePosted":"2026-11-08"}</script>"""
    out=parse_detail(j,raw)
    assert out["source_detail_status"]=="official-jsonld-detail"
    assert out["published"]=="2026-11-08"

def test_bounded_enrichment_only_original_urls_and_never_invents():
    j1=make_job("Junior Backend Engineer")
    j2={**make_job("Junior AI Engineer"),"url":"https://careers.pwc.com/job/Second/333"}
    j3={**make_job("Junior Frontend Engineer"),"url":"https://careers.pwc.com/job/Third/444"}
    raw=b"""<html><h1>Junior Backend Engineer</h1>
       <div class="job-description"><h2>Responsibilities</h2>
       Develop backend APIs in Python with FastAPI, maintain database integrations,
       deploy services, write unit tests and design production automation.
       <h2>Requirements</h2>One year of professional software engineering.
       </div></html>"""
    calls=[]
    def get(url):
        calls.append(url)
        return raw
    jobs=enrich_missing([j1,j2,j3],"pwc_egypt",get,limit=1)
    assert len(calls)==1
    assert "backend APIs" in jobs[0]["description"]
    assert jobs[1]["description"]==""
    assert jobs[2]["description"]==""

def test_source_kinds_without_missing_detail_are_untouched():
    j=make_job()
    calls=[]
    assert enrich_missing([j],"lever",lambda url:calls.append(url))==[j]
    assert calls==[]
