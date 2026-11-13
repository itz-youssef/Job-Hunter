"""No fake titles or Egypt locations in Breadfast Technology monitoring."""
import pytest

from app.breadfast_company_board import breadfast_technology
from app.custom_sources import _ats, _job
from app.filters import relevance


def _get(url):
    if "/jobs?q=" in url:
        return b'''
        <a data-testid="job-title-link" href="/companies/breadfast/jobs/98449465-information-technology-intern#content">Information Technology Intern</a>
        <a href="/companies/breadfast/jobs/98855990-information-technology-specialist-ii#content">Information Technology Specialist II</a>
        <a href="/companies/breadfast/jobs/99988888-logistics-specialist#content">Logistics Specialist</a>
        <a href="/companies/bosta/jobs/88877777-software-engineer#content">Software Engineer</a>
        '''
    if "98449465" in url:
        return b'<h1>Information Technology Intern</h1><main>Breadfast IT internship Cairo, Cairo Governorate, Egypt Posted on Nov 3, 2026 Technical support. 0-2 years experience. Python and Linux.</main>'
    if "98855990" in url:
        return b'<h1>Information Technology Specialist II</h1><main>Breadfast IT Full time Cairo, Egypt Posted on Nov 3, 2026 Experience managing support escalations.</main>'
    raise AssertionError(f"Unexpected source URL: {url}")


def test_breadfast_technology_finds_real_posts_and_dates():
    jobs = breadfast_technology("Breadfast Technology", _get, _job)
    assert len(jobs) == 2
    titles={job["title"] for job in jobs}
    assert titles == {"Information Technology Intern", "Information Technology Specialist II"}
    intern = next(j for j in jobs if "Intern" in j["title"])
    assert intern["location"] == "Cairo, Cairo Governorate, Egypt"
    assert intern["published_at"] == "2026-11-03"
    assert intern["url"].startswith("https://careers.4dxventures.com/companies/breadfast/jobs/")
    assert relevance(intern, {})[0] > 0


def test_breadfast_tech_skips_foreign_job_detail():
    def data(url):
        if "/jobs?q=" in url:
            return b'<a href="/companies/breadfast/jobs/77777777-backend-engineer">Backend Engineer</a>'
        return b'<main>Backend Engineer - Berlin, Germany Posted on Nov 3, 2026</main>'
    assert breadfast_technology("Breadfast Technology", data, _job) == []


def test_breadfast_tech_fails_when_all_ats_searches_inaccessible():
    def unavailable(url):
        raise TimeoutError("Read timed out")
    with pytest.raises(ValueError, match="unavailable"):
        breadfast_technology("Breadfast Technology", unavailable, _job)


def test_old_breadfast_dispatch_stays_unchanged():
    assert _ats("https://www.breadfast.com/careers/")[0] == "breadfast_egypt"
    assert _ats("https://www.breadfast.com/ar/careers_categories/technology/")[0] == "breadfast_tech"
