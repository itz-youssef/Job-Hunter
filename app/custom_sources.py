
"""Read jobs from public careers pages.

Supported:
- Greenhouse
- Lever
- Ashby
- Public JSON-LD JobPosting pages
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

from html.parser import HTMLParser
from typing import Any


USER_AGENT = "JobHunterCareersMonitor/1.0"
MAX_BYTES = 3_000_000
TIMEOUT = 12


def _public_https(url: str) -> str:
    value = urllib.parse.urlsplit(url)
    hostname = (value.hostname or "").lower()

    if (
        value.scheme != "https"
        or not hostname
        or value.username
        or value.password
        or (value.port is not None and value.port != 443)
    ):
        raise ValueError("Only public HTTPS URLs are supported")

    if hostname == "localhost" or hostname.endswith(
        (".local", ".internal", ".localhost")
    ):
        raise ValueError("Local URLs are blocked")

    try:
        records = socket.getaddrinfo(
            hostname, 443, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError("Host does not resolve") from exc

    if not records:
        raise ValueError("Unresolvable host")

    for record in records:
        address = ipaddress.ip_address(record[4][0])
        if not address.is_global:
            raise ValueError("Private network address blocked")

    return urllib.parse.urlunsplit(value)


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, req, fp, code, msg, headers, newurl
    ):
        _public_https(newurl)
        return super().redirect_request(
            req, fp, code, msg, headers, newurl
        )


def fetch_bytes(url: str) -> bytes:
    url = _public_https(url)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.5",
        },
    )

    opener = urllib.request.build_opener(SafeRedirect)

    with opener.open(request, timeout=TIMEOUT) as response:
        data = response.read(MAX_BYTES + 1)

        if len(data) > MAX_BYTES:
            raise ValueError("Response size exceeded limit")

        return data


def get_json(url: str) -> Any:
    return json.loads(fetch_bytes(url).decode("utf-8-sig"))


def plain(value: Any) -> str:
    result = re.sub(r"<[^>]*>", " ", str(value or ""))
    return " ".join(html.unescape(result).split())[:20000]


def make_job(
    company,
    title,
    location,
    url,
    description="",
    published_at="",
    employment="",
):
    stable = hashlib.sha256(
        (company.lower() + "|" + url.split("#")[0]).encode()
    ).hexdigest()[:24]

    return {
        "id": "custom-" + stable,
        "company": company,
        "title": plain(title),
        "location": plain(location),
        "description": plain(description),
        "employment": employment,
        "url": url,
        "published_at": published_at,
        "source": "Custom Careers",
    }


def board_type(url):
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    paths = [p for p in parsed.path.split("/") if p]

    if host in {
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
    } and paths:
        return "greenhouse", paths[0]

    if host == "jobs.lever.co" and paths:
        return "lever", paths[0]

    if host == "jobs.ashbyhq.com" and paths:
        return "ashby", paths[0]

    return "jsonld", None


class JsonLdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_script = False
        self.parts = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script" and any(
            k.lower() == "type"
            and v
            and "application/ld+json" in v.lower()
            for k, v in attrs
        ):
            self.in_script = True
            self.parts = []

    def handle_data(self, data):
        if self.in_script:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self.in_script:
            self.blocks.append("".join(self.parts))
            self.in_script = False


def walk_jsonld(node):
    if isinstance(node, list):
        for item in node:
            yield from walk_jsonld(item)

    elif isinstance(node, dict):
        types = node.get("@type", [])
        types = types if isinstance(types, list) else [types]

        if "JobPosting" in types or any(
            str(t).endswith("/JobPosting") for t in types
        ):
            yield node

        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in node:
                yield from walk_jsonld(node[key])


def ld_location(value):
    if isinstance(value, list):
        return ", ".join(
            x for item in value if (x := ld_location(item))
        )

    if isinstance(value, str):
        return value

    if not isinstance(value, dict):
        return ""

    address = value.get("address", value)

    if isinstance(address, str):
        return address

    if not isinstance(address, dict):
        return ""

    return ", ".join(
        str(address[k])
        for k in (
            "addressLocality",
            "addressRegion",
            "addressCountry",
        )
        if address.get(k)
    )


def parse_jsonld(page, company, page_url):
    parser = JsonLdParser()
    parser.feed(page)

    jobs = []

    for block in parser.blocks:
        try:
            data = json.loads(block.strip())
        except (ValueError, json.JSONDecodeError):
            continue

        for posting in walk_jsonld(data):
            title = posting.get("title", "")
            if not title:
                continue

            location = ld_location(posting.get("jobLocation"))

            if (
                not location
                and posting.get("jobLocationType") == "TELECOMMUTE"
            ):
                location = "Remote - " + ld_location(
                    posting.get("applicantLocationRequirements")
                )

            url = str(posting.get("url") or page_url)
            url = urllib.parse.urljoin(page_url, url)

            jobs.append(
                make_job(
                    company,
                    title,
                    location,
                    url,
                    posting.get("description", ""),
                    str(posting.get("datePosted") or ""),
                    str(posting.get("employmentType") or ""),
                )
            )

    return jobs


def unique(jobs):
    seen = set()
    result = []

    for job in jobs:
        if job["id"] not in seen:
            seen.add(job["id"])
            result.append(job)

    return result


def scan_company(company):
    name = str(company.get("name") or "").strip()
    url = str(company.get("url") or "").strip()

    if not name or not url:
        return [], "invalid", "Company name and URL required"

    try:
        _public_https(url)
        mode, slug = board_type(url)

        if mode == "greenhouse":
            data = get_json(
                f"https://boards-api.greenhouse.io/v1/boards/"
                f"{slug}/jobs?content=true"
            )

            jobs = [
                make_job(
                    name,
                    j.get("title", ""),
                    (j.get("location") or {}).get("name", ""),
                    j.get("absolute_url", ""),
                    j.get("content", ""),
                    j.get("updated_at", ""),
                )
                for j in data.get("jobs", [])
                if j.get("title") and j.get("absolute_url")
            ]

        elif mode == "lever":
            data = get_json(
                f"https://api.lever.co/v0/postings/"
                f"{slug}?mode=json"
            )

            jobs = [
                make_job(
                    name,
                    j.get("text", ""),
                    (j.get("categories") or {}).get(
                        "location", ""
                    ),
                    j.get("hostedUrl", ""),
                    j.get("descriptionPlain")
                    or j.get("description", ""),
                    str(j.get("createdAt") or ""),
                    (j.get("categories") or {}).get(
                        "commitment", ""
                    ),
                )
                for j in data
                if j.get("text") and j.get("hostedUrl")
            ]

        elif mode == "ashby":
            data = get_json(
                f"https://api.ashbyhq.com/posting-api/"
                f"job-board/{slug}"
            )

            jobs = [
                make_job(
                    name,
                    j.get("title", ""),
                    j.get("location", ""),
                    j.get("jobUrl", ""),
                    j.get("descriptionPlain")
                    or j.get("descriptionHtml", ""),
                    j.get("publishedAt", ""),
                    j.get("employmentType", ""),
                )
                for j in data.get("jobs", [])
                if j.get("title")
                and j.get("jobUrl")
                and j.get("isListed", True)
            ]

        else:
            page = fetch_bytes(url).decode(
                "utf-8", errors="replace"
            )

            jobs = parse_jsonld(page, name, url)

            if not jobs:
                return (
                    [],
                    "needs_adapter",
                    "No JobPosting data found. "
                    "Custom adapter required.",
                )

        jobs = unique(jobs)

        return (
            jobs,
            "monitoring",
            f"{len(jobs)} jobs parsed",
        )

    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
    ) as error:

        if (
            isinstance(error, urllib.error.HTTPError)
            and error.code in (401, 403, 429)
        ):
            return (
                [],
                "access_blocked",
                f"Website returned HTTP {error.code}",
            )

        return [], "error", str(error)[:220]
