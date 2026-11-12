# Job Hunter — deployment guide

## What you have

A single-owner website with a FastAPI API, a separate Python polling worker, SQLite history, source adapters, an email outbox, tests and Docker Compose. The published ChatGPT Site is an interactive static preview; it does not execute Python. Download the project from its Deployment guide to run the real application.

Default watchlist: Vodafone/VOIS, Siemens, Valeo, Microsoft and Fawry. All sources start paused. The default polling target is 30 seconds, measured after a completed scan. A slow scan, other sources, robots crawl delays or backoff extend this interval. There is no guarantee of detecting a vacancy within 30 seconds of publication.

## 1. Choose hosting that can stay running

Use a Linux VM you already have, or an Oracle Cloud Always Free VM if one is available to your account. Choose only a shape and storage explicitly marked Always Free in your console. Do not rely on the temporary trial credit. Capacity shortages, account eligibility and idle-instance reclamation can prevent reliable free hosting. Do not upgrade to a paid plan for this project. If no free always-on VM is available, genuinely unattended 30-second polling cannot be guaranteed at zero cost.

Official references:
- https://www.oracle.com/cloud/free/
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/

GitHub Actions is used only for tests. Its minimum schedule interval is five minutes, and execution can be delayed. Sleeping inside a long-running workflow is not a free, reliable replacement for a server.

## 2. Install Docker on your VM

Use Ubuntu 24.04 or another supported Linux distribution. Follow Docker's official installation guide for Docker Engine and the Compose plugin:
https://docs.docker.com/engine/install/ubuntu/

Check:

```bash
docker --version
docker compose version
```

Keep inbound access limited to SSH initially. Do not expose port 8000 publicly: the supplied Compose configuration binds it to 127.0.0.1. The application uses HTTP Basic authentication, which must be inside an SSH tunnel or HTTPS connection.

## 3. Copy and configure the project

Download `job-hunter-source.zip` from the website. Extract it on your VM, enter the `job-hunter` directory, then:

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Set:

```text
ADMIN_USER=admin
ADMIN_PASSWORD=<a unique random password of at least 16 characters>
DB_PATH=/data/jobs.db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your Gmail address>
SMTP_PASSWORD=<your Google app password>
SMTP_FROM=<your Gmail address>
```

You can use another provider that permits authenticated SMTP with STARTTLS on port 587. Provider quotas and availability apply. Do not paste credentials into the dashboard, GitHub, a URL or a public chat. This app sends email; it does not read your inbox.

For personal Gmail: enable 2-Step Verification and create an App Password if your account offers that feature. Use the app password, not your normal Google password. Some managed or protected accounts do not offer App Passwords; use an eligible SMTP account instead.
https://support.google.com/accounts/answer/185833

If using GitHub to store this project, keep `.env` ignored. A server deployment needs credentials in the server environment; GitHub Secrets alone do not populate the VM. The included CI workflow does not require SMTP credentials.

