"""Read-only browser diagnostics for public career pages.

Only runs in PR test CI, never in the production monitoring workflow.
"""
from collections import Counter
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SITES = {
    "ITWorx": "https://careers.itworx.com/",
    "Sumerge": "https://www.sumerge.com/careers/job-openings",
    "Paymob": "https://origin.paymob.com/en/careers",
    "Orange": "https://orange.jobs/gb/en/africa-middle-east/egypt",
    "Link Development": "https://linkdevelopment.com/careers/opportunities/",
    "Breadfast": "https://www.breadfast.com/careers/",
}

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        try:
            for name, url in SITES.items():
                print(f"DIAG_START {name}", flush=True)
                page = browser.new_page(viewport={"width": 1280, "height": 860})
                events = []
                def track(res):
                    if any(x in res.url.lower() for x in (
                        "/api/", ".json", "/jobs", "/vacancies", "/career", "/requisition"
                    )) and len(events) < 80:
                        events.append((res.status, res.url.split("?")[0]))
                    if any(x in res.url.lower() for x in (
                        "workable.com/api/v1/widget", "freshteams/v1/jobs",
                        "/serverapp/api/requisition/"
                    )) and res.ok:
                        try:
                            body = res.json()
                            if name == "ITWorx" and isinstance(body, dict) and "AllRequisitions" in body:
                                rows = body.get("AllRequisitions") or []
                                print("DIAG_ITWORX", "method", res.request.method,
                                      "request", str(res.request.post_data)[:350],
                                      "total", body.get("TotalCount"),
                                      "first", str(rows[0] if rows else {})[:1300], flush=True)
                            if name == "Sumerge" and isinstance(body, dict) and "jobs" in body:
                                rows = body.get("jobs") or []
                                print("DIAG_SUMERGE", "total", len(rows), "first",
                                      str(rows[0] if rows else {})[:1400], flush=True)
                            if name == "Breadfast":
                                print("DIAG_BREADFAST", str(body)[:750], flush=True)
                            print("DIAG_API_SCHEMA", name, res.url.split("?")[0],
                                  "top", list(body)[:15] if isinstance(body, dict) else "list",
                                  "items", len(body) if isinstance(body, list) else "",
                                  "first", str(
                                      (body[0] if body else {}) if isinstance(body, list)
                                      else {k: str(v)[:180] for k,v in body.items() if k in
                                            ("jobs","results","data","count","total","items")}
                                  )[:1400], flush=True)
                        except Exception as exc:
                            print("DIAG_API_ERROR", name, type(exc).__name__, flush=True)
                page.on("response", track)
                try:
                    response = page.goto(url, wait_until="domcontentloaded", timeout=22000)
                    page.wait_for_timeout(1500)
                    links = page.locator("a[href]").evaluate_all("""
                        els => els.map(a => ({
                          text: (a.innerText || '').trim().slice(0, 90),
                          href: a.href,
                          context: (a.parentElement?.innerText || '').trim().slice(0, 175)
                        }))
                    """)
                    plausible = [l for l in links if any(x in (
                        l["text"] + " " + l["href"] + " " + l["context"]).lower()
                        for x in ["job", "career", "open", "vacanc", "software", "engineer", "intern",
                                  "graduate", "position", "apply", "qa", "platform"])]
                    print("DIAG_RESULT", name, "HTTP", response.status if response else "-",
                          "URL", page.url.split("?")[0], "title", page.title(),
                          "links", len(links), "plausible", len(plausible),
                          "cards", page.locator("[class*=job], [class*=position], [class*=vacanc]").count(),
                          "jsonld", page.locator('script[type="application/ld+json"]').count(),
                          flush=True)
                    for l in plausible[:15]:
                        print("DIAG_LINK", name, l["text"], l["href"].split("?")[0],
                              "context", l["context"][:130], flush=True)
                    grouped = Counter((status, urlsplit(url).hostname, urlsplit(url).path[:100])
                                      for status, url in events)
                    for (status, host, path), count in grouped.most_common(12):
                        print("DIAG_RESPONSE", name, status, host, path, count, flush=True)
                except (PlaywrightTimeout, Exception) as exc:
                    print("DIAG_ERROR", name, type(exc).__name__, str(exc)[:230], flush=True)
                finally:
                    page.close()
        finally:
            browser.close()

if __name__ == "__main__":
    run()
