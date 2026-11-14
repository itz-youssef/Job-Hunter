"""Regression tests for employer evidence vs historical owner-only 0–2y score."""
from app.filters import relevance, required_years
from app.custom_monitor import _enrich

def job(title="Software Development Engineer", *, description="", seniority="", employment="Full time"):
    return {
        "title": title, "company": "Example",
        "url": "https://careers.example.com/role/123",
        "location": "Cairo, Egypt", "description": description,
        "seniority": seniority, "employment": employment,
    }

def test_entry_level_ats_must_be_recognized_without_exact_title_junior():
    for level in ("Entry Level", "Early Professional", "Graduate", "Associate", "Fresher"):
        score, reasons = relevance(job(seniority=level, description="Build APIs"), {})
        assert score >= 8, (level, reasons)

def test_preferred_experience_does_not_become_required():
    for desc in (
        "3+ years of experience preferred",
        "Minimum 4 years of experience preferred; entry-level candidates encouraged",
        "Nice to have: 5 years of experience",
        "Our company has 12 years of experience",
    ):
        assert required_years(desc) is None, desc
        score, reasons = relevance(job(seniority="Entry Level", description=desc), {})
        assert score >= 8, reasons

def test_true_required_over_two_years_excluded_even_with_entry_level():
    for desc in (
        "Minimum 4 years of experience",
        "Requires 3 years of professional experience",
        "5 years of experience required",
    ):
        assert required_years(desc) > 2
        assert relevance(job(seniority="Entry Level", description=desc), {})[0] == 0

def test_title_senior_remains_excluded_for_old_early_career_scoring():
    assert relevance(job("Senior Software Engineer", seniority="Entry Level"), {})[0] == 0

def test_management_trainee_and_associate_product_manager_not_rejected_just_for_manager():
    assert relevance(job("Graduate Management Trainee", employment="Internship"), {})[0] >= 8
    assert relevance(job("Associate Software Engineering Manager", seniority="Entry Level"), {})[0] >= 8

def test_public_catalog_keeps_even_uncertain_entries_without_false_eligibility():
    item = _enrich(job(description="Experience not specified"))
    assert item and item["matched"] is False
    assert item["url"].startswith("https://")
    assert item["reasons"][0].startswith("Uncertain:")
