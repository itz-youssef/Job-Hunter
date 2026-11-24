'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const builtin=fs.readFileSync('app/db.py','utf8');
const exporter=fs.readFileSync('app/export_site.py','utf8');
const dashboard=fs.readFileSync('dist/index.html','utf8');
const custom=JSON.parse(fs.readFileSync('companies.json','utf8'));
test('disconnected VOIS no longer seeds as built-in',()=>{
 assert.doesNotMatch(builtin,/seeds=\[[^\n]*\('Vodafone \/ VOIS'/);
 assert.match(builtin,/\('Siemens'/);
});
test('legacy source and only legacy jobs excluded on export',()=>{
 assert.match(exporter,/legacy_names = \{"vodafone \/ vois", "vois"\}/);
 assert.match(exporter,/legacy_ids = \{source\["id"\]/);
 assert.match(exporter,/sources = \[source for source in sources if source\["id"\] not in legacy_ids\]/);
 assert.match(exporter,/jobs = \[job for job in jobs if job\["source_id"\] not in legacy_ids\]/);
 assert.match(exporter,/preserve_custom_snapshot\(payload, output\)/);
});
test('old built-in snapshot does not produce duplicate VOIS on dashboard',()=>{
 assert.match(dashboard,/if\(\['vodafone \/ vois','vois'\]\.includes\(where\(name\)\)\)continue;/);
 assert.match(dashboard,/for\(const c of state\.companies\)/);
 assert.ok(custom.some(c=>c.name==='VOIS'));
});
