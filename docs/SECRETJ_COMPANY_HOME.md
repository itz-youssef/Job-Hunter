# Secret J company homepage and member account activation

## Public experience

**https://www.jobsnow.tech/** is the new Secret J landing page with brand mark, story, mission, vision, offerings and Job Hunter product section. The official company LinkedIn link is https://www.linkedin.com/company/secretj/home/. No founder's name appears on the public landing.

Guests see Log in and Sign up. Authenticated users see a top-right Profile dropdown, offering My profile, CV, saved jobs, applications, settings, and (for a server-verified admin only) the Admin console. The existing Job Hunter dashboard remains available at /#radar or /#jobs; job scanning and email workflows were not altered.

## Saved data and password security

Accounts, salted password hashes, session hashes, role, member profile, personal preferences, saved jobs, application pipeline, CV, photo, and admin audit trail are all stored in **Neon PostgreSQL**. Passwords are **one-way scrypt hashes with per-user random salts**, not plaintext or reversibly encrypted. Secure HttpOnly cookie sessions keep a random token and the database stores only its SHA-256 hash.

The first administrator is a real registered user with role admin in the database. Register your own account and promote only that account via a one-time Neon SQL Editor update, as documented in [SECRETJ_NEON_SETUP.md](SECRETJ_NEON_SETUP.md). No default admin credential is embedded in the frontend.

By default, the account's signup/login email is the email shown as the personal notification destination. The preference is saved to sj_preferences. **Individualized email delivery is not operational yet**; the current SMTP scanner is still a separate shared system. An email-verification and password-reset flow is required before unrestricted public launch.

## Google button

Google sign-in is displayed as **Coming soon** and disabled. There is no fake Google login route.

## Optional Connect LinkedIn

The backend provides a secure consent-based OAuth 2.0 / OpenID Connect account link, **not social login**. It requires a LinkedIn developer application authorized for the Sign in with LinkedIn using OpenID Connect product. Only basic profile information is accessible using the openid, profile and email scopes (name, optional primary email, profile photo). Employment/education history and certifications are not available through the normal scopes. No LinkedIn scraping is performed.

To activate LinkedIn:

1. Open https://www.linkedin.com/developers/apps, create/select a Secret J application associated with the official company page, and enable Sign in with LinkedIn using OpenID Connect in Products.
2. Add the exact authorized callback to LinkedIn: **https://www.jobsnow.tech/api/secretj-linkedin?action=callback**
3. Apply [LinkedIn migration 002](../database/migrations/002_secretj_linkedin_oauth.sql) once in Neon SQL Editor. It is idempotent.
4. Set the following **server-only Vercel Production variables** and redeploy:

| Variable | Value |
| --- | --- |
| LINKEDIN_CLIENT_ID | Your LinkedIn app Client ID |
| LINKEDIN_CLIENT_SECRET | Your LinkedIn app Client Secret |
| LINKEDIN_REDIRECT_URI | https://www.jobsnow.tech/api/secretj-linkedin?action=callback |

The Connect LinkedIn button remains disabled until all required configuration is present. OAuth authorization state is random, expires after ten minutes, is single-use, and is bound to the signed-in user. Auth tokens are never persisted. The linked name fills the local profile only if empty; original login email and alert destination do **not** change.

LinkedIn metadata is saved in sj_linkedin_connections, and the user can disconnect it without deleting their career profile.

## Deployment

The original migration 001 needs to be installed before migration 002. Account backend still needs DATABASE_URL configured in **Vercel Production Environment Variables**, with a successful production deployment. Both the landing and account code are prepared in GitHub, but neither a successful merge nor a Neon SQL Editor screenshot alone proves an active Vercel build.

Do not publicly invite users before testing signup, sign-in, role protections, CV ownership, and OAuth with approved app credentials. Rotate any old Neon connection secret that was sent outside secure variable storage. Preserve GitHub Actions, Cloudflare Cron and current alerts.
