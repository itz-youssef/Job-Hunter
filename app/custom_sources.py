
"""Public career-site scanner for Job Hunter.

Supports Greenhouse, Lever, Ashby, Workday,
SmartRecruiters, Personio, PageUp and JobPosting HTML.
No extra_adapters.py dependency.
"""

from __future__ import annotations

import hashlib
import html
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from html.parser import HTMLParser


TIMEOUT = 12
MAX_BYTES = 3_000_000
MAX_PAGES = 5
MAX_DETAILS = 20
USER_AGENT = "JobHunterCareersMonitor/2.0"


def _safe_url(url: str) -> str:
    parts = urllib.parse.urlsplit(str(url))
    host = (parts.hostname or "").lower()

    if (
        parts.scheme != "https"
        or not host
        or parts.username
        or parts.password
        or parts.port not in (None, 443)
        or host == "localhost"
        or host.endswith(
            (".local", ".internal", ".localhost")
        )
    ):
        raise ValueError(
            "Only public HTTPS careers URLs are allowed"
        )

    try:
        addresses = socket.getaddrinfo(
            host, 443, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError(
            "Careers hostname could not be resolved"
        ) from exc

    if not addresses or any(
        not ipaddress.ip_address(row[4][0]).is_global
        for row in addresses
    ):
        raise ValueError(
            "Private or non-public network addresses are blocked"
        )

    return urllib.parse.urlunsplit(parts)


class _SecureRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, req, fp, code, msg, headers, newurl
    ):
        _safe_url(newurl)
        return super().redirect_request(
            req, fp, code, msg, headers, newurl
        )


