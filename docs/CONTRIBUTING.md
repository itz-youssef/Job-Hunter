# Contributing & maintenance

## Philosophy

Treat Job Hunter as a live notification service, not a disposable scraper. Changes must be testable, reversible, and explicit about partial success. Keep small modules and public contracts stable; avoid broad replacements across unrelated ATS adapters.

## Before making a change

1. Find the active entry point: `.github/workflows/custom-companies.yml`, `monitor.yml`, `cloudflare/scheduler/worker.mjs`, `dist/index.html` or `api/`.
2. Identify dependent modules and durable state (`data/custom_seen.json`, `state/history.sqlite`). Never rewrite historical identity or initialize a new baseline accidentally.
3. Capture the current expected behavior with an offline regression test; for a live feed, include a read-only source smoke test.
4. Create a focused branch/PR. Keep monitoring, UI, credentials and deployment changes isolated wherever possible.

## Local validation

~~~bash
python -m pip install -r requirements-dev.txt
python -m compileall -q app scripts
python -m pytest -q

node --test tests/*.cjs
node --test cloudflare/scheduler/worker.test.mjs
node --check cloudflare/scheduler/worker.mjs
~~~

The live GitHub CI jobs can verify employer websites not reachable locally; a passed unit test is not proof of employer availability. Never send production emails or trigger real workflow_dispatch calls in unit tests.

## Coding conventions

- **Python:** standard library where practical, clear function names, explicit error paths and documented parser assumptions. Use `BeautifulSoup` only when actually needed. Keep request/network dependencies injected into parsers for deterministic tests.
- **JavaScript:** small pure helpers for scheduling/status calculations; validate external data before rendering. Escape user/company text in HTML and restrict links to trusted HTTPS URLs.
- **Providers:** one adapter per distinct ATS/provider family when formats differ; never turn a timeout/403 into a false "0 jobs" health success.
- **Observability:** report the last *actual* run and the last *published* snapshot separately. "Configured", "parsed", "eligible", "SMTP accepted" and "inbox delivered" are different facts.
- **Comments:** explain *why* a boundary or guard exists; avoid repeating self-evident syntax. Record pagination limits, fallback choices and source-specific country rules.
- **Config:** never hardcode credentials, account IDs or secret values in source, README, tests or static assets.

## Pull request acceptance checklist

- [ ] Changed code is documented by tests, including negative/failure paths.
- [ ] Existing ATS sources and junior/Egypt filters remain unchanged unless the PR specifically intends otherwise.
- [ ] Seen IDs, SQLite history and first-run baselines are preserved.
- [ ] No duplicate email alerts or leaked credentials can result from the change.
- [ ] A source result count means what the UI says it means; partial coverage is labeled.
- [ ] Cloudflare cron and dashboard contract tests agree after scheduling changes.
- [ ] All applicable CI tests pass; deployment of the actual website is checked separately.
- [ ] README/runbooks are updated if observable behavior changed.

## Releasing and rollback

- Merge only a CI-green PR. Do not mix experimental employer feeds into a release without live validation.
- On the Cloudflare website branch, deploy the same tested frontend artifact without overwriting Worker-specific configuration.
- Vercel production must be checked independently; build quotas can prevent deploys despite a successful GitHub push.
- For scheduler rollback, set `CLOUDFLARE_SCHEDULER_ACTIVE=false` and disable the Cloudflare scheduled Worker; the old GitHub schedule remains a fallback.
- For source-parser rollback, revert the focused PR. Do not delete historic state to "fix" a missing notification.

See [Architecture](ARCHITECTURE.md), [Scheduler deployment](../cloudflare/scheduler/README.md) and [README](../README.md).
