"""Find SuccessFactors EY 21st row and CIB Taleo visible titles."""
from app.custom_sources import _bytes
from bs4 import BeautifulSoup
import re
for start in [0,1,19,20,21,25,26,40]:
 u=f"https://careers.ey.com/ey/search/?q=&locationsearch=Egypt&startrow={start}"
 try:
  d=BeautifulSoup(_bytes(u).decode("utf8","replace"),"html.parser")
  names=[a.get("href") for a in d.select("a.jobTitle-link")]
  print("EY_PG",start,"count",len(names),"first",names[:2],"last",names[-2:],flush=True)
 except Exception as e:print("EY_ERR",start,str(e)[:120],flush=True)
u="https://cibeg.taleo.net/careersection/cib_ex/moresearch.ftl"
h=_bytes(u).decode("utf8","replace")
s=BeautifulSoup(h,"html.parser")
for term in ("Network Security","Banking Applications","2600028W","260002VH","requisitionListInterface"):
 for m in list(re.finditer(re.escape(term),h,re.I))[:2]:
  print("CIB_RAW",term,repr(h[max(0,m.start()-400):m.start()+720]),flush=True)
print("CIB_A",[(a.get("href"),a.get_text(" ",strip=True)[:120])for a in s.select("a[href]")if re.search(r"jobdetail|joblist",a.get("href",""),re.I)][:20],flush=True)
for u in ["https://adibegypt.taleo.net/careersection/ex/joblist.ftl","https://adibegypt.taleo.net/careersection/ex/moresearch.ftl"]:
 try:
  h=_bytes(u).decode("utf8","replace")
  print("ADIB",u,len(h),"requis",h.count("requisitionListInterface"),"Job Number",h.count("Job Number"),flush=True)
 except Exception as e:print("ADIB_ERR",u,str(e)[:150],flush=True)
