"""Offline validation that all 58 configured employers are audited without omission."""
import json
from pathlib import Path
import importlib.util
import sys
_spec=importlib.util.spec_from_file_location('audit_all_employer_sources',Path('scripts/audit-all-employer-sources.py'))
_module=importlib.util.module_from_spec(_spec)
sys.modules['audit_all_employer_sources']=_module
_spec.loader.exec_module(_module)
execute,summarize=_module.execute,_module.summarize

COMPANIES=json.loads(Path("companies.json").read_text(encoding="utf-8"))

def test_every_employer_is_in_exactly_one_shard(monkeypatch):
    calls=[]
    def fake_scan(company):
        calls.append(company["name"])
        return ([{"title":"Junior Software Engineer",
           "company":company["name"],"location":"Cairo, Egypt",
           "description":"Build Python APIs for customers",
           "url":"https://example.com/apply/123"}],"monitoring","fixture")
    monkeypatch.setattr("audit_all_employer_sources.scan_company",fake_scan)
    results=[execute(COMPANIES,part=i,parts=6,workers=3) for i in range(6)]
    checked=[r["name"] for report in results for r in report["results"]]
    assert len(COMPANIES)==58
    assert len(checked)==58
    assert set(checked)==set(c["name"] for c in COMPANIES)
    assert len(calls)==58

def test_missing_requirements_are_not_misreported_as_complete():
    company={"name":"Example","url":"https://example.com/careers"}
    report=summarize(company,([{"title":"Junior Engineer","company":"Example",
      "url":"https://example.com/apply/123","description":"Build Python APIs"}],
      "monitoring","read"),1.5)
    assert report["fields"]["requirements"]["present"]==0
    assert report["fields"]["description"]["present"]==1
    assert report["audit_state"]=="parsed-unverified-completeness"
    assert report["fields"]["seniority"]["missing"]==1

def test_inaccessible_company_is_reported_not_silently_omitted():
    company={"name":"Example","url":"https://example.com/careers"}
    report=summarize(company,([],"access_blocked","HTTP 403"),0.2)
    assert report["audit_state"]=="unverified-source-failure"
    assert report["jobs_found"]==0
    assert report["scan_status"]=="access_blocked"

def test_json_structured_detail_evidence_requires_recorded_provenance():
    company={"name":"Example","url":"https://example.com/careers"}
    job={"title":"Junior Engineer","company":"Example",
      "url":"https://example.com/apply/123",
      "description":"Build API backend services",
      "source_detail_status":"jsonld-jobposting"}
    report=summarize(company,([job],"monitoring","ok"),2.0)
    assert report["detail_verified_rows"]==1
