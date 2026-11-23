# Verified-email signup — Secret J

Users registering a **new account** must prove ownership of their chosen email before the account, profile or session exists. Existing members and current sessions stay untouched.

## Server flow

1. POST /api/secretj-auth?action=register — validate password and consent; rate-limit; create an expiring *pending* registration record containing a scrypt hash of the chosen password and salted code hash (never plaintext passwords/codes); send the code via existing Resend integration.
2. POST /api/secretj-auth?action=verify-signup — increment guesses atomically, check one-time code and expiry, consume the challenge and create `sj_users`+`sj_profiles` together in one SQL statement, then issue a session.
3. POST /api/secretj-auth?action=resend-signup — send at most twice more (maximum three deliveries), after a 60-second cooldown; keep the original expiry and failed-attempt counter.

The code is valid for 10 minutes, with five guesses. The challenge cannot be restarted for an email while active. Expired pending registrations may be replaced. The pending table contains no activated accounts and uses private RLS, with no PUBLIC access.

## Production deployment

- Apply `database/migrations/011_signup_email_verification.sql` (applied in Neon during implementation).
- The public website's `cloudflare/site/wrangler.toml` enables `SECRETJ_SIGNUP_OTP_ENABLED=true`; this does **not** modify the separate scheduler Worker.
- Both `RESEND_API_KEY` and `SECRETJ_EMAIL_FROM` must exist as private environment credentials on the **site** Worker, with the sender domain verified. If delivery is not configured, new signup fails closed with HTTP 503 rather than creating an unverified account.
- Confirm on production with a fresh *test* address that an initial signup returns a challenge but no auth cookie, the emailed code activates the account, and replay fails. Automated tests simulate Resend; they cannot prove real inbox delivery.
- Registration fails closed when email delivery is unavailable. To temporarily stop registrations, use `SECRETJ_REGISTRATION_ENABLED=false`; do not bypass email ownership verification.

## Scope

No changes to login OTP, Dictionary, Job Feed, job scanning or notifications. New registrations only: this does not retroactively verify accounts created before rollout.
