# Secret J website on Cloudflare, independent of Vercel

This is for the website Worker **jobhunter-youssef**, not the separate scheduled
Worker **job-hunter-scheduler**. The latest GitHub main frontend and account
APIs deploy to the website Worker without relying on any Vercel build.

- Home: https://jobhunter-youssef.yoyoyasso19.workers.dev/
- Accounts: https://jobhunter-youssef.yoyoyasso19.workers.dev/account.html
- API diagnostics: https://jobhunter-youssef.yoyoyasso19.workers.dev/api/secretj-health
- Current deployed commit: https://jobhunter-youssef.yoyoyasso19.workers.dev/build-version.json
- Workflow: GitHub Actions > Cloudflare Secret J Website

## One-time Neon connection

Even if you added the Neon connection string to Vercel, Cloudflare does not
inherit Vercel's secrets. After the website deploy finishes:

1. Open Cloudflare Dashboard > Workers & Pages > **jobhunter-youssef**.
2. Open **Settings > Variables and Secrets > Add**.
3. Add secret named **DATABASE_URL** of type **Secret**, with the CURRENT,
   rotated Neon **pooled** PostgreSQL URL. Do not put it in a GitHub file,
   frontend script or public environment variable.
4. Save and deploy that Worker version. Reopen the health URL.

Possible health JSON:
- database = not_configured: The Cloudflare Worker is missing DATABASE_URL.
- database = connection_failed: The Neon URL or its connectivity is invalid.
- database = migration_required: Selected Neon database lacks migration 001.
- database = ready, registration_enabled = true: database reachable and signup enabled.

After health is ready, open /account.html on Cloudflare, register a new
member, sign out and log back in, save a profile and confirm it persists.
Cloudflare and Vercel have different session cookies.

To bootstrap the first administrator, register your own known account first,
then in Neon SQL Editor (replace the example email):

    UPDATE public.sj_users SET role='admin'
    WHERE email='your-own-email@example.com'
    RETURNING id,email,role;

No password or admin email is hardcoded. Credentials are salted one-way
scrypt hashes and sessions use hashed random cookies.

## Deployment and limits

GitHub Actions workflow **Cloudflare Secret J Website** builds and tests
the Worker on pull requests, then automatically deploys current main on
relevant pushes. It reuses GitHub repository secrets CLOUDFLARE_API_TOKEN
and CLOUDFLARE_ACCOUNT_ID, previously used by the scheduler; it NEVER
deploys or changes the separate scheduler Worker.

Check that the GitHub deployment job is green and build-version.json
contains the latest commit SHA before claiming the live site changed.
If another old Cloudflare build integration is tracking a stale GitHub
branch, disable its stale deployment or point it to main to avoid
overwriting the new website Worker.

This deploy does not enable Google sign-in, LinkedIn OIDC, or per-user
SMTP fan-out. Saved alert preferences do not send personalized emails yet.

**Cloudflare Workers Free has a 10ms CPU limit.** Strong scrypt password
hashing can exceed that limit, so test a real registration/login once
DATABASE_URL is configured. If Cloudflare logs show CPU Error 1102, do
not weaken the password hashing; use a managed auth service or a runtime
with adequate CPU. Offline tests and Wrangler dry run cannot guarantee
the free plan's request CPU limit.

If health is not ready after deployment, account saving remains
unavailable; no claim of a working database should be made until a
real Neon-backed signup and profile persistence test succeeds.
