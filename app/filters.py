"""Hard filters for Egypt-based early-career software, AI, CV and MLOps roles.

Drop-in replacement for Job-Hunter/app/filters.py.
Public interface kept: relevance(job, config) -> (integer score, list[str]).
A score of 0 means exclude from matched-jobs/alerts.
"""
from __future__ import annotations

import re

# Role matching is deliberately on the TITLE, not on every term in a description.
# Technical keywords alone (e.g. Python) must never qualify a sales or HR role.
ROLE_PATTERNS = {
    "Software Engineering": (
        r"\b(?:software|application|web|backend|frontend|full[ -]?stack)\s+(?:engineering|development)\s+(?:intern|internship|trainee|graduate)\b",
        r"\b(?:associate|graduate|junior)\s+(?:software\s+)?(?:engineer|developer|programmer)\b",
        r"\bsoftware\s+(?:development\s+)?(?:engineer|developer|intern|trainee)\b",
        r"\b(?:backend|back[ -]end|frontend|front[ -]end|full[ -]?stack|web|mobile|android|ios)\s+(?:software\s+)?(?:engineer|developer|intern|trainee)\b",
        r"\b(?:python|java|javascript|typescript|\.net|c\+\+|c#|react|node(?:\.js)?)\s+(?:software\s+)?(?:engineer|developer)\b",
        r"\b(?:application|applications|platform|api)\s+(?:software\s+)?(?:engineer|developer)\b",
        r"\b(?:sde|swe)\b",
    ),
    "AI / Machine Learning": (
        r"\b(?:ai|ml|machine learning|deep learning|data science|generative ai|artificial intelligence)\s+(?:research\s+)?(?:internship|intern|trainee|graduate)\b",
        r"\b(?:ai|ml|machine learning|data science)\s+research\s+(?:intern|assistant)\b",
        r"\b(?:ai|artificial intelligence|machine learning|ml|deep learning|generative ai|genai|llm|nlp)\s+(?:engineer|developer|intern|trainee|specialist)\b",
        r"\b(?:engineer|developer|intern|trainee)\s*[-–:]?\s*(?:ai|machine learning|ml|genai|llm|nlp)\b",
        r"\bapplied\s+(?:ai|ml|machine learning)\s+(?:engineer|scientist)\b",
        r"\b(?:junior|entry[ -]level|graduate|intern|internship)\s+data scientist\b",
    ),
    "Computer Vision": (
        r"\b(?:computer vision|perception|image processing)\s+(?:research\s+)?internship\b",
        r"\b(?:computer vision|cv|image processing|video analytics|perception)\s+(?:engineer|developer|intern|trainee|research engineer)\b",
        r"\b(?:engineer|developer|intern|trainee)\s*[-–:]?\s*(?:computer vision|image processing|perception)\b",
    ),
    "MLOps / ML Platform": (
        r"\b(?:mlops|ml[ -]?ops|machine learning platform|ml platform|model deployment|ml infrastructure)\s+(?:engineer|developer|intern|trainee)\b",
        r"\b(?:engineer|intern|trainee)\s*[-–:]?\s*(?:mlops|ml[ -]?ops)\b",
    ),
}

EARLY_TITLE = re.compile(
    r"\b(?:junior|jr\.?|entry[ -]level|new grad(?:uate)?|fresh grad(?:uate)?|"
    r"graduate(?:\s+program(?:me)?)?|work\s+experience\s+(?:program(?:me)?)?|intern(?:ships?)?|trainees?|apprentices?|"
    r"associate(?:\s+software\s+engineer)?)\b", re.I,
)
EARLY_DESCRIPTION = re.compile(
    r"\b(?:(?:employer\s+career\s+level|experience\s+level)\s*:\s*early\s+professional|"
    r"fresh(?:\s+graduate|er)?s?|recent graduates?|no (?:prior )?experience|"
    r"0\s*(?:-|–|to)\s*[012]\s*years?|"
    r"[01]\s*(?:-|–|to)\s*2\s*years?|"
    r"(?:up to|maximum(?: of)?|max\.?)\s*2\s*years?|"
    r"(?:0|1|2)\s+years?\s+(?:of\s+)?experience\s+(?:required|preferred|or less))\b", re.I,
)
SENIOR_TITLE = re.compile(
    r"\b(?:mid[ -]level|mid[ -]senior|senior|sr\.?|lead|principal|staff|"
    r"architect|director|head\s+of|manager|management|tech lead|team lead|"
    r"expert|experienced)\b", re.I,
)
# Reject explicit requirements above 2 years. Avoid interpreting dates or company histories.
EXCESSIVE_EXPERIENCE = (
    re.compile(r"\b(?:minimum|min\.?|at least|more than|over)\s*(?:of\s*)?([3-9]|\d{2,})\+?\s*years?", re.I),
    re.compile(r"\b([3-9]|\d{2,})\s*\+\s*years?\b", re.I),
    re.compile(r"\b([3-9]|\d{2,})\s*(?:-|–|to)\s*\d+\s*years?\b", re.I),
    re.compile(r"\b(?:required|requirement|experience|minimum|at least|must have|need(?:s)?)\b[^\n.]{0,55}\b([3-9]|\d{2,})\s*years?", re.I),
    re.compile(r"\b([3-9]|\d{2,})\s*years?\s+(?:of\s+)?(?:relevant|professional|industry|work|hands-on|practical)?\s*experience\b", re.I),
)
EGYPT_LOCATIONS = (
    "egypt", "cairo", "giza", "alexandria", "new cairo", "nasr city", "maadi",
    "6th of october", "6 october", "6th october", "sheikh zayed", "helwan",
    "smart village", "new capital", "administrative capital", "obour", "shorouk",
    "mansoura", "tanta", "zagazig", "ismailia", "port said", "suez", "damietta",
    "assiut", "aswan", "luxor", "minya", "fayoum", "benha", "qalyubia",
    "hurghada", "sharm el sheikh", "sohag", "bani suef", "beni suef",
)
FOREIGN_ONLY = re.compile(
    r"\b(?:united states|usa|united kingdom|germany|france|canada|india|"
    r"saudi arabia|uae|dubai|abu dhabi|qatar|kuwait|jordan|poland|spain|"
    r"netherlands|ireland|australia|brazil|sweden|switzerland)\b", re.I,
)
SKILLS = (
    "python", "pytorch", "tensorflow", "keras", "scikit-learn", "opencv", "yolo",
    "computer vision", "deep learning", "machine learning", "llm", "rag", "genai",
    "generative ai", "fastapi", "django", "flask", "rest api", "docker",
    "kubernetes", "mlflow", "kubeflow", "aws", "sagemaker", "azure", "gcp",
    "git", "sql", "postgresql", "java", "javascript", "typescript", "c++",
    "c#", "react", "node.js", "backend", "api", "mlops", "tensorflow serving",
    "hugging face", "langchain", "data engineering", "ci/cd", "microservices",
)


