"""Siemens Early Professional must qualify; management and unsupported senior titles remain excluded."""
from app.filters import relevance
from app import sources
from app.egypt_public_feeds import siemens_software
from app.custom_sources import _job


def test_siemens_early_professional_built_in_detail(monkeypatch):
    monkeypatch.setattr(sources, "cached_jobs",lambda source:{})
    html="""<a href="/en_US/externaljobs/JobDetail/527985">Software Development Engineer</a>"""
    detail="""<div class="article__content__view__field"><span class="article__content__view__field__label">Job ID</span>
       <span class="article__content__view__field__value">527985</span></div>
       <div class="article__content__view__field"><span class="article__content__view__field__label">Posted since</span>
       <span class="article__content__view__field__value">03-Nov-2026</span></div>
       <div class="article__content__view__field"><span class="article__content__view__field__label">Experience level</span>
       <span class="article__content__view__field__value">Early Professional</span></div>
       <div class="article__content__view__field"><span class="article__content__view__field__label">Location(s)</span>
       <span class="article__content__view__field__value">Cairo - Al Qahirah - Egypt</span></div>
       <h3 class="section__header__text__title">Software Development Engineer</h3>
       <div class="tf_replaceFieldVideoTokens">C++ Python, software programming, OOP algorithms, B.Sc in Computer Science.</div>"""
    class Response:
        def __init__(self,text):self.text=text
    class Client:
        def get(self,url):return Response(html if "SearchJobs" in url else detail)
    jobs=sources.siemens({"id":23},Client())
    assert len(jobs)==1
    role=jobs[0]
    assert role["external_id"]=="527985"
    assert role["published"]=="2026-11-03"
    assert role["seniority"]=="Early Professional"
    assert relevance(role,{})[0]>=8


def test_cached_siemens_excluded_technical_jobs_revisited(monkeypatch):
    old={"external_id":"527985","title":"Software Development Engineer",
         "score":0,"description":"Software tools, Python",
         "location":"Cairo, Egypt","url":"https://jobs.siemens.com/en_US/externaljobs/JobDetail/527985"}
    monkeypatch.setattr(sources, "cached_jobs",lambda source:{"527985":old})
    calls=[]
    class R:
        def __init__(self,text):self.text=text
    class C:
        def get(self,url):
            calls.append(url)
            if "SearchJobs" in url:return R('<a href="/en_US/externaljobs/JobDetail/527985">Role</a>')
            return R("""<div class="article__content__view__field"><span class="article__content__view__field__label">Job ID</span><span class="article__content__view__field__value">527985</span></div>
            <div class="article__content__view__field"><span class="article__content__view__field__label">Experience level</span><span class="article__content__view__field__value">Early Professional</span></div>
            <h3 class="section__header__text__title">Software Development Engineer</h3>
            <div class="tf_replaceFieldVideoTokens">C++ Python programming</div>""")
    jobs=sources.siemens({"id":23},C())
    assert len(calls)==2
    assert "Employer career level: Early Professional" in jobs[0]["description"]
    assert relevance(jobs[0],{})[0]>=8


def test_siemens_software_api_early_level_and_official_detail():
    responses={"jobs":[{
      "country_exact":"Egypt","title_exact":"Software Development Engineer",
      "city_exact":"Cairo","title_slug":"software-development-engineer",
      "guid":"468CCCC0ACCA4234A22D4061A54BE539",
      "location_exact":"Cairo, Egypt",
      "date_new":"2026-11-03"
    }],"pagination":{"has_more_pages":False}}
    hits=[]
    def detail(url):
        hits.append(url)
        return b"<div>Experience level: Early Professional</div>"
    jobs=siemens_software("Siemens",lambda _:responses,_job,detail)
    assert len(jobs)==1
    assert hits and "/software-development-engineer/" in hits[0]
    assert jobs[0]["seniority"]=="Early Professional"
    assert relevance(jobs[0],{})[0]>=8


def test_siemens_manager_still_excluded():
    base={"location":"Cairo, Egypt","description":"Employer career level: Early Professional. Python"}
    for title in ("Software Engineering Manager","Senior AI Engineer","Lead Software Engineer"):
        assert relevance({**base,"title":title}, {})[0]==0


def test_siemens_unverified_engineering_title_still_excluded():
    score,_=relevance({"title":"Software Development Engineer",
       "location":"Cairo, Egypt","description":"C++ and Python programming"}, {})
    assert score==0
