# Job Hunter

**An Egypt-focused early-career job discovery and monitoring system.**

Job Hunter brings together employer-specific careers/ATS adapters, explainable eligibility filters, durable job history, and email notifications in a responsive dashboard. Cloudflare Cron requests checks; GitHub Actions executes the Python scanners, preserves their history, and publishes job snapshots.

> **Status:** Working personal project in active development. Employer portals can restrict requests or omit locations and dates. GitHub runners and Cloudflare cron are best effort, not a guaranteed time-to-alert SLA. A parsed vacancy is not necessarily an eligible Egypt-based junior role.

## Architecture

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Official job sources | Python, employer careers pages and ATS APIs | Normalized vacancies with stable IDs and source URLs |
| Eligibility | `app/filters.py` | Egypt, junior/internship and software/AI/ML/CV/MLOps policy |
| Custom companies | `app/custom_monitor.py`, `companies.json` | Source status, matches, dedupe, SMTP alerts |
| Core monitor | SQLite, `app/run_once.py`, `app/notify_once.py` | Durable history, outbox, crash-aware notification delivery |
| Scheduling | Cloudflare Cron Worker | Request custom scans every **5 minutes**, core scans every **15 minutes** |
| Execution | GitHub Actions | Python checks, persistence, email, public JSON publishing |
| Web UI | `dist/index.html` | Jobs, companies, CV/profile workspace and monitoring visibility |
| Hosting | Cloudflare Workers static assets, Vercel | Serve website; scanning runs separately |

~~~text
Official careers + ATS feeds
              |
              v
Cloudflare Cron ---> GitHub workflow_dispatch
                         |
                         v
                   Python scanners
                     /        \
                    v          v
       history + public JSON   SMTP alerts
                    |
                    +----> Cloudflare dashboard (reads GitHub main snapshots)
                    +----> Vercel dashboard (deployment/API-backed instance)
~~~

The scheduler is a **separate Worker**, not the Cloudflare-hosted website. It has no public HTTP handler and stores its GitHub dispatch token as a Cloudflare secret.

## Check timing: promises versus evidence

- Cloudflare requests **custom-company scans every 5 minutes** and **core checks at :03, :18, :33, :48 UTC**.
- `cloudflare/scheduler/worker.mjs` checks the GitHub queue before requesting a run and skips overlapping scans. GitHub still decides when runners start.
- Legacy GitHub `schedule` events remain a fallback until repository variable `CLOUDFLARE_SCHEDULER_ACTIVE=true` is set after confirming Cloudflare runs. Change it to `false` to restore the fallback.
- The dashboard shows the **next expected Cron slot**, the **latest actual GitHub Actions run**, and the **last published custom scan** separately. Real run state comes from GitHub's public, rate-limited API; when unavailable, the site labels it as unknown and continues showing persisted snapshots.
- A successful workflow is not proof all employers returned jobs. SMTP acceptance is not proof of inbox delivery.

See [Cloudflare scheduler setup, security and rollback](cloudflare/scheduler/README.md).

## Secret J accounts (Neon PostgreSQL)

The first multi-user account layer is **separate** from the public job scanning system and the legacy admin-token APIs. It adds:

- A dedicated account page at **/account.html** on Vercel for registration, login, profile, job preferences, cloud bookmarks, tracked applications, private small CV uploads and avatars.
- Admin-only management of account roles/activation with an audit log. There is no hard-coded initial admin user or password.
- Private serverless routes: api/secretj-auth.js, api/secretj-data.js, api/secretj-admin.js; reusable server-only primitives in lib/secretj/.
- New isolated tables starting with sj_ in database/migrations/001_secret_j_multitenant.sql. Existing source history, outbox, scanner, GitHub Actions and Cloudflare Cron are unchanged.

**Not yet provisioned by a GitHub commit:** Neon requires the SQL migration and a server-side DATABASE_URL on Vercel. Activation steps, first admin setup, limitations and rollback are in [Secret J Neon deployment guide](docs/SECRETJ_NEON_SETUP.md). The setup is not live merely because this code merges.

