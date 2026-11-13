# Secret J / Neon: production activation runbook

The new multi-user backend lives alongside the existing Python scanner. Cloudflare Cron, existing SMTP notifications, legacy local CV storage and private GitHub profile backup are **untouched**. This rollout does not migrate or erase previous data.

## Step 1 — Create the schema (once)

Open https://console.neon.tech/ → your Neon project → **SQL Editor**, and execute the entire file [Secret J migration](../database/migrations/001_secret_j_multitenant.sql). It creates only new tables prefixed sj_ (users, sessions, profiles, preferences, jobs, applications, CV and avatars). No old scanner state is altered.

The connection is server-side and privileged. Non-owner roles have no public table grants/RLS policies; server-side API queries enforce the current authenticated user ID. Do not enable anonymous Neon Data API access to these tables.

## Step 2 — Configure Vercel secrets

In **Vercel → Job Hunter → Settings → Environment Variables**, add:

| Variable | Value | Availability |
| --- | --- | --- |
| DATABASE_URL | Your current **pooled** Neon PostgreSQL connection string | Server-only, Production |
| SECRETJ_REGISTRATION_ENABLED | false initially; true to enable signup | Server-only, Production |

Never prefix DATABASE_URL with NEXT_PUBLIC_ or put its value in frontend assets. The repo pins the official Neon serverless Node driver in package.json. Keep the existing Vercel Output Directory as **dist**; preserve serverless **api/** routes. After modifying environment variables, deploy the latest main commit again.

## Step 3 — Test your account

Open https://www.jobsnow.tech/account.html after a successful Vercel deployment. Set SECRETJ_REGISTRATION_ENABLED=true temporarily and deploy if you need to create a first account.

Register with your email and a password of at least 12 characters, log out, then log back in. Test profile edits, cloud-saved jobs, application stages, CV upload/download and avatar upload. Repeat from a separate browser to confirm cloud persistence. Check that a separate test account sees only its own data.

### First administrator

After creating your own account, use **Neon SQL Editor** once:

~~~sql
UPDATE public.sj_users
SET role='admin'
WHERE email='replace-with-your-registered-email@example.com' AND is_active=true
RETURNING email, role;
~~~

Only promote an account you personally created and control. The client cannot grant itself admin. Sign out and back in; the **Admin** tab should appear. From it you can inspect and suspend members, change roles and read audit logs.

## What this version includes

- Account signup/login/logout with salted scrypt password hashes and private seven-day HttpOnly, SameSite=Lax cookies.
- Database-backed profile (skills/education/experience), personal job filters, saved jobs, application tracker, photo and private CV.
- Admin dashboard and audit trail.
- Per-user database queries, origin checks, parameterized SQL and basic IP/email attempt throttling.
- Small private binary files in PostgreSQL: **CV up to 768 KiB**, **avatar up to 100 KiB**, not publicly addressable. For scaling, move them to private Neon Object Storage.
- Existing cloud/job scanner and SMTP behavior unchanged. Personal email preferences are stored but user-specific email delivery is **not yet active**.

## Launch gates / limitations

This first version is a **pilot**: before publicly inviting users, implement verified email ownership, password reset and stronger abuse mitigation. Initial sign-up can remain disabled while you test. Do not promote accounts based solely on an unverified email address.

No cloud provider credentials are committed or accessible in the browser. If an earlier connection URL was disclosed, replace it before production use and save the replacement only in Vercel's encrypted environment variables.

CI tests use fake SQL and verify isolation/security boundaries. They do **not** prove the live Neon database, Vercel deployment or DNS are configured. Confirm an actual signup/login on the production domain before public launch.

## Rollback

Set SECRETJ_REGISTRATION_ENABLED=false to block registrations. Revert only the frontend/API PR if needed. Do **not** drop Neon tables or reset job-history files; existing GitHub Actions and Cloudflare Scheduler keep running as before.
