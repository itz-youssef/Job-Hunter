# Job eligibility: six-method benchmark and production policy

## What was tested

- Six algorithms were run independently on every one of the 1,295 vacancies in the published Job Hunter snapshot.
- Reference labels were independently reviewed from **117 frozen source records**: **34 clearly compatible**, **44 clearly incompatible** with a *maximum of two years of required experience*, and **39 uncertain**. Uncertain records are never scored as if they had true labels.
- This is an assistant review of the available employer data, **not** a review of all 1,295 live employer webpages or an independently blinded human-labeled dataset. Missing descriptions and contradictory ads make 100% accuracy unprovable.
- Reference decisions concern **experience/seniority only**. Geographic and career-family preferences are additional independent filters.

## Comparison on 78 adjudicable source records

| Method | Confirmed precision | Confirmed-positive recall | False exclusions | False confident inclusions | Review cases |
|---|---:|---:|---:|---:|---:|
| A: existing rules | 85.0% | 100.0% | 0 | 6 | 0 |
| B: job title | 100.0% | 58.8% | 0 | 0 | 26 |
| C: requirements only | 81.8% | 26.5% | 0 | 2 | 55 |
| D: title + ATS + requirements | 100.0% | 58.8% | 0 | 0 | 21 |
| E: uncertainty-first | 96.3% | 76.5% | 0 | 1 | 14 |
| **F: constraint-aware** | **100.0% (32/32)** | **94.1% (32/34)** | **0** | **0** | **5** |

The apparent 100% is **precision on a small reference sample**, not production accuracy. The 2 positive roles not confidently included were assigned **review**, not excluded.

The selection objective was established before final comparison:
`risk = 12 × false exclusions + 5 × false confident inclusions + 0.75 × review cases`.
Candidate F scored best. The utility score is an engineering cost function, **not a percentage of correct predictions**.

## Catalog coverage (snapshot used in validation)

Candidate F evaluated all 1,295 jobs: 136 confidently included, 665 excluded, and 494 requiring review in the experience-only simulation. These counts change as source jobs change and do not represent the number an individual user will see after career, geography, internship, and date filters.

Every job receives a per-method decision in the downloadable Actions artifact, even those not included in the labeled reference.

## Important failure cases found and fixed

- A job requiring both **5+ years in construction supervision** and **2+ years direct site supervision** must meet both constraints; the minimum is five, not two.
- An explicit **OR** pathway (e.g. Bachelor's + three years *or* Master's + two years) should not be treated as five mandatory years.
- **2–5 years** is a range, not a separate five-year minimum.
- **3–5 years preferred** should not become a mandatory exclusion.
- **Company has 27 years of experience** does not describe the candidate's required experience.
- Advanced titles including Senior, Staff, Principal, Lead, Tech Lead, Consultant, and engineering/team managers are excluded by the two-year policy.
- A junior title that conflicts with senior ATS level remains reviewable, rather than silently discarded.

## Production semantics

The shared `secretj-job-preferences.js` uses the selected `secretj-eligibility-core.js` when max experience is 0–2.

- `exclude`: strong explicit incompatible requirements; hide from personalized feed and skip email.
- `include`: evidence supports the experience cap; show normally.
- `review`: source evidence insufficient or conflicting; **keep discoverable**, show a Needs review label, and mark it as a potential match if included in an opted-in alert.
- Explicit manual search and Review All continue to expose the complete public discovery catalog. A manual search never silently loses a job just because its career classification is uncertain.
- Account location, industry/role categories, and internship choices still apply on the default personalized feed; this benchmark does not validate those dimensions.

## How to reproduce

```bash
node --test tests/test_eligibility_benchmark.cjs
node scripts/benchmark-eligibility.cjs
```

GitHub Actions workflow: **Eligibility Method Benchmark**. Its artifact includes `all-jobs-method-comparison.csv` and `method-comparison.json` with confusion matrices, all decisions, reasons and errors. The frozen reference lives in `benchmarks/eligibility-reviewed-snapshot.json` and `benchmarks/eligibility-manual-reference.json`; baseline A is preserved in `benchmarks/legacy-preferences-baseline.js`.

## Remaining limitations / next quality gates

1. Verify employer-side job details for a **random and stratified holdout** across companies; the same models must not label their own test truth.
2. Expand trusted annotations to hundreds of jobs, including both false inclusions and false exclusions, and report confidence intervals.
3. Improve incomplete source descriptions and title classification, then evaluate location and career-family matching separately.
4. Monitor performance by company, industry, source adapter and snapshot date, including alerts delivered late or not delivered.
5. Keep the one-click Review All search path and maintain a reversible production rollout.

No system can honestly guarantee 100% classification accuracy for missing, contradictory or changing third-party job postings.
