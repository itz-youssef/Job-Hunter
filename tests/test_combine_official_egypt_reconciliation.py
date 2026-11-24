"""Aggregate comparison counts, missing IDs, and unknown sources faithfully."""
import importlib.util
from pathlib import Path
import pytest
spec=importlib.util.spec_from_file_location("combine_reconcile",Path("scripts/combine-official-egypt-reconciliation.py"))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def test_all_employers_distinguished_by_verified_matching_or_unverified():
    registry=[{"name":"A"},{"name":"B"},{"name":"C"}]
    rows=[{"name":"A","status":"MATCHED","matched_count":5,"missing_count":0,
           "official_egypt_count":5,"adapter_egypt_count":5},
          {"name":"B","status":"MISMATCH","matched_count":2,"missing_count":1,
           "missing_jobs":[{"url":"https://example.com/jobs/1","title":"Accountant"}],
           "official_egypt_count":3,"adapter_egypt_count":2},
          {"name":"C","status":"UNVERIFIED","reason":"Official ATS blocked"}]
    result=module.combine(registry,[{"results":rows[:2]},{"results":rows[2:]}])
    assert result["summary"]=={
       "employers":3,"matched":1,"mismatch":1,"unverified":1,
       "matched_egypt_vacancies":7,"confirmed_missing_egypt_vacancies":1}
    text=module.as_markdown(result)
    assert "https://example.com/jobs/1" in text
    assert "UNVERIFIED" in text

def test_missing_company_shard_is_not_misrepresented():
    with pytest.raises(ValueError,match="Missing employer comparisons"):
        module.combine([{"name":"A"},{"name":"B"}],[{"results":[{"name":"A","status":"MATCHED"}]}])
