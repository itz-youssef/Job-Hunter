"""Verified public careers feeds for selected Egyptian employers.

Only publicly available unauthenticated endpoints; no anti-bot bypass.
"""
from __future__ import annotations
import re
from urllib.parse import urlsplit, urljoin

TARGET = re.compile(r"(software|engineer|developer|data science|machine learning|mlops|computer vision|python|platform)", re.I)
EGYPT = re.compile(r"\b(egypt|cairo|giza|alexandria|maadi|new cairo|6th of october|smart village)\b", re.I)


def workable(name, slug, get_json, get_bytes, structured, make_job):
    """Workable's publicly embedded job-widget feed."""
    data = get_json("https://apply.workable.com/api/v1/widget/accounts/" + slug)
    rows = data.get("jobs") or []
    results = []
    detail_calls = 0
    for item in rows:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "")
        if not TARGET.search(title):
            continue
        location = item.get("location") or {}
        if isinstance(location, dict):
            place = ", ".join(str(location.get(k) or "") for k in ("city","region","country") if location.get(k))
        else:
            place = str(location)
        if not place:
            place = ", ".join(str(item.get(k) or "") for k in ("city","state","country") if item.get(k))
        if not EGYPT.search(place) and str(item.get("country_code") or "").upper() != "EG":
            continue
        if not place: place = "Egypt"
        link = str(item.get("url") or item.get("job_url") or "")
        if not link:
            shortcode = str(item.get("shortcode") or "")
            if not shortcode: continue
            link = f"https://apply.workable.com/{slug}/j/{shortcode}/"
        description = str(item.get("description") or "")
        if detail_calls < 18 and not description:
            detail_calls += 1
            try:
                page = get_bytes(link).decode("utf-8", errors="replace")
                matches = structured(name, link, page)
                if matches:
                    description = matches[0].get("description") or ""
                    place = matches[0].get("location") or place
            except (OSError, ValueError, TypeError):
                pass
        job = make_job(name,title,place,link,description,item.get("published_at") or item.get("published_on") or "",item.get("employment_type") or "")
        job["seniority"] = str(item.get("experience") or "")
        results.append(job)
    return results


def link_development(name, url, get_bytes, make_job):
    """Read public Egypt-tagged job pages linked from Link Development."""
    from html.parser import HTMLParser
    from urllib.parse import unquote
    class Anchors(HTMLParser):
        def __init__(self):
            super().__init__()
            self.href = None
            self.text = []
            self.links = []
        def handle_starttag(self, tag, attrs):
            if tag == "a":
                self.href = dict(attrs).get("href")
                self.text = []
        def handle_data(self, data):
            if self.href:
                self.text.append(data)
        def handle_endtag(self,tag):
            if tag=="a" and self.href:
                self.links.append((self.href, " ".join(" ".join(self.text).split())))
                self.href=None
    parser=Anchors()
    parser.feed(get_bytes(url).decode("utf-8",errors="replace"))
    found={}
    for href,label in parser.links:
        link=urljoin(url,href).split("#")[0]
        p=urlsplit(link)
        if p.hostname not in ("linkdevelopment.com","www.linkdevelopment.com"):continue
        if not re.match(r"^/careers/opportunities/[^/]+/?$",p.path,re.I):continue
        slug=unquote(p.path.strip("/").split("/")[-1])
        if not EGYPT.search(slug.replace("-"," ")):continue
        if not label or len(label)<12 or label.lower().startswith(("more","apply","view")):
            label=" ".join(slug.replace("-"," ").split())
        if not TARGET.search(label): continue
        found[link]=make_job(name,label,"Egypt",link,"","","")
    return list(found.values())


def itworx(name, post_json, make_job):
    """ITWorx's official, publicly accessible recruitment listings endpoint."""
    endpoint = "https://careers.itworx.com/ServerApp/api/Requisition/GetAllRequisitions"
    found = {}
    page_size = 50
    for page in range(3):
        data = post_json(endpoint, {
            "StartIndex": page * page_size + 1,
            "PageSize": page_size,
            "SortBy": 1,
            "IsTokenPresent": False,
        })
        if not data.get("success"):
            raise ValueError("ITWorx recruitment API returned unsuccessful status")
        rows = data.get("AllRequisitions") or []
        for row in rows:
            title = str(row.get("Position") or "").strip()
            location = str(row.get("Location") or "").strip()
            job_id = str(row.get("ReqId") or "").strip()
            if not job_id.isdigit() or not EGYPT.search(location) or not TARGET.search(title):
                continue
            description = " ".join(str(row.get(k) or "") for k in ("Description", "Requirements"))
            job = make_job(
                name, title, location,
                f"https://careers.itworx.com/job-details/{job_id}",
                description, "", str(row.get("EmploymentType") or ""),
            )
            job["seniority"] = str(row.get("CareerLevel") or "")
            found[job_id] = job
        total = int(data.get("TotalCount") or len(rows))
        if not rows or (page + 1) * page_size >= total:
            break
    return list(found.values())
