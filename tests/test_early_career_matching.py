"""Regression tests for Egypt internships and entry-level engineering roles."""
from app.filters import relevance


def check(title, location="Cairo, Egypt", description="", employment=""):
    return relevance({
        "title": title,
        "location": location,
        "description": description,
        "employment": employment,
    }, {})


def test_all_egypt_internships_included():
    for title in ("Marketing Intern", "Summer Internship", "AI Research Intern",
                  "Software Development Internship", "Graduate Trainee"):
        score, reason = check(title)
        assert score >= 3, (title, reason)


def test_software_and_ai_entry_level():
    for title, desc in (
        ("Associate Software Developer", "Python"),
        ("Junior Backend Engineer", "FastAPI"),
        ("AI Engineer Intern", "PyTorch"),
        ("Graduate Data Engineer", "Python SQL"),
    ):
        score, reason = check(title, description=desc)
        assert score >= 3, (title, reason)


def test_reject_outside_egypt_and_senior():
    assert check("Software Engineering Intern", location="Berlin, Germany")[0] == 0
    assert check("Senior AI Engineer", description="Python")[0] == 0
    assert check("Engineering Manager", description="Python")[0] == 0


def test_regular_nontechnical_roles_not_included():
    assert check("Accountant", description="Python")[0] == 0
    assert check("Sales Representative", description="Python")[0] == 0
