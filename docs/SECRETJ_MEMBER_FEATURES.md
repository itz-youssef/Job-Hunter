# Secret J member experience, parsing and verified alerts

## Black/white UI

The shared stylesheet `dist/assets/secretj-global-theme.css` is loaded last on the landing site and account page.

- Dark mode: all backgrounds, cards, inputs, menus, modal dialogs and buttons use black with white text.
- Light mode: all corresponding surfaces are white with black text.
- Only thin gray borders distinguish components. No inverted cards or bright accents.

## CV and profile photo

In Account > CV & Photo:
- PDF/DOCX up to 768 KB is privately stored in Neon. After save, PDF.js or Mammoth extracts selectable text in the browser, maps name, headline, summary, skills, work experience, education, location and links, then fills only the currently empty profile fields in Neon. Existing entries are never overwritten.
- Image-only/scanned PDFs cannot be parsed without OCR. The saved file is retained and a clear parsing warning is displayed rather than inventing data.
- There are Preview, Download, Re-import and Delete controls for saved CVs.
- JPG/PNG/WebP opens a circular portrait editor with drag to center the face, zoom slider, + / - controls and preview. Confirmed photo is saved in Neon as WebP <=100 KB. Cancel discards changes.
- External PDF.js/Mammoth code libraries load from public CDNs; CV bytes are not uploaded to a third-party parsing service.

## Email alerts per member, not admin

The legacy operator `ALERT_EMAIL` remains restricted to backend monitoring workflows. Member test email and periodic alerts NEVER use it. All member recipients derive from the verified session and `sj_users.email` in Neon. The frontend cannot provide an arbitrary recipient address.

**Required activation:**

1. Apply `database/migrations/003_secretj_member_email.sql` in the Neon SQL Editor (after migration 001). It is idempotent and creates two private tables: `sj_email_verifications` and `sj_email_alert_log`.
2. Verify a Secret J sender domain in Resend, then add to Cloudflare website Worker `jobhunter-youssef`, not scheduler Worker:
   - `RESEND_API_KEY`: Secret, real mail API key
   - `SECRETJ_EMAIL_FROM`: sender email on the verified domain, e.g. alerts@jobsnow.tech
   - `SECRETJ_ALERTS_ENABLED`: already set to true in the website Wrangler configuration.
3. For later Vercel deployment, add its own separate `RESEND_API_KEY` and `SECRETJ_EMAIL_FROM` environment variables; Cloudflare's secrets are not shared.
4. On the website, sign in to your account and go to Account > Preferences. Press Send test & verification code. A six-digit code is sent only to your registered account email.
5. Enter the code within ten minutes. Then enable job alert opt-in, choose roles/Egypt/internships, and save.
6. Subsequent Test Email requests go to the same verified account email, rate-limited to once every 15 minutes. A provider-accepted test is not a guarantee of arrival in the inbox.

At minute 17 of every hour the website Worker (separate from existing job-scan scheduler) checks newly published job snapshots, selects opted-in verified members and matches jobs to each user's saved preferences. A per-user/job deduplication table limits repeat sends. The initial batch is deliberately small to suit free-tier hosting. No operator email is used as fallback. Email delivery will not occur before the Neon migration, Resend key and sender are configured.

## Admin tools

Normal users do not see GitHub Actions, source code links, live monitor runs or global SMTP configuration. These are displayed only after account session verification confirms administrator role, while members see personal alerts and career tools. This hides operational UI, not the existence of any public GitHub repository.

## Deployments

CI validates SQL migration idempotency, session ownership, no admin-recipient leaks, CV parser, crop geometry, and Cloudflare bundling. A merged change to `main` triggers direct Cloudflare website deployment; verify `build-version.json` matches the merge commit. Vercel follows the same source but its production deployment may still be blocked by account build limits.

Do not claim email delivery works until Resend settings are installed and a real inbox test succeeds.
