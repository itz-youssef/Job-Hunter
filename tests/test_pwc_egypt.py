from app.pwc_egypt import workday_egypt,pwc_egypt,egypt_facet
from app.custom_sources import _job
import pytest

def test_egypt_facet_uses_site_ids():
    assert egypt_facet([{"facetParameter":"locations","values":[{"descriptor":"Cairo - ETIC","id":"a"},{"descriptor":"Dubai","id":"b"},{"descriptor":"Alexandria","id":"c"}]}])=={"locations":["a","c"]}

def test_workday_all_pages_and_details():
    def fetch(url,body=None):
        if body is None:
            return {"jobPostingInfo":{"jobDescription":"Official full description","location":"Cairo - ETIC","jobReqId":url.rsplit("_",1)[-1]}}
        if not body["appliedFacets"]:
            return {"total":500,"facets":[{"facetParameter":"locationCountry","values":[{"descriptor":"Egypt","id":"eg"},{"descriptor":"Germany","id":"de"}]}],"jobPostings":[]}
        assert body["appliedFacets"]=={"locationCountry":["eg"]}
        offset=body["offset"]
        return {"total":23,"jobPostings":[{"title":"ETIC Software Engineer "+str(i),"externalPath":"/job/Cairo/Engineer_"+str(i)+"WD","locationsText":"Cairo - ETIC"} for i in range(offset,min(offset+20,23))]}
    jobs=workday_egypt("PwC Egypt","Global_Experienced_Careers",fetch,_job)
    assert len(jobs)==23
    assert all(j["company"]=="PwC Egypt" and j["pwc_division"]=="ETIC" and "Egypt" in j["location"] for j in jobs)
    assert len({j["external_id"] for j in jobs})==23

def test_incomplete_page_rejected():
    def fetch(url,body=None):
        if not body["appliedFacets"]:
            return {"facets":[{"facetParameter":"locationCountry","values":[{"descriptor":"Egypt","id":"eg"}]}]}
        return {"total":30,"jobPostings":[]}
    with pytest.raises(ValueError):workday_egypt("PwC Egypt","Global_Campus_Careers",fetch,_job)
