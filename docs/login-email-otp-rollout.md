# Secret J email sign-in verification — production rollout

The login email OTP feature is **implemented but intentionally opt-in** using
`SECRETJ_LOGIN_OTP_ENABLED=true`. The flag defaults to disabled so a provider
configuration error cannot lock existing account holders out.

## Production prerequisites

1. Apply `database/migrations/010_login_email_verification.sql` to the
   production Neon database. The table stores only SHA-256 hashes of the
   opaque challenge token and of the salted six-digit code. It has RLS and
   no public privileges.
2. Confirm production Resend credentials: `RESEND_API_KEY` and
   `SECRETJ_EMAIL_FROM` (a verified sending domain). Do not put these
   values in git or the browser.
3. Confirm a real test email arrives at an account's **login email**.
   The alert-destination verification can use another address, so its
   success does not establish that login OTP delivery will work.
4. Turn on `SECRETJ_LOGIN_OTP_ENABLED=true` in **the active site Worker**
   `jobhunter-youssef` / hosting environment (not the separate scheduler).
   Deploy/restart, then use a test account to verify the entire flow:
   correct password -> no session -> received code -> successful session;
   wrong and replayed codes must fail.
5. Check the account page after deployment with a real and a mobile browser.
   Existing sessions stay valid until they expire or the user logs out.
6. If provider delivery fails for an account, disable the feature flag
   until the mail issue is resolved; do **not** bypass OTP for that member.

## Security limits

- OTP lifetime 10 minutes; maximum five guesses per challenge.
- Fresh random 32-byte opaque challenge, 6-digit code, per-code salt.
- Code sent only to the saved login email after password validation.
- One code is usable at most once; 60-second resend cooldown,
  maximum three sends per challenge.
- Same-origin POST checks, password rate limit, and private Neon data.
- No session cookie or user profile returned until code verification.
- Separate from subscriber alert-email verification, preferences, and job scanning.
- The registration onboarding remains unchanged; returning sign-ins require OTP
  once enforcement is enabled.

## Test workflow

`node --test tests/test_login_email_otp.cjs tests/test_secretj_accounts.cjs`

Offline tests use mocked Resend and a stubbed Neon query layer. They do
not assert delivery to a real inbox or live Cloudflare configuration.
