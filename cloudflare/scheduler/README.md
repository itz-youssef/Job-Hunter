# Cloudflare Cron for Job Hunter (free)

This is a **separate scheduled-only Worker**, not your existing Cloudflare website. It sends GitHub workflow_dispatch requests to your existing Python scanners. It does not host Python or SMTP and cannot guarantee when a GitHub runner starts.

## Schedule (Cloudflare UTC)

| Trigger | Existing GitHub Actions workflow | Frequency |
|---|---|---|
| */5 * * * * | custom-companies.yml | Every 5 minutes |
| 3,18,33,48 * * * * | monitor.yml | Every 15 minutes, offset from custom scans |

Before dispatch, the Worker checks the latest main-branch Actions runs. If either scanner is queued or active, it skips that tick. A same-workflow dispatch in the previous 4 minutes is also skipped. Existing workflow concurrency and job/email deduplication are unchanged. This Worker has no public HTTP endpoint.

## One-time setup (never paste or commit secret values)

1. Create a GitHub **fine-grained Personal Access Token**:
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Resource owner: **itz-youssef**. Repository access: **Only select repositories → Job-Hunter**.
   - Permission: **Actions: Read and write** (Metadata read-only is automatic).
   - Use a reasonable expiration; rotate before expiration.
2. In Cloudflare, locate the account hosting your existing Job Hunter website.
   - Find its **Account ID** (not the zone ID).
   - Create an **API Token** with the **Edit Cloudflare Workers** template, limited to this account.
3. In GitHub **itz-youssef/Job-Hunter** → Settings → Secrets and variables → Actions → Repository secrets, add:
   - GH_SCHEDULER_PAT = the GitHub token above.
   - CLOUDFLARE_API_TOKEN = Cloudflare token above.
   - CLOUDFLARE_ACCOUNT_ID = Cloudflare Account ID.
4. GitHub → Actions → **Cloudflare Scheduler** → **Run workflow** on **main** with deploy checked.
   - Runs tests, deploys a **separate** Worker named job-hunter-scheduler, puts GH_DISPATCH_TOKEN inside Cloudflare as a private Worker secret, and verifies the secret name exists.
   - Do not put token values in source files, issues, logs or chat.
5. Cloudflare → Workers & Pages → **job-hunter-scheduler** → Settings → Triggers → Cron Triggers: confirm both schedules. Propagation can take up to **15 minutes**.
6. GitHub → Actions → **Job Hunter Custom Careers**: verify workflow_dispatch runs arrive approximately every five minutes. **Job Hunter Monitor** should dispatch every 15 minutes. Skipped ticks are expected if the previous scan is still active. GitHub accepting the dispatch is not proof email reached the inbox.
7. **Only after verifying Cloudflare-triggered scans**, in GitHub → Settings → Secrets and variables → Actions → Variables, add a Repository variable:
   - Name: CLOUDFLARE_SCHEDULER_ACTIVE
   - Value: true
   - This disables the legacy GitHub scheduled jobs and completion-chain jobs while preserving manual workflow_dispatch.

**Rollback:** change CLOUDFLARE_SCHEDULER_ACTIVE to false (or delete it) to resume the old GitHub jobs without data migration, then disable the Cloudflare Worker so you do not keep triggering extra jobs.

## Testing and limits

- PR CI runs Node tests and a Wrangler dry-run, but never deploys secrets or the Worker.
- Production deployment requires a manual workflow_dispatch on main.
- No public HTTP endpoint (workers_dev = false). Only the scheduled handler is exported.
- GitHub Actions on public repositories and Cloudflare Cron Worker have free plan usage, subject to their quotas and policies.
- GH_SCHEDULER_PAT requires one repo's Actions write permission only. If it expires, Cloudflare logs HTTP 401/403. Refresh that GitHub secret and rerun Cloudflare Scheduler deployment.
- External dispatch removes dependence on GitHub's unreliable schedule events, but GitHub runners can still queue. **Five-minute email delivery is not guaranteed.**

## Unchanged

The company adapters (including Blink22, SAP and Breadfast Technology), Egypt/junior filtering, existing SQLite history, SMTP alert deduplication, existing Cloudflare dashboard and Vercel deployment.
