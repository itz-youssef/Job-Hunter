# Job Hunter

A private, Egypt-focused job-monitoring website with a Python backend, SQLite history, SMTP alerts and a configurable 30-second polling target.

Start with [DEPLOYMENT.md](DEPLOYMENT.md). The hosted static Site is a preview; Docker runs the complete website and background worker.

## Layout
- `app/main.py`: authenticated FastAPI endpoints and website
- `app/db.py`: schema, baseline, identity deduplication and outbox
- `app/sources.py`: Workday, Siemens, Microsoft and generic JobPosting readers
- `app/filters.py`: explainable title/description matching
- `app/mail.py`: secure SMTP delivery and uncertain-state handling
- `app/worker.py`: polling, per-source backoff, history and process lock
- `dist/`: responsive website shared by preview and real deployment
- `tests/`: meaningful core and security tests
- `compose.yml`: independent web/worker services and persistent database volume
- `.github/workflows/tests.yml`: CI tests, not a polling scheduler

## Honest status
This is an initial implementation, not a fully verified production service. Vodafone/VOIS access is unresolved; Fawry is included but requires access/adapter validation. SMTP credentials and VM deployment have not been configured. A careers URL is not automatically a supported source. The first scan is silent. A job's discovery timestamp is distinct from its publication date.

## Adding adapters
Add a function accepting `(source, client)` and returning normalized records with stable external IDs, descriptions and official HTTPS job URLs. Use the policy-aware HTTP client, follow all pagination, and raise SourceError for restricted access or incomplete schemas. Register the adapter in `fetch`, then add source-specific fixture and live tests before enabling it. Do not return an empty list to conceal a failed scrape.

## Requirements
Python 3.12; Linux/WSL for worker file locking; SMTP account permitting STARTTLS. No paid APIs, LLMs or subscriptions are required. Free hosting availability is conditional; see deployment guide.
