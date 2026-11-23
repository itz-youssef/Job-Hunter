# LinkedIn Connect and detailed CV profile activation

## What the current integration does

Secret J already has a signed-in-member OAuth 2.0/OpenID Connect flow at
`/api/secretj-linkedin?action=start`. It requests **openid profile email** only,
and returns through an expiring, user-bound, single-use OAuth state.
Approved basic fields (name, email and photo URL) are stored in the member's
private Neon connection row; only an empty profile display name may be filled.
It does **not** replace the member's Secret J login email or email-alert destination,
and does not scrape LinkedIn or claim access to education, employment history,
projects, certifications or skills.

## Activate LinkedIn in production

1. In [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
   create/select the Secret J application and enable **Sign In with LinkedIn
   using OpenID Connect**, subject to LinkedIn approval.
2. Register this exact authorized redirect URL in that application:

   `https://www.jobsnow.tech/api/secretj-linkedin?action=callback`

3. In the **Cloudflare site Worker** `jobhunter-youssef`, set these as
   server-side encrypted secrets or configuration (never commit values):
   - `LINKEDIN_CLIENT_ID` — LinkedIn application Client ID
   - `LINKEDIN_CLIENT_SECRET` — LinkedIn application Client Secret
   - `LINKEDIN_REDIRECT_URI` —
     `https://www.jobsnow.tech/api/secretj-linkedin?action=callback`
4. Confirm the domain `www.jobsnow.tech` is the same host as the member's
   active Secret J session cookie. The OAuth callback uses that same session.
5. Verify by signing into Secret J, opening Account → Profile, selecting
   **Connect with LinkedIn**, consenting to the scope request, and confirming
   connected status, imported metadata, disconnect functionality and error
   behavior. An unconfigured environment shows a visible, non-working CTA
   with an explicit setup notice; it must not imply activation.

## Activate expanded CV profile sections

Run `database/migrations/012_professional_profile_details.sql` once in the
**live Neon production branch's SQL Editor**, after checking its target project.
The migration adds seven private text fields and is idempotent.
It preserves all existing profile values. No public table grants are added.

Until this migration is applied, the profile API retains legacy read/save
compatibility, hides expanded fields, and avoids claiming that those details
are saved. In CI, migration 012 is applied twice on disposable PostgreSQL.

## Data quality and consent

The PDF/DOCX parser works in the browser, without uploading the CV to an
outside parsing service, but an uploaded CV file itself is stored in the
member's private Neon account as requested. Readable sections are imported
only into previously empty fields. The member must review extracted
information; scanned/image-only documents are not supported without OCR.
LinkedIn data must be used only with granted scopes and user consent.

## Validation before announcing launch

- OIDC success and failure round-trips on the production domain
- No OAuth secrets or access tokens leaked to browser, logs or database
- Migration 012 applied and all seven new fields persist after refresh
- Upload/import and re-import with an existing manually edited profile
- Existing Secret J account preferences, job matching and email alerts unchanged
