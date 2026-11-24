"""Official country-specific Avature search, with count-checked paging."""
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup

SIEMENS = "https://jobs.siemens.com/en_US/externaljobs/SearchJobs/Egypt"
DELOITTE = "https://middleeastjobs.deloitte.com/careersME/SearchJobs/Egypt"

def country_jobs(company, get_bytes, make_job, *, siemens=False):
    base = SIEMENS if siemens else DELOITTE
    prefix = "folder" if siemens else "pipeline"
    detail = r"/en_US/externaljobs/JobDetail/(\d+)" if siemens else r"/careersME/PipelineDetail/[^/]+/(\d+)"
    found = {}
    total = None
    for offset in range(0, 6000, 6):
        soup = BeautifulSoup(get_bytes(f"{base}?{prefix}RecordsPerPage=6&{prefix}Offset={offset}"), "html.parser")
        counts = re.findall(r"\b([\d,]+)\s+(?:jobs?|positions?|results?)\b", soup.get_text(" ", strip=True), re.I)
        if offset == 0:
            if not counts:
                raise ValueError("Official country result count missing")
            total = int(counts[0].replace(",", ""))
        page = {}
        for a in soup.select("a[href]"):
            href = urljoin(base, a["href"])
            p = urlsplit(href)
            m = re.fullmatch(detail, p.path)
            if not m or p.hostname != urlsplit(base).hostname:
                continue
            key = m[1]
            title = a.get_text(" ", strip=True)
            location = ""
            published = ""
            for card in a.parents:
                if card.name in ("body", "html"):
                    break
                content = card.get_text(" ", strip=True)
                if siemens:
                    if not re.search(r"Job ID:\s*" + key + r"\b", content):
                        continue
                    heading = card.select_one("h2,h3,h4")
                    if heading:
                        title = heading.get_text(" ", strip=True)
                    place = content.split("• Job ID:",1)[0]
                    if place.startswith(title):
                        place = place[len(title):].strip()
                    if re.search(r"\bEgypt\b", place, re.I):
                        location = place
                    break
                elif "Posted on" in content:
                    mdate = re.search(r"Egypt\s*\|\s*Posted on\s*(\d{1,2}-[A-Za-z]{3}-\d{4})",content,re.I)
                    if mdate:
                        location = "Egypt"
                        try: published = datetime.strptime(mdate[1],"%d-%b-%Y").date().isoformat()
                        except ValueError: pass
                    break
            description = ""
            employment = ""
            seniority = ""
            if siemens and (title.lower() in ("learn more", "apply", "") or not location):
                d = BeautifulSoup(get_bytes(href), "html.parser")
                fields = {}
                for field in d.select(".article__content__view__field"):
                    label = field.select_one(".article__content__view__field__label")
                    value = field.select_one(".article__content__view__field__value")
                    if label and value: fields[label.get_text(" ",strip=True)] = value.get_text(" ",strip=True)
                heading = d.select_one("h3.section__header__text__title")
                if fields.get("Job ID") != key or not heading:
                    raise ValueError("Official Siemens detail ID/title mismatch")
                title = heading.get_text(" ",strip=True)
                place = fields.get("Location(s)","")
                if re.search(r"\bEgypt\b",place,re.I): location=place
                article=d.select_one(".tf_replaceFieldVideoTokens")
                if article: description=article.get_text(" ",strip=True)
                seniority=fields.get("Experience level","")
                if seniority: description="Employer career level: "+seniority+". "+description
                employment=fields.get("Job type","")
                try: published=datetime.strptime(fields.get("Posted since",""),"%d-%b-%Y").date().isoformat()
                except ValueError: pass
            if not title or title.lower() in ("learn more","apply"):
                raise ValueError("Vacancy title missing")
            job=make_job(company,title,location,href,description,published,employment)
            job.update(external_id=key,source_reported_total=total,source_pagination_consistency="complete")
            if seniority: job["seniority"]=seniority
            page[key]=job
        if not page and len(found)==total: break
        if not page or set(page)&set(found):
            raise ValueError("Official country pagination empty or repeated prematurely")
        found.update(page)
        if len(found)>=total:
            break
    if len(found)!=total:
        raise ValueError(f"Official country count mismatch: {len(found)}/{total}")
    return list(found.values())
