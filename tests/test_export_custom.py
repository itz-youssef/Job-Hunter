import json
from app.export_site import preserve_custom_snapshot


def test_main_export_keeps_custom_jobs_and_status(tmp_path):
    path = tmp_path / "data.json"
    previous = {
        "jobs": [
            {"id": "custom-x", "source": "Custom Careers", "title": "Junior AI Engineer"},
            {"id": 2, "source": "Legacy", "title": "Old job"},
        ],
        "custom_sources": [{"name": "Nokia", "status": "partial"}],
    }
    path.write_text(json.dumps(previous), encoding="utf-8")
    current = {"jobs": [{"id": 1, "title": "Software Engineer"}], "sources": []}
    result = preserve_custom_snapshot(current, path)
    assert {j["id"] for j in result["jobs"]} == {1, "custom-x"}
    assert result["custom_sources"][0]["status"] == "partial"


def test_export_no_old_snapshot(tmp_path):
    payload = {"jobs": []}
    assert preserve_custom_snapshot(payload, tmp_path / "missing.json") == payload
