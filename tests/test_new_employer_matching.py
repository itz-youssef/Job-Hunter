"""New employer eligibility contract; existing global job matcher is unchanged."""
import pytest
from app.filters import relevance

@pytest.mark.parametrize("title,description", [
    ("Junior Software Engineer", "Python REST APIs; 0-2 years experience"),
    ("AI Engineer Intern", "Machine learning with PyTorch"),
    ("Computer Vision Engineer Intern", "OpenCV YOLO"),
    ("MLOps Engineer Intern", "Docker Kubernetes AWS"),
    ("Graduate Software Developer", "Python FastAPI"),
])
def test_new_employers_target_roles(title, description):
    points, _ = relevance({"company":"New Egypt employer","title":title,
        "description":description,"location":"Cairo, Egypt"}, {})
    assert points > 0

@pytest.mark.parametrize("title", [
    "Senior Software Engineer", "AI Engineering Manager",
    "Principal Machine Learning Engineer", "Computer Vision Team Lead",
    "Staff Software Engineer",
])
def test_new_employers_exclude_senior(title):
    points, _ = relevance({"company":"New Egypt employer","title":title,
        "description":"Python 1 year experience","location":"Cairo, Egypt"}, {})
    assert points == 0

def test_new_employers_never_accept_foreign_roles():
    points, _ = relevance({"title":"AI Engineer Intern", "description":"PyTorch",
        "location":"Berlin, Germany"}, {})
    assert points == 0

def test_new_employers_enforce_max_two_years():
    points, _ = relevance({"title":"Junior Software Engineer",
        "description":"Minimum 5 years of experience with Python", "location":"Cairo, Egypt"}, {})
    assert points == 0
