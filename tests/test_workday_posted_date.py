"""Only explicit Workday job posting date is used; start date is not publication."""
from app.sources import _workday_posting_date

def test_extract_explicit_valeo_posting_date():
    assert _workday_posting_date("Job Posting Date: 2026-09-28 Join Us !")=="2026-09-28"

def test_no_guess_when_date_missing():
    assert _workday_posting_date("Job Start Date: 2026-07-01") is None
    assert _workday_posting_date("Posted since 2 days") is None

def test_reject_invalid_or_future():
    assert _workday_posting_date("Job Posting Date: 2026-02-30") is None
    assert _workday_posting_date("Job Posting Date: 2099-01-01") is None
