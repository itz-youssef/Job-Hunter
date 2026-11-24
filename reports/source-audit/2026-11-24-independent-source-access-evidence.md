# Employer-by-employer independent-source access audit — 24 Nov 2026

## Evidence and limits

- Every official careers URL in `companies.json` was opened or attempted individually through the available page retrieval tool.
- Page retrieval frequently returned cached HTML from approximately three months earlier; this is NOT a synchronized current vacancy scrape.
- No full 58-employer independent live ATS API extraction, exhaustive pagination, original vacancy-ID reconciliation or complete descriptions cross-check was possible with the available read-only browser.
- **0/58 employers independently confirmed as complete on the same date.** Do not use historical comparison as proof of a missed job or confirmed match.
- Historical job and description counts below are from repository report dated **2026-11-16**, not 2026-11-24.
- Status describes what was actually retrievable from the original source page; 'JavaScript' is not a finding that the adapter is defective.

## All registered employers

| # | Employer | Historical adapter jobs | Historical descriptions | Adapter status | Independent page evidence | Same-day count comparison |
|---:|---|---:|---:|---|---|---|
| 1 | [VOIS](https://jobs.vodafone.com/careers?domain=vodafone.com&start=0&location=Egypt&pid=563018698305416&sort_by=match&filter_include_remote=1&filter_include_relocation=0&filter_seniority=1%2C0) | 28 | 12 | monitoring | JavaScript/PCSX؛ وظائف غير ظاهرة في النص | غير مثبت |
| 2 | [Bosta](https://jobs.lever.co/Bosta/?utm_source=chatgpt.com) | 92 | 92 | monitoring | قائمة Lever مقروءة؛ لا يوجد استخراج مستقل متزامن | غير مثبت |
| 3 | [Thndr](https://jobs.ashbyhq.com/thndr?) | 17 | 17 | monitoring | Ashby يعتمد JavaScript | غير مثبت |
| 4 | [Klivvr](https://jobs.lever.co/klivvr?utm_source=chatgpt.com) | 7 | 7 | monitoring | قائمة Lever مقروءة؛ لم يثبت العدد الحالي | غير مثبت |
| 5 | [Emergence](https://jobs.ashbyhq.com/emergence?utm_source=chatgpt.com) | 8 | 8 | monitoring | Ashby يعتمد JavaScript | غير مثبت |
| 6 | [Lean Technologies](https://jobs.ashbyhq.com/LeanTech?utm_source=chatgpt.com) | 8 | 8 | monitoring | Ashby يعتمد JavaScript | غير مثبت |
| 7 | [Chatbase](https://jobs.ashbyhq.com/chatbase?utm_source=chatgpt.com) | 13 | 13 | monitoring | Ashby يعتمد JavaScript | غير مثبت |
| 8 | [Lua Global](https://jobs.ashbyhq.com/lua?utm_source=chatgpt.com) | 0 | 0 | monitoring | Ashby يعتمد JavaScript | غير مثبت |
| 9 | [IBM](https://www.ibm.com/careers/search?) | 9 | 9 | monitoring | صفحة بحث عامة بدون نتائج في النص | غير مثبت |
| 10 | [Schneider Electric](https://careers.se.com/Defaultlandingpage/jobs/categories?lang=en-US&utm_source=chatgpt.com) | 40 | 40 | monitoring | 403 Forbidden | غير مثبت |
| 11 | [Ericsson](https://jobs.ericsson.com/careers?utm_source=chatgpt.com&query=Software+Engineer&start=0&location=egypt&pid=563121777515649&sort_by=relevance&filter_include_remote=1&filter_include_relocation=0) | 11 | 0 | monitoring | Eightfold يعتمد JavaScript/PCSX | غير مثبت |
| 12 | [Capgemini Egypt](https://www.capgemini.com/eg-en/careers/join-us/?utm_source=chatgpt.com) | 95 | 94 | monitoring | صفحة تعريفية وليست قائمة الوظائف | غير مثبت |
| 13 | [DXC Technology](https://careers.dxc.com/?utm_source=chatgpt.com) | 45 | 45 | monitoring | صفحة توظيف عامة؛ لا يظهر الإجمالي | غير مثبت |
| 14 | [Luxoft Egypt](https://career.luxoft.com/locations/egypt?utm_source=chatgpt.com) | 16 | 0 | monitoring | صفحة مصر مقروءة جزئيًا؛ الإجمالي غير محقق | غير مثبت |
| 15 | [Nokia](https://fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs) | 0 | 0 | monitoring | Oracle صفحة بلا نص قابل للاستخراج | غير مثبت |
| 16 | [SAP](https://jobs.sap.com/en/jobs/?location=Cairo&utm_source=chatgpt.com) | 3 | 3 | monitoring | تعذر جلب الرابط | غير مثبت |
| 17 | [Orange Egypt](https://orange.jobs/gb/en/africa-middle-east/egypt?utm_source=chatgpt.com) | 10 | 0 | monitoring | صفحة وظائف مصر؛ النتائج غير كاملة بالنص | غير مثبت |
| 18 | [e& / Etisalat](https://www.eand.com/ar/careers/careers.html?utm_source=chatgpt.com) | 25 | 0 | partial | صفحة الشركة العامة، ليست كشفًا كاملًا | غير مثبت |
| 19 | [Telecom Egypt (WE)](https://te.eg/en/web/guest/about-te/careers-and-training?utm_source=chatgpt.com) | 0 | 0 | monitoring | صفحة التوظيف العامة؛ الإجمالي غير ظاهر | غير مثبت |
| 20 | [Paymob](https://origin.paymob.com/en/careers?utm_source=chatgpt.com) | 71 | 71 | monitoring | تعذر جلب الرابط | غير مثبت |
| 21 | [Breadfast](https://www.breadfast.com/careers/?utm_source=chatgpt.com) | 12 | 0 | partial | صفحة توظيف وفئات مع روابط؛ ليست إجمالي الوظائف | غير مثبت |
| 22 | [ITWorx](https://careers.itworx.com/?utm_source=chatgpt.com) | 3 | 3 | monitoring | صفحة لا تعرض نصًا قابلًا للاستخراج | غير مثبت |
| 23 | [Sumerge](https://www.sumerge.com/careers/job-openings?utm_source=chatgpt.com) | 8 | 8 | monitoring | تعذر جلب الرابط | غير مثبت |
| 24 | [Luciq (formerly Instabug)](https://www.luciq.ai/careers?utm_source=chatgpt.com) | 2 | 0 | monitoring | صفحة Careers ظاهرة، لا إجمالي مثبت | غير مثبت |
| 25 | [Breadfast Technology](https://www.breadfast.com/ar/careers_categories/technology/?utm_source=chatgpt.com) | 3 | 3 | partial | صفحة قسم Technology تتيح فتح الوظائف، دون إجمالي | غير مثبت |
| 26 | [Link Development](https://linkdevelopment.com/careers/opportunities/?utm_source=chatgpt.com) | 27 | 0 | monitoring | صفحة فرص رسمية مقروءة؛ لم يثبت الإجمالي | غير مثبت |
| 27 | [Fawry](https://www.fawry.com/jobs/?utm_source=chatgpt.com) | 4 | 0 | partial | صفحة حماية ضد الطلبات الآلية | غير مثبت |
| 28 | [Siemens](https://jobs.sw.siemens.com/business-structure/electronic-design-automation-eda/jobs/?location=Cairo&utm_source=chatgpt.com) | 22 | 22 | monitoring | صفحة نتائج تعتمد JavaScript؛ تظهر Loading | غير مثبت |
| 29 | [Deloitte](https://middleeastjobs.deloitte.com/careersME/SearchJobs/?9570=%5B25581143%5D&9570_format=11920&9571=%5B56311763%5D&9571_format=11921&12333=%5B56312272%5D&12333_format=16407&listFilterMode=1&pipelineRecordsPerPage=6&) | 61 | 0 | partial | 406 Not Acceptable | غير مثبت |
| 30 | [BlackStone eIT](https://apply.workable.com/blackstone-eit-2/) | 9 | 9 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 31 | [Lamdax](https://apply.workable.com/lamdax/) | 6 | 6 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 32 | [Yassir](https://jobs.lever.co/Yassir/) | 120 | 120 | monitoring | قائمة Lever مقروءة؛ تغطية مصر غير معدودة مستقلًا | غير مثبت |
| 33 | [Integrant](https://apply.workable.com/integrant/) | 19 | 19 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 34 | [inDrive](https://careers.indrive.com/vacancies/?country=Egypt) | 10 | 0 | partial | تعذر جلب الرابط | غير مثبت |
| 35 | [robusta / RTG](https://apply.workable.com/robusta/) | 11 | 11 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 36 | [Incorta](https://jobs.lever.co/incorta) | 4 | 4 | monitoring | قائمة Lever مقروءة؛ وظائف مصر/غير مصر مختلطة | غير مثبت |
| 37 | [SOUM](https://jobs.lever.co/soum) | 24 | 24 | monitoring | قائمة Lever مقروءة؛ وظائف مصر/غير مصر مختلطة | غير مثبت |
| 38 | [econstruct](https://jobs.lever.co/econstruct) | 20 | 20 | monitoring | قائمة Lever مقروءة؛ وظائف مصر/غير مصر مختلطة | غير مثبت |
| 39 | [PetroApp](https://apply.workable.com/petroapp/) | 1 | 1 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 40 | [SSC HR Solutions](https://apply.workable.com/ssc-hr/) | 45 | 45 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 41 | [Mondia Group](https://apply.workable.com/mondia-group/) | 2 | 2 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 42 | [mylo by B.TECH](https://apply.workable.com/mylo-btech/) | 6 | 6 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 43 | [Infomineo](https://apply.workable.com/infomineo/) | 1 | 1 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 44 | [ArpuPlus](https://apply.workable.com/arpu-telecommunication-services/) | 4 | 4 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 45 | [Madar](https://apply.workable.com/madarplatform/) | 1 | 1 | monitoring | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 46 | [EY Egypt](https://careers.ey.com/ey/search/?q=&locationsearch=Egypt) | 20 | 0 | monitoring | تعذر فتح رابط نتائج البحث | غير مثبت |
| 47 | [PwC Egypt](https://careers.pwc.com/search/?q=&locationsearch=Egypt) | 3 | 0 | monitoring | تعذر فتح رابط نتائج البحث | غير مثبت |
| 48 | [Blink22](https://apply.workable.com/blink22-3/) | 16 | 16 | partial | Workable صفحة بلا وظائف مقروءة | غير مثبت |
| 49 | [Amazon Egypt](https://www.amazon.jobs/en/location/egypt) | 95 | 95 | monitoring | صفحة مصر عامة؛ لا تعرض عداد نتائج البحث | غير مثبت |
| 50 | [AWS Egypt](https://www.amazon.jobs/en/search?country=EGY) | 0 | 0 | monitoring | صفحة البحث تعتمد JavaScript | غير مثبت |
| 51 | [Talabat Egypt](https://careers.deliveryhero.com/jobs?options=252%2C845&page=1) | 52 | 52 | monitoring | تعذر جلب الرابط | غير مثبت |
| 52 | [Uber Egypt](https://iaziqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/UberCareers/jobs) | 0 | 0 | partial | Oracle صفحة بلا نص قابل للاستخراج | غير مثبت |
| 53 | [Teleperformance Egypt](https://tpegyptcareers.teleperformance.com.eg/vacancies) | 4 | 0 | monitoring | المصدر الرسمي يعرض Total 4 (فحص صفحة غير متزامن) | غير مثبت |
| 54 | [Finaira](https://finaira.ai/work-at-finaira/) | 1 | 1 | partial | صفحة تعرض View Vacancies دون إجمالي | غير مثبت |
| 55 | [CIB Egypt](https://cibeg.taleo.net/careersection/cib_ex/moresearch.ftl) | 23 | 0 | partial | Taleo صفحة بحث مقروءة جزئيًا دون إجمالي واضح | غير مثبت |
| 56 | [Konecta Egypt](https://konectagroup.wd3.myworkdayjobs.com/Konecta) | 34 | 0 | monitoring | Workday صفحة بلا نص قابل للاستخراج | غير مثبت |
| 57 | [ADCB Egypt](https://www.adcb.com.eg/available-careers/) | 7 | 7 | partial | صفحة فرص مقروءة؛ الإجمالي غير محقق | غير مثبت |
| 58 | [Fab Minds Egypt](https://www.fab-minds.com/careers/) | 3 | 3 | partial | تعذر جلب الرابط | غير مثبت |

## Proven non-synchronized observations

- **Teleperformance Egypt** official careers page displays 'From 1 To 4 - Total 4'; historical adapter audit had 4 jobs on 16 Nov. This is a dated numerical observation, NOT a same-day ID match.
- **Konecta** live GitHub Actions source validation observed the Workday total change from 36 to 0 between pages on 24 Nov 2026. Adapter changes in PR #169 mark this partial and preserve discovered jobs; total completeness still not established.
- **EY Egypt** had 20 historical listings but 0 descriptions; a source-description recovery improvement was merged via PR #169. A live current count match was not performed.
- **Breadfast Technology** live GitHub Action exposed only 3 available jobs during the smoke test, while a historical expected internship disappeared. This demonstrates volatility; it does not prove missing postings.

## What remains for the user's requested complete verification

For each employer run an independent official-ATS/API collector with country/facet validation and exhaustive pagination. Save official listing IDs and detail-page hashes. On the same timestamp run Job Hunter's adapter and diff by stable vacancy ID; manually inspect all unexplained differences and test original detail-page extraction for title, description, qualifications, location, seniority, published date. Categorize unavailable sources explicitly. Do not change correct adapters and do not claim full coverage until independently confirmed.

This file deliberately records the incomplete audit as incomplete rather than misrepresenting it as completed.