def _has_term(text: str, term: str) -> bool:
    return bool(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I))


def relevance(job: dict, config: dict) -> tuple[int, list[str]]:
    title = str(job.get("title") or "").strip()
    description = str(job.get("description") or "")
    location = str(job.get("location") or "").strip()
    employment = str(job.get("employment") or "")
    title_lower = title.lower()
    location_lower = location.lower()

    # Unknown location and worldwide-remote jobs are not evidence of Egypt eligibility.
    if not location or not (any(_has_term(location_lower, city) for city in EGYPT_LOCATIONS) or location_lower in ("eg", "egypt (eg)")):
        return 0, ["Excluded: job location is not explicitly in Egypt"]
    if FOREIGN_ONLY.search(location_lower) and not _has_term(location_lower, "egypt"):
        return 0, ["Excluded: location references a foreign country"]

    role = next(
        (family for family, patterns in ROLE_PATTERNS.items()
         if any(re.search(pattern, title_lower, re.I) for pattern in patterns)),
        None,
    )
    # Include *all* Egypt-based internships, even when titles do not
    # contain "Software Engineer". Ordinary jobs remain title-restricted.
    internship = bool(re.search(
        r"\b(?:internships?|interns?|summer\s+interns?|industrial\s+training|work\s+experience\s+(?:program(?:me)?)?|"
        r"trainees?|traineeships?|apprentices?|apprenticeships?)\b",
        title + " " + employment, re.I
    ))
    if not role and internship:
        role = "Internship"
    if not role and EARLY_TITLE.search(title) and re.search(
        r"\b(?:engineer|developer|programmer|software|technology|data|ai|ml)\b",
        title, re.I
    ) and any(_has_term(description, term) for term in SKILLS):
        role = "Early-career technical programme"
    if not role:
        return 0, ["Excluded: title is outside Software/AI/ML/CV/MLOps roles"]

    if SENIOR_TITLE.search(title):
        return 0, ["Excluded: senior, mid-level or management title"]

    # Some ATS feeds have a separate career-level field. Respect it
    # even when the title itself does not mention seniority.
    seniority = str(job.get("seniority") or job.get("career_level") or "")
    if re.search(r"\b(?:mid(?:\s*-\s*senior)?|senior|experienced|managerial|lead|principal|staff|director|expert)\b", seniority, re.I):
        return 0, ["Excluded: ATS career level is not entry-level"]

    # Experience requirements can be long. Check the full description, but only in
    # explicit years-of-experience contexts, not arbitrary plain numbers.
    if any(p.search(description) for p in EXCESSIVE_EXPERIENCE):
        return 0, ["Excluded: role requires more than 2 years of experience"]

    early = bool(
        internship
        or         EARLY_TITLE.search(title)
        or EARLY_TITLE.search(seniority)
        or re.search(r"\b(?:early professional|early career|entry professional|entry[- ]level professional)\b",seniority,re.I)
        or EARLY_TITLE.search(employment)
        or re.search(r"\b(?:internship|traineeship|apprenticeship)\b", employment, re.I)
        or EARLY_DESCRIPTION.search(description)
    )
    if not early:
        return 0, ["Excluded: junior, graduate, internship or 0–2 years not confirmed"]

    matched = [skill for skill in SKILLS if _has_term(description + " " + title, skill)]
    score = 8 + min(4, len(matched))  # 8–12, only after all hard filters pass.
    reasons = ["Egypt only", "Early career confirmed", f"Target role: {role}"]
    if matched:
        reasons.append("Matched skills: " + ", ".join(matched[:7]))
    return score, reasons
