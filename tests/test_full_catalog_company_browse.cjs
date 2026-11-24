'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
test('company picker enumerates full published catalog and tracked company list',()=>{
 assert.match(html,/const catalog=allPublicJobs\(\)/);
 assert.match(html,/for\(const job of catalog\)/);
 assert.match(html,/if\(!saved\)for\(const source of monitoredSources\(\)\)/);
 assert.match(html,/Browse all jobs by company<select/);
 assert.match(html,/aria-label="Browse all published jobs by company"/);
 assert.match(html,/companies\.map\(c=>option\(c\.name,c\.name\+' \('\+c\.count\+' jobs\)'/);
});
test('selecting company overrides personalized feed and any stale filters',()=>{
 assert.match(html,/state\.companyFilter!=='all'\|\|state\.jobType==='internship'/);
 assert.match(html,/companyBrowsing=!saved&&state\.companyFilter!=='all'/);
 assert.match(html,/companyBrowsing\?'All jobs at '\+state\.companyFilter/);
 assert.match(html,/if\(event\.target\.id==='company-filter'&&event\.target\.value!=='all'\)/);
 assert.match(html,/Object\.assign\(state,\{query:'',role:'all',jobType:'all',dateFilter:'all',\s*reviewExcluded:false,sortBy:'recent'\}\)/);
 assert.match(html,/where\(companyOf\(j\)\)!==where\(state\.companyFilter\)/);
 assert.match(html,/state\.feedLimit=FEED_PAGE_SIZE/);
});
test('keep search, other filters and alert preferences unaffected',()=>{
 assert.match(html,/if\(q && !searchScore\(j\)\)return false/);
 assert.match(html,/if\(!matchesRole\(j,state\.role\)\)return false/);
 assert.match(html,/if\(state\.dateFilter!=='all'\)/);
 assert.match(html,/Your personal email alerts are unchanged/);
 assert.match(html,/data-reset-filters/);
});
