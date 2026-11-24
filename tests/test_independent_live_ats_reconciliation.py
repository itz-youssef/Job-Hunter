"""Independent official-ATS source vs adapter ID comparison fixture tests."""
import importlib.util
from pathlib import Path
sp=importlib.util.spec_from_file_location("reconcile",Path("scripts/reconcile-official-egypt-jobs.py"))
mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)

def test_egypt_only_and_explicit_foreign_exclusion():
    assert mod.egypt_location("Cairo, Egypt")
    assert mod.egypt_location({"city":"Tanta","country":"Egypt"})
    assert mod.egypt_location("Giza, Egypt")
    assert mod.egypt_location("","EG")
    assert not mod.egypt_location("Berlin, Germany")
    assert not mod.egypt_location("Dubai, UAE")
    assert not mod.egypt_location("Unknown")
    assert not mod.egypt_location("Dubai, UAE","AE")


def test_workable_independent_collector_keeps_nontech_egypt():
    company={"name":"Example","url":"https://apply.workable.com/example/"}
    urls=[]
    def fetch(url):
        urls.append(url)
        return {"jobs":[
           {"title":"Accountant","shortcode":"AA","country":"Egypt","city":"Cairo"},
           {"title":"Senior Engineer","shortcode":"BB","country":"UAE","city":"Dubai"},
           {"title":"Marketing Intern","shortcode":"CC","location":{"city":"Giza","country":"Egypt"}},
        ]}
    kind,jobs,count=mod.raw_ats(company,fetch)
    assert kind=="workable" and count==3 and len(jobs)==2
    assert all("example/j/" in j["url"] for j in jobs)
    assert len(urls)==1


def test_ashby_independent_collector_ignores_unlisted_and_foreign():
    company={"name":"Example","url":"https://jobs.ashbyhq.com/example"}
    def fetch(_):
        return {"jobs":[
          {"title":"HR Generalist","location":"Cairo, Egypt","jobUrl":"https://jobs.ashbyhq.com/example/111","isListed":True},
          {"title":"Manager","location":"Dubai, UAE","jobUrl":"https://jobs.ashbyhq.com/example/222","isListed":True},
          {"title":"Hidden","location":"Cairo, Egypt","jobUrl":"https://jobs.ashbyhq.com/example/333","isListed":False}
        ]}
    _,jobs,count=mod.raw_ats(company,fetch)
    assert count==3 and [j["title"] for j in jobs]==["HR Generalist"]


def test_comparator_lists_missing_official_job_ids_without_guessing():
    company={"name":"Example","url":"https://apply.workable.com/example"}
    official=lambda _:("workable",[
        {"title":"Marketing","url":"https://apply.workable.com/example/j/AAA/"},
        {"title":"HR Intern","url":"https://apply.workable.com/example/j/BBB/"}],2)
    scanner=lambda _:([{"title":"Marketing","url":"https://apply.workable.com/example/j/AAA/","location":"Cairo, Egypt"}],
                       "monitoring","ok")
    result=mod.compare(company,official,scanner)
    assert result["status"]=="MISMATCH"
    assert result["missing_count"]==1
    assert result["missing_jobs"][0]["title"]=="HR Intern"


def test_no_independent_collector_is_not_a_false_match():
    result=mod.compare({"name":"Example","url":"https://example.com/careers"},
                       lambda _:("html",None,None),lambda _:([], "monitoring","ok"))
    assert result["status"]=="UNVERIFIED"


def test_multilocation_duplicate_official_rows_are_not_false_missing_jobs():
    company={"name":"Multi location board","url":"https://apply.workable.com/example/"}
    official=lambda _:("workable",[
        {"title":"Accountant","url":"https://apply.workable.com/example/j/AAA/"},
        {"title":"Accountant","url":"https://apply.workable.com/example/j/AAA/"}],2)
    scanner=lambda _:([{"title":"Accountant",
                        "url":"https://apply.workable.com/example/j/AAA/",
                        "location":"Cairo, Egypt"}],"monitoring","ok")
    result=mod.compare(company,official,scanner)
    assert result["status"]=="MATCHED"
    assert result["official_duplicate_rows"]==1
    assert result["official_egypt_count"]==result["adapter_egypt_count"]==1