def _bytes(url: str, body: dict | None = None) -> bytes:
    url = _safe_url(url)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/html,application/xml,*/*",
    }

    # The public Siemens Software API validates its official careers
    # page Referer. Match the regular site's navigation request.
    if urllib.parse.urlsplit(url).hostname == "prod-search-api.jobsyn.org":
        headers["Referer"] = "https://jobs.sw.siemens.com/"
        headers["Accept"] = "application/json"

    data = None

    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        url, data=data, headers=headers
    )

    opener = urllib.request.build_opener(
        _SecureRedirect
    )

    with opener.open(req, timeout=TIMEOUT) as response:
        content = response.read(MAX_BYTES + 1)

        if len(content) > MAX_BYTES:
            raise ValueError("Response exceeded size limit")

        return content


def _json(url: str, body: dict | None = None):
    return json.loads(
        _bytes(url, body).decode("utf-8-sig")
    )


def _clean(value) -> str:
    raw = re.sub(r"<[^>]+>", " ", str(value or ""))
    return " ".join(
        html.unescape(raw).split()
    )[:20000]


def _job(
    company,
    title,
    location,
    url,
    description="",
    published="",
    employment=""
) -> dict:

    url = str(url or "")

    stable = hashlib.sha256(
        (
            company.casefold()
            + "|"
            + url.split("#")[0]
        ).encode()
    ).hexdigest()[:24]

    return {
        "id": "custom-" + stable,
        "company": _clean(company),
        "title": _clean(title),
        "location": _clean(location),
        "url": url,
        "description": _clean(description),
        "published_at": str(published or ""),
        "employment": _clean(employment),
        "source": "Custom Careers",
    }


def _dedupe(jobs: list[dict]) -> list[dict]:
    result = {}

    for job in jobs:
        if job.get("title") and job.get("url"):
            result[job["id"]] = job

    return list(result.values())


def _ats(url: str):
    p = urllib.parse.urlsplit(url)
    host = (p.hostname or "").lower()
    seg = [s for s in p.path.split("/") if s]

    if host.endswith(".bamboohr.com") and host.count(".") == 2:
        return "bamboohr", host

    if host.endswith(".breezy.hr") and host.count(".") == 2:
        return "breezy", host

    if host.endswith(".recruitee.com") and host.count(".") == 2:
        return "recruitee", host

    if host == "jobs.sw.siemens.com" and "/jobs" in p.path:
        return "siemens_software", None

    if host == "te.eg" and "/about-te/careers-and-training" in p.path:
        return "telecom_egypt", None

    if host == "careers.itworx.com":
        return "itworx", None

    if host in ("sumerge.com", "www.sumerge.com") and p.path.startswith("/careers"):
        return "workable", "sumerge-1"

    if host == "apply.workable.com" and seg:
        return "workable", seg[0]

    if host in ("linkdevelopment.com", "www.linkdevelopment.com") and p.path.startswith("/careers/opportunities"):
        return "linkdevelopment", None

    from app.oracle_adapter import supports as oracle_supports
    if oracle_supports(url):
        return "oracle", None

    if host in (
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
    ) and seg:
        return "greenhouse", seg[0]

    if host == "jobs.lever.co" and seg:
        return "lever", seg[0]

    if host == "jobs.ashbyhq.com" and seg:
        return "ashby", seg[0]

    if host in (
        "careers.smartrecruiters.com",
        "jobs.smartrecruiters.com",
    ) and seg:
        return "smartrecruiters", seg[0]

    if host.endswith(".myworkdayjobs.com") and seg:
        index = (
            1
            if re.fullmatch(
                r"[a-z]{2}-[a-z]{2}", seg[0], re.I
            ) and len(seg) > 1
            else 0
        )

        return "workday", (
            host.split(".")[0],
            seg[index],
            "/".join(seg[:index + 1]),
        )

    if host.endswith((
        ".jobs.personio.de",
        ".jobs.personio.com",
    )):
        return "personio", host

    if (
        host == "careers.pageuppeople.com"
        and len(seg) >= 3
    ):
        return "pageup", "/".join(seg[:3])

    return "html", None


def _location(location) -> str:

    if isinstance(location, list):
        return ", ".join(
            filter(
                None,
                (_location(v) for v in location)
            )
        )

    if isinstance(location, str):
        return (
            "Egypt"
            if location.upper() == "EG"
            else location
        )

    if not isinstance(location, dict):
        return ""

    if "address" in location:
        return _location(location["address"])

    if isinstance(location.get("name"), str):
        return location["name"]

    pieces = [
        location.get(k)
        for k in (
            "addressLocality",
            "addressRegion",
            "addressCountry",
        )
    ]

    if not any(pieces):
        pieces = [
            location.get(k)
            for k in ("city", "region", "country")
        ]

    return ", ".join(
        _location(v)
        for v in pieces
        if v
    )


class _PageParser(HTMLParser):

    def __init__(self):
        super().__init__()
        self.blocks = []
        self.links = []
        self._script = False
        self._script_parts = []
        self._href = None
        self._anchor_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if (
            tag == "script"
            and "application/ld+json"
            in attrs.get("type", "").lower()
        ):
            self._script = True
            self._script_parts = []

        if tag == "a":
            self._href = attrs.get("href")
            self._anchor_text = []

        if tag == "iframe" and attrs.get("src"):
            self.links.append((
                attrs["src"],
                "iframe jobs"
            ))

    def handle_data(self, data):
        if self._script:
            self._script_parts.append(data)

        if self._href is not None:
            self._anchor_text.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._script:
            self.blocks.append(
                "".join(self._script_parts)
            )
            self._script = False

        if tag == "a" and self._href is not None:
            self.links.append((
                self._href,
                " ".join(self._anchor_text)
            ))
            self._href = None


def _postings(node):

    if isinstance(node, list):
        for obj in node:
            yield from _postings(obj)

    elif isinstance(node, dict):
        kinds = node.get("@type") or []

        kinds = (
            kinds
            if isinstance(kinds, list)
            else [kinds]
        )

        if any(
            str(k).split("/")[-1] == "JobPosting"
            for k in kinds
        ):
            yield node

        for field in (
            "@graph",
            "mainEntity",
            "itemListElement",
        ):
            if field in node:
                yield from _postings(node[field])


def _structured_jobs(
    name: str,
    page: str,
    content: str
) -> list[dict]:

    parser = _PageParser()
    parser.feed(content)

    result = []

    for block in parser.blocks:
        try:
            data = json.loads(block)
        except (ValueError, TypeError):
            continue

        for item in _postings(data):
            title = item.get("title", "")

            if not title:
                continue

            loc = _location(
                item.get("jobLocation")
            )

            if (
                not loc
                and str(
                    item.get("jobLocationType", "")
                ).upper() == "TELECOMMUTE"
            ):
                loc = "Remote - " + _location(
                    item.get(
                        "applicantLocationRequirements"
                    )
                )

            link = urllib.parse.urljoin(
                page,
                str(item.get("url") or page)
            )

            if (
                urllib.parse.urlsplit(link).scheme
                != "https"
            ):
                continue

            result.append(
                _job(
                    name,
                    title,
                    loc,
                    link,
                    item.get("description", ""),
                    item.get("datePosted", ""),
                    item.get("employmentType", ""),
                )
            )

    return result


def _board_jobs(name: str, url: str) -> list[dict]:

    kind, meta = _ats(url)
    p = urllib.parse.urlsplit(url)
    jobs = []

    if kind == "siemens_software":
        from app.egypt_public_feeds import siemens_software
        return _dedupe(siemens_software(name, _json, _job))

    if kind == "telecom_egypt":
        from app.egypt_public_feeds import telecom_egypt
        return _dedupe(telecom_egypt(name, _json, _job))

    if kind == "itworx":
        from app.public_feeds import itworx
        return _dedupe(itworx(name, _json, _job))

    # Public Workable careers widget (also powers Sumerge)
    if kind == "workable":
        from app.public_feeds import workable
        return _dedupe(workable(name, meta, _json, _bytes, _structured_jobs, _job))

    # Link Development's public Egypt careers list
    if kind == "linkdevelopment":
        from app.public_feeds import link_development
        return _dedupe(link_development(name, url, _bytes, _job))

    # Public Oracle Candidate Experience recruiting pages
    if kind == "oracle":
        from app.oracle_adapter import scan as scan_oracle
        return _dedupe(scan_oracle(name, url, _json, _job))

    # BAMBOOHR: publicly displayed careers listings and selected job details.
    elif kind == "bamboohr":
        feed = _json(f"https://{meta}/careers/list")
        rows = feed.get("result") or []
        if not isinstance(rows, list):
            raise ValueError("Unexpected BambooHR careers list schema")
        details_done = 0
        for item in rows:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("id") or "")
            title = str(item.get("jobOpeningName") or "")
            if not job_id or not title:
                continue
            location = _location(item.get("atsLocation")) or _location(item.get("location"))
            if not location and item.get("country"):
                location = _location(item.get("country"))
            detail = {}
            if details_done < MAX_DETAILS and re.search(
                r"egypt|cairo|giza|alexandria", location, re.I
            ):
                details_done += 1
                try:
                    detail = _json(f"https://{meta}/careers/{urllib.parse.quote(job_id, safe='')}/detail")
                except (OSError, ValueError, TypeError):
                    pass
            description = str(
                detail.get("description")
                or detail.get("jobOpeningDescription")
                or detail.get("descriptionHtml")
                or ""
            )
            jobs.append(_job(
                name, title, location, f"https://{meta}/careers/{urllib.parse.quote(job_id, safe='')}",
                description, detail.get("datePosted") or "", item.get("employmentStatusLabel")
            ))

    # BREEZY: company-scoped public listing feed; some boards omit descriptions.
    elif kind == "breezy":
        rows = _json(f"https://{meta}/json")
        if not isinstance(rows, list):
            raise ValueError("Unexpected Breezy career portal schema")
        for item in rows:
            if not isinstance(item, dict):
                continue
            location = _location(item.get("location"))
            if not location:
                location = _location(item.get("locations"))
            link = item.get("url") or ""
            if not link:
                slug = str(item.get("friendly_id") or "")
                if not slug:
                    continue
                link = f"https://{meta}/p/{urllib.parse.quote(slug, safe='')}"
            kind_data = item.get("type")
            employment = kind_data.get("name", "") if isinstance(kind_data, dict) else kind_data or ""
            jobs.append(_job(
                name, item.get("name"), location, link, "",
                item.get("published_date"), employment
            ))

    # RECRUITEE: official company-scoped published offers feed.
    elif kind == "recruitee":
        data = _json(f"https://{meta}/api/offers/")
        rows = data.get("offers", [])
        if not isinstance(rows, list):
            raise ValueError("Unexpected Recruitee offers schema")
        for offer in rows:
            if not isinstance(offer, dict):
                continue
            loc = offer.get("locations") or []
            if not isinstance(loc, list):
                loc = []
            location = ", ".join(
                filter(None, (_location(item) for item in loc))
            ) or _location(offer.get("location")) or offer.get("city") or ""
            apply_url = (
                offer.get("careers_url")
                or f"https://{meta}/o/{urllib.parse.quote(str(offer.get('slug') or ''), safe='')}"
            )
            description = " ".join(
                str(offer.get(key) or "")
                for key in ("description", "requirements")
            )
            jobs.append(
                _job(
                    name,
                    offer.get("title"),
                    location,
                    apply_url,
                    description,
                    offer.get("published_at"),
                    offer.get("employment_type_code"),
                )
            )

    # GREENHOUSE
    elif kind == "greenhouse":
        slug = urllib.parse.quote(meta, safe="")

        data = _json(
            "https://boards-api.greenhouse.io"
            f"/v1/boards/{slug}/jobs?content=true"
        )

        for item in data.get("jobs", []):
            jobs.append(
                _job(
                    name,
                    item.get("title"),
                    _location(item.get("location")),
                    item.get("absolute_url"),
                    item.get("content"),
                    item.get("updated_at"),
                )
            )

    # LEVER
    elif kind == "lever":
        slug = urllib.parse.quote(meta, safe="")

        data = _json(
            "https://api.lever.co"
            f"/v0/postings/{slug}?mode=json"
        )

        for item in data:
            cat = item.get("categories") or {}

            jobs.append(
                _job(
                    name,
                    item.get("text"),
                    cat.get("location"),
                    item.get("hostedUrl"),
                    item.get("descriptionPlain")
                    or item.get("description"),
                    item.get("createdAt"),
                    cat.get("commitment"),
                )
            )

    # ASHBY
    elif kind == "ashby":
        slug = urllib.parse.quote(meta, safe="")

        data = _json(
            "https://api.ashbyhq.com"
            f"/posting-api/job-board/{slug}"
        )

        for item in data.get("jobs", []):

            if item.get("isListed", True):
                jobs.append(
                    _job(
                        name,
                        item.get("title"),
                        item.get("location"),
                        item.get("jobUrl"),
                        item.get("descriptionPlain")
                        or item.get("descriptionHtml"),
                        item.get("publishedAt"),
                        item.get("employmentType"),
                    )
                )

    # SMARTRECRUITERS
    elif kind == "smartrecruiters":
        slug = urllib.parse.quote(meta, safe="")

        for page in range(MAX_PAGES):
            data = _json(
                "https://api.smartrecruiters.com"
                f"/v1/companies/{slug}/postings"
                f"?limit=100&offset={page * 100}"
            )

            rows = data.get("content") or []

            for item in rows:
                loc = _location(item.get("location"))
                job_id = str(item.get("id") or "")
                details = item

                if (
                    job_id
                    and re.search(
                        r"egypt|cairo|giza|alexandria",
                        loc,
                        re.I
                    )
                    and len(jobs) < MAX_DETAILS
                ):
                    try:
                        details = _json(
                            "https://api.smartrecruiters.com"
                            f"/v1/companies/{slug}/postings/"
                            + urllib.parse.quote(
                                job_id, safe=""
                            )
                        )
                    except (
                        urllib.error.HTTPError,
                        urllib.error.URLError,
                        ValueError,
                    ):
                        details = item

                sections = (
                    (details.get("jobAd") or {})
                    .get("sections")
                    or {}
                )

                description = " ".join(
                    str(v.get("text", ""))
                    if isinstance(v, dict)
                    else str(v)
                    for v in sections.values()
                )

                link = (
                    details.get("postingUrl")
                    or details.get("applyUrl")
                    or (
                        "https://jobs.smartrecruiters.com"
                        f"/{slug}/{job_id}"
                    )
                )

                typ = item.get(
                    "typeOfEmployment"
                ) or {}

                jobs.append(
                    _job(
                        name,
                        item.get("name")
                        or item.get("title"),
                        loc,
                        link,
                        description,
                        details.get("releasedDate"),
                        (
                            typ.get("label", "")
                            if isinstance(typ, dict)
                            else typ
                        ),
                    )
                )

            if (
                not rows
                or (page + 1) * 100
                >= data.get("totalFound", 0)
            ):
                break

    # WORKDAY
    elif kind == "workday":
        tenant, site, public_prefix = meta

        endpoint = (
            f"https://{p.hostname}/wday/cxs/"
            f"{urllib.parse.quote(tenant, safe='')}/"
            f"{urllib.parse.quote(site, safe='')}"
        )

        detail_count = 0

        for page in range(MAX_PAGES):

            data = _json(
                endpoint + "/jobs",
                {
                    "appliedFacets": {},
                    "limit": 20,
                    "offset": page * 20,
                    "searchText": "",
                }
            )

            rows = data.get("jobPostings") or []

            for item in rows:

                title = item.get("title") or ""
                location = (
                    item.get("locationsText") or ""
                )
                path = (
                    item.get("externalPath") or ""
                )

                if not path:
                    continue

                description = ""

                if (
                    detail_count < MAX_DETAILS
                    and re.search(
                        r"egypt|cairo|giza|alexandria",
                        location,
                        re.I
                    )
                ):
                    try:
                        detail = _json(
                            endpoint + path
                        )
                        description = (
                            detail.get(
                                "jobPostingInfo"
                            ) or {}
                        ).get(
                            "jobDescription"
                        ) or ""

                    except (
                        urllib.error.HTTPError,
                        urllib.error.URLError,
                        ValueError,
                    ):
                        pass

                    detail_count += 1

                public_url = (
                    f"https://{p.hostname}/"
                    f"{public_prefix}{path}"
                )

                jobs.append(
                    _job(
                        name,
                        title,
                        location,
                        public_url,
                        description,
                        item.get("postedOn"),
                    )
                )

            if (
                not rows
                or (page + 1) * 20
                >= data.get("total", 0)
            ):
                break

    # PERSONIO
    elif kind == "personio":
        host = p.hostname

        root = ET.fromstring(
            _bytes(
                f"https://{host}/xml?language=en"
            )
        )

        for position in root.findall(
            ".//position"
        ):

            def field(key):
                return position.findtext(
                    key, default=""
                )

            description = " ".join(
                " ".join(item.itertext())
                for item in position.findall(
                    "./jobDescriptions/jobDescription"
                )
            )

            jobs.append(
                _job(
                    name,
                    field("name"),
                    field("office"),
                    field("url")
                    or (
                        f"https://{host}/job/"
                        f"{field('id')}"
                    ),
                    description,
                    field("createdAt"),
                    field("employmentType"),
                )
            )

    # PAGEUP (PUBLIC JSON FEED WHEN AVAILABLE)
    elif kind == "pageup":
        feed = _json(
            f"https://{p.hostname}/{meta}/jobs.json"
        )

        rows = (
            feed
            if isinstance(feed, list)
            else feed.get(
                "Jobs",
                feed.get("jobs", [])
            )
        )

        for item in rows:
            link = urllib.parse.urljoin(
                url,
                item.get("Url")
                or item.get("URL")
                or ""
            )

            jobs.append(
                _job(
                    name,
                    item.get("Title")
                    or item.get("title"),
                    _location(
                        item.get("LocationList")
                        or item.get("Location")
                    ),
                    link,
                    item.get("Overview"),
                    item.get("ClosingDate"),
                )
            )

    else:
        raise ValueError("Unrecognized ATS")

    return _dedupe(jobs)


def _discover(name: str, url: str):

    queue = [url]
    visited = set()
    board_links = []
    found_jobs = []

    home_host = (
        urllib.parse.urlsplit(url).hostname
    )

    while queue and len(visited) < 6:

        page = queue.pop(0)

        if page in visited:
            continue

        visited.add(page)

        content = _bytes(page).decode(
            "utf-8", "replace"
        )

        found_jobs.extend(
            _structured_jobs(
                name, page, content
            )
        )

        parser = _PageParser()
        parser.feed(content)

        # Some careers pages embed an ATS URL in a script rather than an
        # ordinary anchor. Only recognize known, public ATS host patterns.
        normalized_html = html.unescape(content).replace("\\/", "/")
        for candidate in re.findall(
            r'https://(?:jobs\.ashbyhq\.com|jobs\.lever\.co|boards\.greenhouse\.io|'
            r'job-boards\.greenhouse\.io|apply\.workable\.com|'
            r'[A-Za-z0-9-]+\.recruitee\.com|'
            r'[A-Za-z0-9-]+\.bamboohr\.com|'
            r'[A-Za-z0-9-]+\.breezy\.hr)/[^\s"\x27<>\\]+',
            normalized_html,
            re.I,
        ):
            candidate = candidate.rstrip(".,);")
            if _ats(candidate)[0] != "html" and candidate not in board_links:
                board_links.append(candidate)

        for href, label in parser.links:

            target = urllib.parse.urljoin(
                page, href
            )

            parts = urllib.parse.urlsplit(
                target
            )

            if (
                parts.scheme != "https"
                or not parts.hostname
            ):
                continue

            kind, _ = _ats(target)

            if kind != "html":

                if target not in board_links:
                    board_links.append(
                        target
                    )

            elif (
                parts.hostname == home_host
                and (
                    re.search(
                        r"jobs?|careers?|openings?|positions?|vacanc|join-us",
                        parts.path,
                        re.I
                    )
                    or re.search(
                        r"engineer|developer|intern|graduate|job",
                        label,
                        re.I
                    )
                )
            ):
                if (
                    target not in visited
                    and target not in queue
                    and len(queue) < 15
                ):
                    queue.append(target)

    # A single JobPosting on a careers landing page is often just a
    # featured vacancy, not the complete board. Collect linked ATS feeds
    # before deciding what the source can monitor.
    board_jobs = []
    successful_boards = 0

    for board in board_links[:4]:
        try:
            rows = _board_jobs(name, board)
            successful_boards += 1
            board_jobs.extend(rows)
        except (
            OSError,
            ValueError,
            KeyError,
            TypeError,
            ET.ParseError,
        ):
            continue

    jobs = _dedupe(found_jobs + board_jobs)

    if successful_boards:
        return (
            jobs, "monitoring",
            f"{len(jobs)} postings found (linked boards: {successful_boards})",
        )

    if found_jobs:
        # Parsing a single listing does not establish that the careers
        # page has a complete feed. Report limited coverage explicitly.
        return (
            jobs, "partial",
            f"{len(jobs)} structured posting(s); no complete job feed verified",
        )

    return (
        [], "needs_adapter",
        "No readable public JobPosting feed; "
        "a company-specific adapter may be needed",
    )


def scan_company(company: dict):
    """Return (jobs, status, reason)."""

    name = str(
        company.get("name") or ""
    ).strip()

    url = str(
        company.get("url") or ""
    ).strip()

    if not name or not url:
        return (
            [],
            "invalid",
            "Company name and careers URL are required",
        )

    try:
        _safe_url(url)

        kind, _ = _ats(url)

        if kind == "html":
            return _discover(
                name, url
            )

        jobs = _board_jobs(
            name, url
        )

        if kind == "linkdevelopment" and not jobs:
            return (
                [], "needs_adapter",
                "Public listings rendered dynamically; no complete feed was extracted",
            )

        return (
            jobs,
            "monitoring",
            f"{len(jobs)} jobs parsed from {kind}",
        )

    except urllib.error.HTTPError as exc:

        if exc.code in (401, 403, 429):
            return (
                [],
                "access_blocked",
                f"Careers website returned HTTP {exc.code}",
            )

        if exc.code == 404:
            return (
                [],
                "needs_adapter",
                "Public careers feed not found (HTTP 404)",
            )

        return (
            [],
            "error",
            f"Careers website returned HTTP {exc.code}",
        )

    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        ET.ParseError,
    ) as exc:

        return (
            [],
            "error",
            str(exc)[:200],
        )