## 4. Start both processes

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 worker
```

There must be one web service and one worker. Do not scale workers: an OS file lock also prevents duplicate workers sharing the database. Compose restarts both services after failure or VM reboot when Docker starts.

## 5. Open the actual website securely

On your own computer, open a terminal and create an SSH tunnel (replace the key and host):

```bash
ssh -i /path/to/key -L 8000:127.0.0.1:8000 ubuntu@YOUR_VM_IP
```

Open http://localhost:8000 in your browser. Sign in with ADMIN_USER and ADMIN_PASSWORD. This tunnel is only for accessing the dashboard: the worker continues running when you close it or switch off your computer.

For a normal HTTPS URL accessible on your phone, use a domain or a free hostname you control, point it to your VM, and configure an HTTPS reverse proxy such as Caddy. Follow its official setup guide, open inbound ports 80/443, and proxy to 127.0.0.1:8000. Do not expose Basic authentication over public plain HTTP. Configure Uvicorn trusted proxy headers only for your local proxy; otherwise the API's Origin checks will reject HTTPS writes. Do not set trust to `*` on a publicly reachable backend. The SSH-tunnel deployment above works without a domain or any purchase.

## 6. Configure email and sources

1. Open **Email & preferences**.
2. Save your destination email address and preferred keywords/locations.
3. Click **Send test email** and verify that it arrives (including spam).
4. Enable email alerts and save.
5. Open **Companies**, review the actual source terms and its permitted polling frequency, then enable supported sources.
6. The first complete scan per source is a silent baseline. Existing jobs appear in the feed but are not emailed as new.
7. Later qualifying new source IDs enter the outbox. Delivery activity records sent, failed or uncertain attempts.

All five sources are listed, but they do not all have verified unattended access:
- **Valeo:** Workday public search/detail reader with complete pagination. Missing publication dates remain unknown; Workday's `startDate` is not assumed to mean publication date.
- **Siemens:** Avature public HTML search/detail reader. Searches the portal for Egypt and follows its Next links. This is not guaranteed coverage of every Siemens subsidiary or country assignment. Existing details are cached.
- **Microsoft:** Current Eightfold search endpoint for Egypt plus JobPosting JSON-LD detail extraction. Uses displayed requisition IDs, not description hashes.
- **Vodafone/VOIS:** Included but disabled: direct access returned 403 during research. No unverified adapter pretends to monitor it. Use the official page or official alerts until access and a supported reader can be validated.
- **Fawry:** Included with the generic JobPosting reader. HTTP access was blocked during research and full listing/pagination support is not validated. Keep it paused; use its official careers page meanwhile.
- **Added companies:** Workday URLs are recognized; other URLs use JobPosting JSON-LD from that exact page only. This does not crawl an entire arbitrary careers site or discover pagination. A custom adapter is needed for other layouts. Unsupported pages fail visibly.

Do not use Playwright, proxies, identity spoofing or CAPTCHA bypass to evade site restrictions. Setting 30 seconds does not authorize that frequency. Lower it where terms or rate limits require. Source errors back off for 5 minutes, doubling up to a 6-hour ceiling. A failed scan does not erase history or mark jobs closed.

## 7. Verify before relying on alerts

```bash
docker compose logs --tail=100 web
docker compose logs --tail=100 worker
```

Confirm each enabled source has a successful scan and meaningful job descriptions. Run another scan: it must not create duplicate notifications. Restart both services and confirm jobs remain. Use your real email test to validate SMTP; unit tests do not prove delivery.

The source tests performed during authoring used this environment's existing HTTP proxy with a fixed official-host allowlist because direct DNS resolution was unavailable. Production DNS validation and actual VM access still need testing after deployment. The app deliberately fails closed if it cannot resolve and validate a hostname.

## 8. Back up persistent data

SQLite resides in the named Docker volume `jobs`. `docker compose down` preserves it. **Never use `docker compose down -v` unless you intend to erase history**; losing history causes a new baseline.

Create a consistent backup without copying an open WAL database directly:

```bash
docker compose exec worker python -c "import sqlite3; s=sqlite3.connect('/data/jobs.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d); d.close(); s.close()"
docker compose cp worker:/data/backup.db ./job-hunter-backup.db
```

Store a backup somewhere durable. For restore: stop both services, replace the database with the backup in the volume, remove stale WAL/SHM sidecars only while both services are stopped, preserve UID 10001 ownership, then restart. Practice this on a test deployment first.

## Local development and tests

Linux, macOS or WSL (the worker uses POSIX file locking):

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

To run locally without Docker, export ADMIN_PASSWORD and DB_PATH=data/jobs.db in your terminal environment. Start `uvicorn app.main:app --port 8000` in one terminal and `python -m app.worker` in another, with identical environment variables. Never run multiple workers against the same DB.

## Reliability boundaries

- SMTP is not exactly-once delivery. An interrupted send becomes `uncertain` and is not automatically retried, avoiding blind duplicate emails. Check the mailbox before any manual retry.
- Confirmed SMTP rejection becomes `failed`; resolve the account or quota issue first. There is no automatic retry of failed SMTP attempts in this version.
- Email provider delivery delay is outside Job Hunter's control.
- The first successful snapshot is the baseline. Jobs posted and removed between snapshots can be missed.
- Existing detail descriptions are cached to reduce traffic. Edits are not new jobs; this version does not continuously reanalyse changed descriptions. Filters are reapplied on scans using stored descriptions.
- Public pages may change and break adapters. Structured failures and run history are visible.
- URL validation rejects private/local addresses and checks redirects. This is a private, single-owner tool, not a public multi-user URL-fetching service. For untrusted users, require a network-level egress allowlist and additional abuse controls before deployment.
- No commercial uptime SLA or guaranteed permanently free capacity is provided by this project.
