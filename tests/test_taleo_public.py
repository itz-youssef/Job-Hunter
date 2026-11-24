from app.taleo_public import public_pages,taleo_jobs
from app.custom_sources import _job

class Response:
    def __init__(self,payload=None,html=""):
        self.payload=payload
        self.text=html
    def raise_for_status(self):pass
    def json(self):return self.payload

class Session:
    def __init__(self,rows,total):
        self.headers={}
        self.rows=rows
        self.total=total
    def get(self,*args,**kwargs):
        return Response(html='<input name="portal" value="8105020225">')
    def post(self,*args,**kwargs):
        p=kwargs["json"]["pageNo"]
        return Response({"pagingData":{"totalCount":self.total},"requisitionList":self.rows[(p-1)*25:p*25]})

def row(i,location="Egypt-Cairo"):
    return {"jobId":str(i),"contestNo":"26000"+str(i),"linkedColumn":0,"locationsColumns":[1],"column":["Sales or HR role "+str(i),location,"Nov 24, 2026"]}

def test_cib_reads_three_pages_preserving_all_roles():
    session=Session([row(i) for i in range(68)],68)
    jobs=taleo_jobs("cib_egypt","CIB Egypt",_job,session)
    assert len(jobs)==68
    assert len({j["external_id"] for j in jobs})==68
    assert all(j["source_pagination_consistency"]=="complete" for j in jobs)

def test_incomplete_total_never_reported_as_complete():
    jobs=taleo_jobs("cib_egypt","CIB Egypt",_job,Session([row(i) for i in range(67)],68))
    assert len(jobs)==67
    assert all(j["source_pagination_consistency"]=="incomplete" for j in jobs)

def test_foreign_and_unknown_locations_are_not_assumed_egypt():
    jobs=taleo_jobs("etisalat_egypt","e& / Etisalat",_job,Session([row(1),row(2,"Dubai, UAE"),row(3,"Unknown")],3))
    assert len(jobs)==1
    assert jobs[0]["source_pagination_consistency"]=="incomplete-location"
