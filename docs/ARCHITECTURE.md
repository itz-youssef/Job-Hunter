# Architecture & operational model

## Responsibilities and boundaries

Job Hunter has three distinct runtime components; each has a different source of truth.

| Component | Running where? | Truth it provides |
|---|---|---|
| Cron scheduler | Cloudflare scheduled-only Worker | When dispatch was **requested**; it does not run Python |
| Python monitors | GitHub Actions | Source extraction, eligibility, persistent state, SMTP acceptance |
| Dashboard | Cloudflare static site or Vercel | Published job/report snapshots and public GitHub run metadata |

The files for the dashboard and the scheduler live in the same repository, but deploying one **does not** automatically update the other. Cloudflare's dashboard currently uses a separate production branch and reads public snapshots from `main`. Vercel deploys files from its configured production branch.

### Runtime and data flow

~~~text
Cloudflare scheduler (Cron UTC)
  ├── custom-companies.yml (every 5m)
  │     ├── companies.json -> app/custom_sources.py -> source-specific adapters
  │     ├── app/filters.py
  │     ├── data/custom_seen.json  [durable baseline + seen IDs]
  │     ├── dist/data.json
  │     ├── dist/custom-status.json
  │     ├── dist/notification-status.json [masked metadata only]
  │     └── SMTP notifications [filtered, deduplicated]
  └── monitor.yml (:03/:18/:33/:48 UTC)
        ├── state/history.sqlite [durable outbox and job records]
        ├── app/run_once.py
        ├── app/notify_once.py + app/mail.py
        └── dist/data.json -> GitHub Pages export

Dashboard:
  - Jobs: dist/data.json
  - Source coverage + last snapshot: dist/custom-status.json
  - Masked SMTP config: dist/notification-status.json
  - Actual workflow status: public GitHub Actions workflow-run API
~~~

The two Python workflows share the GitHub concurrency group `job-hunter-published-state`. Cloudflare checks active runs before creating a dispatch; the GitHub-level group remains a second guard. The fallback GitHub schedule stays enabled until the owner sets `CLOUDFLARE_SCHEDULER_ACTIVE=true` after observing successful Cloudflare-triggered dispatches.

## What "up to date" means in the UI

1. **Next cron slot**: computed locally from the Worker schedule, rounded to the next future minute. This is an estimate, not a run event.
2. **Latest actual run**: queried from GitHub's public Actions API for each scanner separately. The dashboard shows success, failure, running/queued or unknown. Skipped fallback runs are ignored.
3. **Last published custom report**: `checked_at` from `dist/custom-status.json`. The UI labels it overdue if older than 15 minutes; "published" is **not** equivalent to "all sources succeeded".
4. **Jobs**: supplied by `dist/data.json` and filtered again for browser presentation. A detected vacancy can be excluded for missing location/experience evidence.
5. **Delivery**: the scanner reports SMTP acceptance, never mailbox receipt. Posting time and discovery time are different fields.

Run metadata is fetched without browser credentials from the public repo, with per-workflow queries every 180 seconds. Requests can be rate-limited, blocked or fail: the dashboard must degrade gracefully to the persisted snapshot, never invent the latest run. The snapshot itself is refreshed every 60 seconds while the app is open.

### Deployment-specific expectations

- **Cloudflare static site**: when running on its current `workers.dev` host, the dashboard uses `raw.githubusercontent.com/itz-youssef/Job-Hunter/main` for published results. Code/template changes need a deployment on `fix/cloudflare-readonly-dashboard`.
- **Vercel**: serves static files and separate `api/` routes; a GitHub push alone does not prove the correct production deploy finished. Watch Vercel build limits and branch configuration. Dynamic API actions are unavailable on the static Cloudflare site.
- **Cron Worker**: deployed separately via `.github/workflows/cloudflare-scheduler.yml`, not through the frontend assets deployment.
- **GitHub**: scheduled checks can be skipped/delayed; any workflow showing `workflow_dispatch` might be a manual run or a scheduled Worker dispatch. Inspect timing/logs before attributing cause.

## Why modules are not deleted opportunistically

`dist/index.html` is a standalone HTML/CSS/JS bundle with broad regression coverage; some other `dist/assets` files support alternative or legacy pages. The project also retains FastAPI/Compose entry points, source adapters and historical state. A filename that seems unused by the main dashboard is **not proof of dead code**. Any removal must include:

1. A full reference/deployment reachability audit.
2. Checks that no import, HTML page, API entry point, script, or workflow references the file.
3. A separate PR that removes it with targeted tests and documented rollback.
4. Verification that state history and email delivery cannot be reset by the change.

## Safe change boundaries

- Filter policy changes require explicit regression tests; don't include foreign/senior jobs just to increase counts.
- New employer adapters need a source-shaped fixture, stable ID and URL, clear paging/country evidence, live smoke, and explicit partial/blocked reporting.
- No raw CV, email recipient, API token, or admin credential is allowed in public static JSON or browser JS.
- Keep first-scan baselines, pending alerts and outbox identity unchanged.
- Keep the custom and core monitors' schedules, dashboard labels and scheduling contract tests aligned when cadence changes.

Additional information: [Cloudflare Scheduler runbook](../cloudflare/scheduler/README.md), [Contributing](CONTRIBUTING.md), [Source coverage](egypt-employer-source-audit.md).
