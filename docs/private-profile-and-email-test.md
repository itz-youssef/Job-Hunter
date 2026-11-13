# Job Hunter — Private Profile Backup & Email Test

The **public** `itz-youssef/Job-Hunter` repository must **never** contain private resumes, profile photographs, personal contact details, or a token.

## Works immediately without a database
- **My Profile**: editable fields, profile photograph, CV import for selectable-text PDF and DOCX, and browser-local IndexedDB persistence.
- **CV Holder**: local PDF/DOCX storage up to 10 MB.
- Parsing happens in your browser. PDF.js is loaded from a pinned public CDN; it receives JavaScript files only, not your CV.
- The PDF parser requires internet to load the library. Image-only/scanned PDFs are not supported without OCR.
- Chrome profiles/domains/devices do not share their IndexedDB. Export/download CV backups.

## Optional: free cloud backup through a separate GitHub PRIVATE repo

1. On GitHub, create a new repository **with Private visibility**, e.g. `itz-youssef/job-hunter-private-profile`. Initialize it with a README, so it has a `main` branch. Keep the repository private.
2. Create a fine-grained GitHub Personal Access Token scoped **only** to the private repository with **Contents: Read and write**. This is a storage credential; do not use it in browser JavaScript or commit it to the public repo.
3. On Vercel project settings → Environment Variables (Production), set:
   - `PROFILE_GITHUB_REPO=itz-youssef/job-hunter-private-profile`
   - `PROFILE_GITHUB_TOKEN=<private repository-scoped token>`
   - `PROFILE_GITHUB_BRANCH=main` (optional)
   - `ADMIN_TOKEN=<existing strong admin token>` (must be at least 24 characters)
4. Redeploy the Vercel project for the environment variable changes to take effect.
5. Open **My Profile → Private cloud backup** on the **Vercel** dashboard; enter the admin token when prompted. To backup the actual file, use **CV Holder → Back up CV privately**.

Safety:
- The API verifies that the target GitHub repository has `private: true`. It refuses to store data in the public Job Hunter repository, even if it has write access.
- No private CV/profile data is sent to Cloudflare or written to `dist/data.json`.
- Cloud CV backup supports **2 MB** PDF or DOCX files to remain within serverless request limits; larger CVs stay local.
- Private GitHub is a personal storage option, not a multi-user authentication system. This is for one owner's profile.
- GitHub private repository access and your Vercel tokens remain under your account control. GitHub and Vercel remain third-party providers; the data is not end-to-end encrypted against them.
- If the private repo is deleted or credentials are lost, re-enable access and use your local backup.

## Test email directly from Job Hunter
Your GitHub Actions workflow `.github/workflows/test-email.yml` sends a **real** SMTP test when run. The website can request the workflow from **Vercel → Email Alerts → Send test email**.

Requirements:
1. Existing GitHub Actions secrets: `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ALERT_EMAIL`; optional `SMTP_HOST`, `SMTP_PORT`.
2. Vercel Production env: `ADMIN_TOKEN`, `GITHUB_REPO=itz-youssef/Job-Hunter`, `GITHUB_TOKEN` with **Actions: Read and write** for that repository.
3. Redeploy Vercel after setting the token permissions.
4. Use **Check latest test** in Vercel or GitHub Actions history; the test result `success` means the SMTP server accepted the email, not that it reached your inbox. Check inbox/spam.

The Cloudflare static site has no private Vercel API or session. Use the workflow link there or open the Vercel dashboard for a one-click test. Do not publish your admin token or GitHub tokens.