The initial account module is a *pilot*: email verification/password recovery and per-user SMTP job alert delivery are not implemented yet. Do not present it as unrestricted production-ready public authentication. Guest saved jobs still work locally, while signed-in Vercel members save to Neon. Small CV/avatar files use private PostgreSQL bytea temporarily; object storage is the intended scale-up.

## Codebase map

| Area | Files |
| --- | --- |
| Source routing & adapter interfaces | `app/custom_sources.py`, `app/sources.py` |
| Isolated provider/company integrations | `app/egypt_*_feeds.py`, `app/*employers.py`, `app/breadfast_company_board.py`, `app/weak_employer_adapters.py` |
| Relevance & region eligibility | `app/filters.py` |
| Custom scan publication & email | `app/custom_monitor.py` |
| Core scan + durable email outbox | `app/run_once.py`, `app/db.py`, `app/mail.py`, `app/notify_once.py` |
| Public snapshot & browser UI | `dist/data.json`, `dist/custom-status.json`, `dist/index.html` |
| Private Vercel API features | `api/` |
| Cloudflare scheduled-only Worker | `cloudflare/scheduler/` |
| Regression suites | `tests/` |
| Live-source investigation and admin scripts | `scripts/` |

**Preserve state:** `data/custom_seen.json` and `state/history.sqlite` contain critical seen-ID and first-run history. Never delete or reset them to make a new job alert fire. Older assets and legacy app entry points are retained for compatibility until a separate usage/dependency audit proves they are removable.

## Local checks

Python 3.11–3.12 and Node.js 20+ are supported by current workflows.

~~~bash
python -m pip install -r requirements-dev.txt
python -m compileall -q app scripts
python -m pytest -q
node --test tests/*.cjs
node --test cloudflare/scheduler/worker.test.mjs
node --check cloudflare/scheduler/worker.mjs
~~~

Live-source checks may require access to external employer websites. Unit tests use fixture data and mocked network/SMTP calls. The GitHub pull-request workflows run focused suites for changed components.

## Security & data boundaries

- Never commit or expose **Cloudflare API tokens, GitHub PATs, SMTP credentials, admin tokens, full email destinations, or CV contents** in public snapshots.
- Secrets belong only in Cloudflare Worker secrets / GitHub Actions repository secrets. `dist/notification-status.json` publishes masked recipient information.
- Cloudflare frontend is read-only for admin operations. Vercel endpoints have separate authenticated admin operations; the static UI is not an account database.
- CV Holder stores uploaded files **locally in browser IndexedDB** by default. An optional Vercel private backup exists separately. Multi-user accounts and per-user cloud storage are **not implemented** yet.
- First successful source scans set a baseline to avoid historical alert floods. Keep employer publication time distinct from discovery and email times.
- Add employer adapters with stable IDs, official HTTPS posting URLs, strict Egypt evidence and tests. Record partial/inaccessible sources explicitly; do not create fake vacancies to increase job counts.

## Engineering workflow

1. Make targeted changes on a feature branch. Avoid speculative bulk deletions in a live monitoring system.
2. Update or add tests for changed behavior (parsers, filters, UI, history and scheduling).
3. Run syntax checks, focused regression tests, and live-source smoke tests when external feed behavior changes.
4. Confirm PR checks pass before merge; keep deployment and token configuration separate from PR code.
5. Verify real production snapshots and workflow runs after rollout; use rollback procedures if needed.

Further reading: [Architecture and run-state semantics](docs/ARCHITECTURE.md), [Contributor guide](docs/CONTRIBUTING.md), [Employer feed coverage audit](docs/egypt-employer-source-audit.md).

## Operations

- [Custom-company workflow](https://github.com/itz-youssef/Job-Hunter/actions/workflows/custom-companies.yml)
- [Core monitor workflow](https://github.com/itz-youssef/Job-Hunter/actions/workflows/monitor.yml)
- [Scheduler deployment](https://github.com/itz-youssef/Job-Hunter/actions/workflows/cloudflare-scheduler.yml)

**Owner:** [itz-youssef](https://github.com/itz-youssef).
