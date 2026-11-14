'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const home=fs.readFileSync('dist/index.html','utf8');
const account=fs.readFileSync('dist/account.html','utf8');
const accountJs=fs.readFileSync('dist/assets/secretj-account.js','utf8');
const tour=fs.readFileSync('dist/assets/secretj-welcome-tour.js','utf8');
const backend=fs.readFileSync('api/secretj-auth.js','utf8');
const migration=fs.readFileSync('database/migrations/005_registration_legal_consent.sql','utf8');
test('every entry page loads the first-visit tour independently of login',()=>{
 assert.match(home,/secretj-welcome-tour\.js/);
 assert.match(account,/secretj-welcome-tour\.js/);
 assert.match(tour,/sj-welcome-tour-seen-v1/);
 assert.match(tour,/localStorage\.getItem\(STORAGE_KEY\)/);
 assert.match(tour,/localStorage\.setItem\(STORAGE_KEY,'1'\)/);
 assert.match(tour,/Skip tour/);
 assert.match(tour,/Start exploring/);
 assert.doesNotMatch(tour,/authUrl|userForRequest|sj_session/);
});
test('terms and privacy are linked on the registration form',()=>{
 assert.match(account,/id="registration-consent" hidden/);
 assert.match(account,/type="checkbox" name="accept_terms"/);
 assert.match(account,/href="\/terms\.html"/);
 assert.match(account,/href="\/privacy\.html"/);
 assert.match(accountJs,/elements\.accept_terms\.required=register/);
 assert.match(accountJs,/values\.accept_terms=true/);
 assert.match(accountJs,/values\.terms_version='2026-11-14'/);
});
test('backend requires current explicit agreement and saves timestamp and policy versions',()=>{
 assert.match(backend,/body\.accept_terms !== true/);
 assert.match(backend,/body\.terms_version !== '2026-11-14'/);
 assert.match(backend,/body\.privacy_version !== '2026-11-14'/);
 assert.match(backend,/terms_accepted_at,terms_version,privacy_version/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ/);
});
test('public legal pages explain CV handling and account controls',()=>{
 const terms=fs.readFileSync('dist/terms.html','utf8');
 const privacy=fs.readFileSync('dist/privacy.html','utf8');
 assert.match(terms,/CVs and content you upload/);
 assert.match(privacy,/Neon PostgreSQL/);
 assert.match(privacy,/Retention and deletion/);
});
