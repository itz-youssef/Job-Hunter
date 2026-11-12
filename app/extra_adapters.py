
"""Additional public career-site adapters for Job Hunter."""

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

from app import custom_sources as base

ROLE = re.compile(
    r"software|developer|engineer|machine learning|"
    r"mlops|computer vision|\bai\b|\bml\b|intern|graduate",
    re.I
)

EGYPT = re.compile(
    r"egypt|cairo|giza|alexandria|maadi|mansoura|tanta|"
    r"zagazig|ismailia|suez|aswan|luxor|sohag|assyut|"
    r"assiut|minya|fayoum|hurghada|port said|"
    r"6th of october|\beg\b",
    re.I
)

PAGE_LIMIT = 4
DETAIL_LIMIT = 12


def _kind(url):
    p = urllib.parse.urlsplit(url)
    host = (p.hostname or "").lower()
    parts = [x for x in p.path.split("/") if x]

    if host in (
        "careers.smartrecruiters.com",
        "jobs.smartrecruiters.com"
    ) and parts:
        return "smartrecruiters", parts[0]

    if host.endswith(".myworkdayjobs.com") and parts:
        if (
            re.fullmatch(r"[a-z]{2}-[a-z]{2}", parts[0], re.I)
            and len(parts) > 1
        ):
            site = parts[1]
        else:
            site = parts[0]

        return "workday", (host.split(".")[0], site)

    if host.endswith((
        ".jobs.personio.de",
        ".jobs.personio.com"
    )):
        return "personio", None

    if host == "careers.pageuppeople.com" and len(parts) >= 3:
        return "pageup", "/".join(parts[:3])

    if base._board_type(url)[0] != "jsonld":
        return "existing", None

    return "html", None


def _post_json(url, body):
    base._public_https(url)

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": base.USER_AGENT
        }
    )

    opener = urllib.request.build_opener(
        base._SafeRedirect
    )

    with opener.open(
        request,
        timeout=base.TIMEOUT
    ) as response:

        content = response.read(base.MAX_BYTES + 1)

        if len(content) > base.MAX_BYTES:
            raise ValueError("Response too large")

        return json.loads(content)


def _scan_provider(name, url):
    kind, slug = _kind(url)
    jobs = []

    if kind == "existing":
        jobs, status, message = base.scan_company({
            "name": name,
            "url": url
        })

        if status != "monitoring":
            raise ValueError(message)

        return jobs

    if kind == "smartrecruiters":

        for page in range(PAGE_LIMIT):
            endpoint = (
                "https://api.smartrecruiters.com"
                f"/v1/companies/{slug}/postings"
                f"?limit=100&offset={page * 100}"
            )

            data = base._get_json(endpoint)

            for row in data.get("content", []):
                loc = row.get("location") or {}

                place = ", ".join(
                    str(x)
                    for x in (
                        loc.get("city"),
                        loc.get("country")
                    )
                    if x
                )

                title = (
                    row.get("name")
                    or row.get("title")
                    or ""
                )

                if not (
                    EGYPT.search(place)
                    and ROLE.search(title)
                ):
                    continue

                detail = row

                if len(jobs) < DETAIL_LIMIT and row.get("id"):
                    try:
                        detail = base._get_json(
                            "https://api.smartrecruiters.com"
                            f"/v1/companies/{slug}/postings/"
                            f"{row['id']}"
                        )
                    except (OSError, ValueError):
                        pass

                sections = (
                    (detail.get("jobAd") or {})
                    .get("sections")
                    or {}
                )

                desc = " ".join(
                    x.get("text", "")
                    if isinstance(x, dict)
                    else str(x)
                    for x in sections.values()
                )

                job_url = (
                    detail.get("postingUrl")
                    or detail.get("applyUrl")
                    or (
                        "https://jobs.smartrecruiters.com"
                        f"/{slug}/{row.get('id')}"
                    )
                )

                jobs.append(
                    base._job(
                        name,
                        title,
                        place,
                        job_url,
                        desc,
                        detail.get("releasedDate"),
                        (
                            row.get("typeOfEmployment") or {}
                        ).get("label", "")
                    )
                )

            if (page + 1) * 100 >= data.get("totalFound", 0):
                break

    elif kind == "workday":
        tenant, site = slug
        p = urllib.parse.urlsplit(url)

        endpoint = (
            f"https://{p.hostname}"
            f"/wday/cxs/{tenant}/{site}"
        )

        paths = [x for x in p.path.split("/") if x]

        if re.fullmatch(
            r"[a-z]{2}-[a-z]{2}",
            paths[0],
            re.I
        ):
            prefix = "/".join(paths[:2])
        else:
            prefix = paths[0]

        details = 0

        for page in range(PAGE_LIMIT):

            data = _post_json(
                endpoint + "/jobs",
                {
                    "appliedFacets": {},
                    "limit": 20,
                    "offset": page * 20,
                    "searchText": ""
                }
            )

            for row in data.get("jobPostings", []):

                title = row.get("title") or ""
                loc = row.get("locationsText") or ""
                path = row.get("externalPath") or ""

                if not (
                    path
                    and EGYPT.search(loc)
                    and ROLE.search(title)
                ):
                    continue

                description = ""

                if details < DETAIL_LIMIT:
                    try:
                        info = (
                            base._get_json(endpoint + path)
                            .get("jobPostingInfo")
                            or {}
                        )

                        description = (
                            info.get("jobDescription") or ""
                        )

                    except (OSError, ValueError):
                        pass

                    details += 1

                job_url = (
                    f"https://{p.hostname}/{prefix}{path}"
                )

                jobs.append(
                    base._job(
                        name,
                        title,
                        loc,
                        job_url,
                        description,
                        row.get("postedOn")
                    )
                )

            if (page + 1) * 20 >= data.get("total", 0):
                break

    elif kind == "personio":
        host = urllib.parse.urlsplit(url).hostname

        xml = ET.fromstring(
            base._fetch_bytes(
                f"https://{host}/xml?language=en"
            )
        )

        for row in xml.findall(".//position"):

            def get(field):
                return row.findtext(field, default="")

            desc = " ".join(
                " ".join(x.itertext())
                for x in row.findall(
                    "./jobDescriptions/jobDescription"
                )
            )

            job_url = (
                get("url")
                or f"https://{host}/job/{get('id')}"
            )

            jobs.append(
                base._job(
                    name,
                    get("name"),
                    get("office"),
                    job_url,
                    desc,
                    get("createdAt"),
                    get("employmentType")
                )
            )

    elif kind == "pageup":
        host = urllib.parse.urlsplit(url).hostname

        rows = base._get_json(
            f"https://{host}/{slug}/jobs.json"
        )

        if not isinstance(rows, list):
            rows = rows.get(
                "Jobs",
                rows.get("jobs", [])
            )

        for row in rows:

            job_url = urllib.parse.urljoin(
                url,
                row.get("Url")
                or row.get("URL")
                or url
            )

            jobs.append(
                base._job(
                    name,
                    row.get("Title") or row.get("title"),
                    row.get("LocationList")
                    or row.get("Location"),
                    job_url,
                    row.get("Overview"),
                    row.get("ClosingDate")
                )
            )

    else:
        raise ValueError("Unsupported ATS")

    return [job for job in jobs if job]


