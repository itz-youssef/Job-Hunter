"""Offline tests for Capgemini's employer-owned Egypt vacancy listing."""
from app.requested_employers import capgemini_egypt
from app.custom_sources import _ats, _PageParser, _job
from app.filters import relevance


def parse(document):
    parser = _PageParser()
    parser.feed(document)
    return parser.links


def test_capgemini_canonical_source_routing():
    assert _ats("https://www.capgemini.com/eg-en/careers/join-us/")[0] == "capgemini_egypt"
    assert _ats("https://careers.capgemini.com/search/")[0] == "capgemini_egypt"


def test_capgemini_egypt_links_location_and_paging():
    def get(url):
        if "startrow=0" in url:
            return b'''<a href="/job/Cairo-Junior-Software-Engineer/123456/">Junior Software Engineer</a>
                         <a href="/job/London-Senior-Engineer/777777/">Senior Engineer</a>'''
        raise AssertionError("should stop at partial last page")
    jobs = capgemini_egypt("Capgemini Egypt", get, parse, lambda *args: [], _job)
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["title"] == "Junior Software Engineer"
    assert relevance(jobs[0], {})[0] > 0


def test_capgemini_empty_or_foreign_is_not_false_success():
    import pytest
    with pytest.raises(ValueError):
        capgemini_egypt("Capgemini Egypt", lambda _: b'<a href="/job/London-Manager/111/">Manager</a>', parse, lambda *a: [], _job)


def test_deloitte_egypt_posting_is_partial_not_fabricated():
    from app.requested_employers import deloitte_middle_east_partial
    page = b'''<a href="/careersME/PipelineDetail/Graduate-Software-Engineer-Egypt/263706">Graduate Software Engineer | Egypt</a>
                <a href="/careersME/PipelineDetail/Manager-UAE/263707">Manager | UAE</a>'''
    rows = deloitte_middle_east_partial(
        "Deloitte", "https://middleeastjobs.deloitte.com/careersME/SearchJobs/",
        lambda _: page, parse, _job
    )
    assert len(rows) == 1
    assert rows[0]["location"] == "Egypt"
    assert rows[0]["url"].endswith("/263706")
    assert relevance(rows[0], {})[0] > 0
