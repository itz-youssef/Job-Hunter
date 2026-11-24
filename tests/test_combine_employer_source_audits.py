"""Aggregate source audit must never misrepresent scrape counts as official totals."""
import importlib.util
import sys
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location("combine_employer_source_audits",
    Path("scripts/combine-employer-source-audits.py"))
module=importlib.util.module_from_spec(spec)
sys.modules["combine_employer_source_audits"]=module
spec.loader.exec_module(module)


def record(name, jobs=2, descriptions=1, status="monitoring"):
    return {"name":name,"source_kind":"workable","scan_status":status,
        "jobs_found":jobs,"career_url":"https://example.com/jobs",
        "fields":{"description":{"present":descriptions},
                  "requirements":{"present":0}},
        "issues":[]}


def test_combined_evidence_marks_all_employer_totals_unverified():
    registry=[{"name":"A","url":"https://a.example/jobs"},
              {"name":"B","url":"https://b.example/jobs"}]
    shards=[{"results":[record("A")]},
            {"results":[record("B",0,0,"partial")]}]
    old={"companies":[{"name":"A","jobs":5},{"name":"B","jobs":0}]}
    report=module.aggregate(registry,shards,old)
    assert report["summary"]["companies_checked"]==2
    assert report["summary"]["official_totals_independently_confirmed"]==0
    assert all(x["official_total_verified"] is False for x in report["companies"])
    assert "below-historical-count-review-not-proof-of-missed-jobs" in report["companies"][0]["issues"]
    assert "description-missing" in report["companies"][0]["issues"]
    assert "empty-unverified" in report["companies"][1]["issues"]
    assert "does not prove" in module.markdown(report)


def test_missing_shard_fails_instead_of_reporting_incomplete_coverage_as_complete():
    registry=[{"name":"A","url":"https://a.example/jobs"},{"name":"B","url":"https://b.example/jobs"}]
    with pytest.raises(ValueError,match="Missing source probes"):
        module.aggregate(registry,[{"results":[record("A")]}])


def test_duplicate_scan_and_unregistered_source_are_rejected():
    registry=[{"name":"A","url":"https://a.example/jobs"}]
    with pytest.raises(ValueError,match="Duplicate source probe"):
        module.aggregate(registry,[{"results":[record("A")]},{"results":[record("A")]}])
    with pytest.raises(ValueError,match="Unknown source probe"):
        module.aggregate(registry,[{"results":[record("B")]}])


def test_all_58_registered_companies_have_distinct_names():
    import json
    companies=json.loads(Path("companies.json").read_text(encoding="utf-8"))
    names=[c["name"] for c in companies]
    assert len(names)==len(set(names))==58