class _Anchors(HTMLParser):

    def __init__(self):
        super().__init__()
        self.links = []
        self.href = None
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.text = []

    def handle_data(self, data):
        if self.href:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.href:
            self.links.append(
                (
                    self.href,
                    " ".join(self.text).strip()
                )
            )
            self.href = None


def discover_jobs(name, url):
    """Discover public postings and supported ATS links."""

    base._public_https(url)

    kind, _ = _kind(url)

    if kind != "html":
        jobs = _scan_provider(name, url)

        return (
            jobs,
            "monitoring",
            f"{len(jobs)} jobs parsed from {kind}"
        )

    queue = [url]
    visited = set()
    boards = []
    results = []

    origin = urllib.parse.urlsplit(url).hostname

    while queue and len(visited) < 5:

        page = queue.pop(0)

        if page in visited:
            continue

        visited.add(page)

        document = base._fetch_bytes(
            page
        ).decode("utf-8", "replace")

        results.extend(
            base._parse_jsonld(document, name, page)
        )

        parser = _Anchors()
        parser.feed(document)

        next_links = []

        for href, title in parser.links:
            target = urllib.parse.urljoin(page, href)
            parts = urllib.parse.urlsplit(target)

            if parts.scheme != "https" or not parts.hostname:
                continue

            if _kind(target)[0] != "html":
                if target not in boards:
                    boards.append(target)
                continue

            if parts.hostname != origin:
                continue

            path = parts.path.lower()

            relevant = (
                ROLE.search(title)
                or re.search(
                    r"/jobs?/|/positions?/|/vacanc",
                    path
                )
                or re.search(
                    r"/careers|/jobs|/join-us|/openings",
                    path
                )
            )

            if relevant:
                next_links.append(target)

        for target in next_links[:12]:
            if target not in visited and target not in queue:
                queue.append(target)

    if results:
        jobs = list({
            x["id"]: x for x in results
        }.values())

        return (
            jobs,
            "monitoring",
            f"{len(jobs)} structured job postings found"
        )

    for board in boards[:3]:

        try:
            jobs = _scan_provider(name, board)

            return (
                jobs,
                "monitoring",
                f"{len(jobs)} jobs via linked ATS"
            )

        except (OSError, ValueError, KeyError, TypeError):
            continue

    return (
        [],
        "needs_adapter",
        "No readable jobs feed; site may use "
        "JavaScript or a private ATS"
    )
