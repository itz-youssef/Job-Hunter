# Egypt employer expansion — source coverage audit (2026-11-13)

**Goal:** Monitor real, employer-published jobs in Egypt and alert only on eligible early-career software/AI positions. Company presence alone does not imply a working vacancies feed.

## Verified via live CI scan

| Employer | Source | Live records | Coverage |
|---|---|---:|---|
| EY Egypt | SuccessFactors Egypt search | 20 | Monitoring; foreign results excluded |
| PwC Egypt | SuccessFactors Egypt search | 3 | Monitoring |
| Talabat Egypt | Delivery Hero official Egypt + talabat filter | 49 | Monitoring |
| Amazon Egypt | Amazon Jobs Egypt JSON API | 94 | Monitoring |
| Uber Egypt | Uber Oracle Recruiting CE, Egypt search | 0 | Monitoring source; no Egypt postings returned at test time |
| AWS Egypt | Amazon Jobs AWS organization-category filter | 0 | Monitoring source; no matching Egypt roles at test time |
| Teleperformance Egypt | Official Egypt vacancy cards | 4 | Monitoring; mostly non-technical |
| CIB Egypt | Official Taleo public first page | 23 | **Partial**; cannot guarantee full pagination |
| Breadfast | 4DX Ventures Breadfast-linked vacancies | 7 | **Partial**; official Freshteam provider returns an error |
| Breadfast Technology | 4DX portfolio, tech titles only | 0 | **Partial**; tech vacancies may exist off the first page |
| Finaira | Official structured JobPosting | 1 | **Partial**; currently senior-only |
| Blink22 | Official career details | 0 Egypt-verified | **Partial**; location of visible posts not reliably stated |
| Mondia Group | Workable | 2 at last main scan | Existing monitoring, both excluded by early-career criteria |

**These are source listings**, *not* 1:1 eligible jobs. Senior and irrelevant positions remain excluded. A zero can reflect no currently listed matching positions; it does not prove a company has no open jobs anywhere.

## Further requested employers requiring separately validated adapters

- Henkel Egypt: official careers site has a dynamic job search that does not expose records in fetched HTML.
- Coca-Cola HBC Egypt / Coca-Cola Egypt: Avature-based vacancies site is reachable, but Egypt-scoped job extraction needs verification.
- Systems Limited: SAP SuccessFactors career page requires dynamic interaction.
- Globant Egypt: jobs exist, but the client-side job list is not exposed as a verified complete public feed.
- Konecta: careers landing page is reachable, but no usable listing feed was extracted.
- blnk (Egyptian fintech): distinguish from Blink22; the tested Zenats page did not provide a readable public job list.
- Octane: tested careers landing page lacks usable job-detail links.
- HSBC Egypt: Avature job-search page reachable, results need a dedicated adapter.
- Banque Misr, Banque du Caire, National Bank of Egypt: public career pages reachable; live vacancy extraction unverified.
- QNB Egypt: direct listing request returned HTTP 403 during source testing.
- ADIB Egypt: external Taleo careers landing page tested, no public requisition grid extracted.
- FAB Egypt: tested careers hostname could not be resolved.
- Other banks and major employers must be added only after valid official postings and Egypt filtering are verified.

**Important engineering rules:** Never fabricate jobs, posting dates, country, or availability. Never label a partial parser as exhaustive. Existing early-career filtering, first-scan baselines, persistent seen IDs, and email-alert logic stay unchanged. Add adapters with regression tests and a live smoke test before enabling them in the 15-minute schedule.
