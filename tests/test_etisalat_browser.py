from app.etisalat_browser import parse_detail
import pytest

def test_public_detail_code_and_pager():
    row=parse_detail("Job 1 out of 317\nJob Description - CRM System Analyst (260000M1)\nDescription\nMaintain systems.\nPrimary Location: Egypt-Cairo\nJob Posting: 19/Nov/2026\nApply")
    assert row["index"]==1 and row["total"]==317
    assert row["number"]=="260000M1"
    assert row["location"]=="Egypt-Cairo"
    assert row["date"]=="2026-11-19"
    assert "job=260000M1" in row["url"]

def test_no_invented_location():
    row=parse_detail("Job 1 out of 2\nJob Description - Finance Manager (260000M1)\nDescription\nOur company serves Egypt.")
    assert row["location"]==""

def test_invalid_page_rejected():
    with pytest.raises(ValueError):
        parse_detail("Job Search")
