from app import custom_sources as cs
from app.public_feeds import workable, link_development


def test_sumerge_detected_as_workable():
    assert cs._ats("https://www.sumerge.com/careers/job-openings")[0] == "workable"
    assert cs._ats("https://apply.workable.com/sumerge-1/")[0] == "workable"


def test_workable_only_reads_egypt_roles():
    def get_json(_):
        return {"jobs": [
            {"title": "Junior Backend Engineer", "shortcode": "ABC",
             "location": {"city": "Cairo", "country": "Egypt"}, "description": "0-2 years Python"},
            {"title": "Senior Engineer", "shortcode": "DEF",
             "location": {"city": "Dubai", "country": "UAE"}},
            {"title": "Accountant", "shortcode": "GHI",
             "location": {"city": "Cairo", "country": "Egypt"}},
        ]}
    jobs = workable("Sumerge","sumerge-1",get_json,lambda x:b"",cs._structured_jobs,cs._job)
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["url"].endswith("/ABC/")


def test_link_development_only_explicit_egypt_roles():
    url="https://linkdevelopment.com/careers/opportunities/"
    html='''<a href="/careers/opportunities/junior-software-engineer-egypt/">Junior Software Engineer - Egypt</a>
    <a href="/careers/opportunities/senior-engineer-uae/">Senior Engineer - UAE</a>
    <a href="/careers/opportunities/marketing-executive-egypt/">Marketing Executive - Egypt</a>'''
    jobs=link_development("Link Development",url,lambda _:html.encode(),cs._job)
    assert len(jobs)==1
    assert jobs[0]["location"]=="Egypt"
    assert jobs[0]["title"]=="Junior Software Engineer - Egypt"
