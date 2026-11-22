'use strict';
/* Compatibility shim: no AI models are part of job qualification. */
const prefs=require('../../dist/assets/secretj-job-preferences');
function reject(job,preferences){
  const verdict=prefs.assess(job,preferences);
  return {ok:verdict.match,reason:verdict.reasons.join('; ')||'dictionary-title-matched',
    years:verdict.requiredYears,semanticReview:false};
}
module.exports={reject};
