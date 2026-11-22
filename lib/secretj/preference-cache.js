'use strict';
/**
 * Read-through qualification cache for EXISTING Neon watch rows.
 *
 * Every optimization is fail-closed: a row with no proof, old rule version,
 * different preference signature, or non-dictionary approval is rechecked
 * using the unmodified authoritative preference matcher.
 * Fingerprint is derived from actual dictionary data + matcher functions so
 * deploying changed rules invalidates the cache without DB migrations.
 */
const {createHash}=require('node:crypto');
const dictionary=require('../../dist/assets/secretj-career-dictionary');
const career=require('../../dist/assets/secretj-career-level');
const preferences=require('../../dist/assets/secretj-job-preferences');
const eligibility=require('../../dist/assets/secretj-eligibility-core');
const fingerprint=createHash('sha256').update(JSON.stringify(dictionary)+'\n'+[
  career.normalize,career.phrase,career.triggers,career.evaluate,career.match,
  preferences.classify,preferences.hasFilters,preferences.assess,
  preferences.yearsRequired,eligibility.evaluate
].map(fn=>typeof fn==='function'?fn.toString():'').join('\n')).digest('hex');

function verified(job,signature) {
  return Boolean(signature&&typeof signature==='string'&&
    job&&job.qualification_status==='accepted'&&
    job.qualification_mode==='dictionary-title-v1'&&
    job.qualification_preference_signature===signature&&
    job.qualification_matcher_fingerprint===fingerprint);
}
function shouldDisplay(job,signature,preferencesForUser){
  // Only canonical rows from the current matching scan take the fast path.
  if(verified(job,signature))return true;
  return Boolean(preferencesForUser&&preferences.isMatch(job,preferencesForUser));
}
module.exports={fingerprint,verified,shouldDisplay};
