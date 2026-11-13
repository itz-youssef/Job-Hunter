"""Read-only diagnostics for ONLY newly requested employer career pages.

Prints safe public ATS hints and URL paths (no credentials).
Never writes to monitoring state or fabricates job postings.
"""
import concurrent.futures
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from app.custom_sources import _bytes

TARGETS = {
 "Henkel Egypt", "Coca-Cola HBC Egypt", "Coca-Cola Egypt",
 "Systems Limited Egypt", "HSBC Egypt", "Banque Misr", "Banque du Caire",
 "blnk Egypt", "NBK Egypt", "Globant", "Konecta Egypt", "ADIB Egypt",
 "FAB Egypt", "ADCB Egypt", "Globitel Egypt", "Fab Minds Egypt",
}
HINTS = re.compile(
    r"workday|successfactors|taleo|oraclecloud|avature|"
    r"smartrecruiters|greenhouse|lever\.co|ashbyhq|"
    r"zenats|careers|vacanc|openings|jobs|recruit|api|"
    r"application\/ld\+json",
    re.I,
)
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.scripts = []
        self.actions = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = ("href" if tag in ("a", "link") else
               "src" if tag in ("script", "iframe") else
               "action" if tag == "form" else None)
        if key and attrs.get(key):
            val = attrs[key]
            if tag == "script":
                self.scripts.append(val)
            elif tag == "form":
                self.actions.append(val)
            elif HINTS.search(val):
                self.links.append(val)

def probe(entry):
    url = entry["url"]
    name = entry["name"]
    try:
        raw = _bytes(url)
        html = raw.decode("utf-8", "replace")
        doc = Links()
        doc.feed(html)
        base = urlsplit(url).hostname
        ats = re.findall(r"https?://[^\s\"'<>\\]{10,160}", html, re.I)
        candidates = []
        for v in list(doc.links) + list(doc.scripts) + list(doc.actions) + ats:
            v = urljoin(url, v).split("#")[0]
            parts = urlsplit(v)
            if parts.scheme != "https" or not parts.hostname:
                continue
            if parts.hostname == base and not HINTS.search(parts.path):
                continue
            if len(v) > 220 or v in candidates:
                continue
            candidates.append(v)
            if len(candidates) >= 22:
                break
        return {"name":name,"http":"ok","bytes":len(raw),
                "title":re.search(r"<title[^>]*>(.{0,140}?)</title", html,re.I|re.S).group(1).strip()
                       if re.search(r"<title[^>]*>(.{0,140}?)</title",html,re.I|re.S) else "",
                "links":candidates,"jsonld":len(re.findall("application/ld\\+json",html,re.I)),
                "jobHints":len(re.findall(r"JobPosting|requisition|jobId|job_id",html,re.I))}
    except Exception as exc:
        return {"name":name,"http":"error","error":type(exc).__name__+": "+str(exc)[:180]}

def main():
    companies = json.loads(Path("companies.json").read_text(encoding="utf-8"))
    selected = [c for c in companies if c["name"] in TARGETS]
    assert len(selected) == len(TARGETS)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(probe, selected))
    Path("new-employer-source-diagnostics.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    for row in results:
        print(json.dumps(row, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
