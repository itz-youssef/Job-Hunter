"""Live-source-shaped fixtures for isolated weak-employer adapters."""
import json
import pytest

from app.custom_sources import _ats, _job
from app.filters import relevance
from app.weak_employer_adapters import blink22_listings, sap_egypt, _rsc_job_arrays


def test_blink22_all_16_official_job_links_are_captured_without_fake_egypt():
    titles = [
        "Software Engineer", "Intermediate UI/UX Designer",
        "Mobile Software Engineer", "People HR Operations Specialist",
        "Senior Product Manager", "QA Engineer",
        "Digital Marketing Specialist", "Senior Backend Engineer",
        "UI/UX Design Intern", "HR Intern", "Junior Accountant",
        "Growth Marketer", "Software Engineering Intern",
        "Junior UI/UX Designer", "Ads Specialist", "Motion Graphics Designer",
    ]
    from re import sub
    anchors = "".join(
        f'<a href="/careers/{sub(r"[^a-z0-9]+", "-",t.lower()).strip("-")}/">{t}</a>'
        for t in titles
    ).encode()
    page = b"<main><h1>Software Engineer</h1><p>Remote work worldwide</p></main>"
    jobs = blink22_listings(
        "Blink22", lambda url: anchors if url.endswith("/careers/") else page,
        _job,
    )
    assert len(jobs) == 16
    assert len({x["url"] for x in jobs}) == 16
    assert all(not j["location"] for j in jobs)
    assert all(relevance(j, {})[0] == 0 for j in jobs)


def test_blink22_role_location_is_only_taken_from_detail():
    root = b'<a href="/careers/software-engineering-intern/">Software Engineering Intern</a>'
    details = b'<main><h1>Software Engineering Intern</h1><p>Job Location: Alexandria</p><p>Python, AI APIs, 0-2 years experience</p></main>'
    jobs = blink22_listings("Blink22", lambda u: root if u.endswith("/careers/") else details, _job)
    assert len(jobs) == 1
    assert jobs[0]["location"] == "Alexandria, Egypt"
    assert relevance(jobs[0], {})[0] > 0


def test_blink22_never_treats_footer_office_as_job_location():
    root = b'<a href="/careers/senior-backend-engineer/">Senior Backend Engineer</a>'
    details = b'<main><h1>Senior Backend Engineer</h1></main><footer>Egypt Alexandria office, Dubai UAE</footer>'
    job = blink22_listings("Blink22", lambda u: root if u.endswith("/careers/") else details, _job)[0]
    assert job["location"] == ""
    assert relevance(job, {})[0] == 0


def test_blink22_empty_live_board_fails_closed():
    with pytest.raises(ValueError, match="vacancy details"):
        blink22_listings("Blink22", lambda u:b"<main>Careers</main>", _job)


def _sap_fixture(jobs, pages=1):
    payload = '64:[["$","$Lbc",null,{"jobs":' + json.dumps(jobs) + (
        ',"totalPages":' + str(pages) + ',"totalJobs":' + str(len(jobs)) + '}]]'
    )
    return ('<html><script>self.__next_f.push([1,' + json.dumps(payload) +
            '])</script></html>').encode()


def test_sap_streaming_nextjs_decodes_verified_cairo_and_published_timestamp():
    rows = [
        {"id": "7440001", "title": "Software Engineering Intern",
         "url": "/en/jobs/7440001/software-engineering-intern/",
         "locations": "Cairo, Egypt", "displayDate": "2026-11-13T02:12:03Z",
         "teams": "Software Engineering", "contractType": "Internship"},
        {"id": "7440002", "title": "Senior AI Engineer",
         "url": "/en/jobs/7440002/senior-ai-engineer/",
         "locations": "Berlin, Germany", "displayDate": "2026-11-12T11:00:00Z"},
    ]
    content = _sap_fixture(rows)
    assert _rsc_job_arrays(content.decode())[0] == rows
    jobs = sap_egypt("SAP", lambda url:content, _job)
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Software Engineering Intern"
    assert jobs[0]["location"] == "Cairo, Egypt"
    assert jobs[0]["published_at"] == "2026-11-13T02:12:03Z"
    assert relevance(jobs[0], {})[0] > 0


def test_sap_empty_or_changed_payload_not_reported_healthy():
    with pytest.raises(ValueError, match="payload unavailable"):
        sap_egypt("SAP", lambda url:b"<html>Cloudflare blocked</html>", _job)


def test_sap_and_blink22_are_routed_without_touching_old_adapters():
    assert _ats("https://jobs.sap.com/en/jobs/?location=Cairo")[0] == "sap_cairo"
    assert _ats("https://blink22.com/careers/")[0] == "blink22_egypt"
    assert _ats("https://careers.ey.com/ey/search/?locationsearch=Egypt")[0] == "ey_egypt"
