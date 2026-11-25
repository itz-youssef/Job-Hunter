import json
from app import custom_monitor as monitor


def test_new_job_alert_only_after_first_success(tmp_path, monkeypatch):
    registry = tmp_path / "companies.json"
    snapshot = tmp_path / "data.json"
    state = tmp_path / "state.json"
    status = tmp_path / "status.json"
    company = {"name": "Example", "url": "https://example.com/careers"}
    registry.write_text(json.dumps([company]), encoding="utf-8")
    snapshot.write_text(json.dumps({"jobs": [], "sources": []}), encoding="utf-8")

    def job(identifier):
        return {
            "id": identifier, "company": "Example",
            "title": "Junior Software Engineer",
            "location": "Cairo, Egypt",
            "description": "Python, 0-2 years experience",
            "url": f"https://example.com/job/{identifier}",
            "source": "Custom Careers",
        }

    current = [job("first")]
    monkeypatch.setattr(monitor, "scan_company",
                        lambda _: (list(current), "monitoring", f"{len(current)} jobs"))
    monkeypatch.setattr(monitor, "_smtp_ready", lambda: False)

    monitor.run(registry, snapshot, state, status)
    assert json.loads(state.read_text())["pending"] == {}
    assert len(json.loads(snapshot.read_text())["jobs"]) == 1
    assert json.loads(status.read_text())["companies"][0]["matched_jobs"] == 1

    current.append(job("second"))
    monitor.run(registry, snapshot, state, status)
    second = json.loads(state.read_text())
    assert list(second["pending"]) == ["second"]
    assert len(json.loads(snapshot.read_text())["jobs"]) == 2

    monitor.run(registry, snapshot, state, status)
    assert list(json.loads(state.read_text())["pending"]) == ["second"]


def test_verified_employer_detail_is_preserved_when_next_search_summary_is_sparse(tmp_path,monkeypatch):
    registry=tmp_path/'companies.json'
    snapshot=tmp_path/'data.json'
    state=tmp_path/'state.json'
    status=tmp_path/'status.json'
    company={"name":"VOIS","url":"https://jobs.vodafone.com/careers"}
    registry.write_text(json.dumps([company]))
    snapshot.write_text(json.dumps({"jobs":[],"sources":[]}))
    complete={
      "id":"vois-example","company":"VOIS","title":"Junior AI Engineer",
      "location":"Cairo, Egypt","description":"Employer official job details: develop AI models and machine learning pipelines for real use cases. Work with PyTorch, computer vision and deployment systems.",
      "requirements":"Required: 0-2 years of machine learning experience",
      "seniority":"Entry","department":"Technology",
      "source_detail_status":"jsonld-jobposting",
      "url":"https://jobs.vodafone.com/careers/job/123",
      "source":"Custom Careers"
    }
    current=[complete]
    monkeypatch.setattr(monitor,'scan_company',lambda _:(list(current),'monitoring','ok'))
    monkeypatch.setattr(monitor,'_smtp_ready',lambda:False)
    monitor.run(registry,snapshot,state,status)
    short={**complete,"description":"","requirements":"","seniority":"","department":"",
        "source_detail_status":"detail-unavailable"}
    current[:]=[short]
    monitor.run(registry,snapshot,state,status)
    saved=json.loads(snapshot.read_text())['jobs'][0]
    assert saved['description']==complete['description']
    assert saved['requirements']==complete['requirements']
    assert saved['seniority']=='Entry'
    assert saved['department']=='Technology'
    assert saved['source_detail_status']=='retained-official-detail'


def test_parallel_scan_timings_preserve_registry_order_and_isolate_errors(monkeypatch):
    companies = [
        {"name": "Slow", "url": "https://slow.example/jobs"},
        {"name": "Broken", "url": "https://broken.example/jobs"},
        {"name": "Fast", "url": "https://fast.example/jobs"},
    ]
    def scan(company):
        if company["name"] == "Broken":
            raise RuntimeError("private provider error")
        return [{"title": company["name"]}], "monitoring", "ok"
    monkeypatch.setattr(monitor, "scan_company", scan)
    result = monitor._scan_all(companies, {"companies": [
        {"url": companies[2]["url"], "duration_seconds": 200},
    ]})
    assert len(result) == 3
    assert result[0][0][0]["title"] == "Slow"
    assert result[1][:3] == ([], "error", "RuntimeError")
    assert result[2][0][0]["title"] == "Fast"
    assert all(r[3] >= 0 and r[4] <= r[5] for r in result)

def test_all_companies_scanned_with_bounded_same_host_parallelism(monkeypatch):
    import threading
    import time
    active = 0
    peak = 0
    visited = []
    lock = threading.Lock()
    def scan(company):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
            visited.append(company["name"])
        time.sleep(0.01)
        with lock:
            active -= 1
        return [], "monitoring", "ok"
    monkeypatch.setattr(monitor, "scan_company", scan)
    companies = [{"name": str(i), "url": f"https://same.example/jobs/{i}"} for i in range(18)]
    results = monitor._scan_all(companies, {})
    assert len(results) == len(companies)
    assert sorted(visited) == sorted(c["name"] for c in companies)
    assert peak <= monitor.MAX_HOST_WORKERS
