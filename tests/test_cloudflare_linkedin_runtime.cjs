'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const config=fs.readFileSync('cloudflare/site/wrangler.toml','utf8');
const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
const linkedin=fs.readFileSync('api/secretj-linkedin.js','utf8');

test('site worker preserves LinkedIn dashboard bindings and enables Node environment',()=>{
 assert.match(config,/^name\s*=\s*"jobhunter-youssef"$/m);
 assert.match(config,/^compatibility_flags\s*=\s*\["nodejs_compat"\]$/m);
 assert.match(config,/^keep_vars\s*=\s*true$/m);
 assert.match(config,/^compatibility_date\s*=\s*"2026-11-13"$/m);
 assert.match(worker,/\['\/api\/secretj-linkedin',linkedinHandler\]/);
 assert.match(linkedin,/const env=req\?\.env\|\|process\.env/);
 assert.match(linkedin,/id:env\.LINKEDIN_CLIENT_ID/);
 assert.match(linkedin,/secret:env\.LINKEDIN_CLIENT_SECRET/);
 assert.doesNotMatch(config,/LINKEDIN_CLIENT_SECRET\s*=\s*"/);
});
