const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const from=html.indexOf('  // Scanners retain rejected jobs for diagnostics.');
const to=html.indexOf('  function sourceItems()',from);
assert(from>=0&&to>from,'Expected production feed eligibility helpers');
const code=html.slice(from,to);
const sandbox={
  scoreOf:j=>Number(j.match_score??j.score??0)||0,
  textOf:x=>typeof x==='string'?x:Array.isArray(x)?x.join(' • '):'',
  titleOf:j=>j.title||'Untitled',
  jobKey:j=>String(j.id||j.title),
  jobs:()=>sandbox.rows||[],
  Date
};
vm.createContext(sandbox);
vm.runInContext(code+';this.api={eligibleJob,validJobs,postedDate,firstSeenDate};',sandbox);
const {eligibleJob,validJobs,postedDate,firstSeenDate}=sandbox.api;
test('manager and excluded zero-point vacancies never render',()=>{
  const rejected={id:1,title:'AI Team Manager , AI4ALL',score:0,
    reasons:'["Excluded: title is outside Software/AI/ML/CV/MLOps roles"]'};
  const managerWithBadScore={id:2,title:'Senior AI Engineer',score:12};
  const legitimate={id:3,title:'Junior AI Engineer',score:8,location:'Cairo, Egypt'};
  const outdatedNontechnical={id:4,title:'System Design Engineer, POWER',score:5};
  sandbox.rows=[rejected,managerWithBadScore,legitimate,outdatedNontechnical];
  assert.equal(validJobs().length,1);
  assert.equal(validJobs()[0].title,'Junior AI Engineer');
});
test('graduate and internship recommendations survive filtering',()=>{
  for(const title of ['Software Development Internship','VOIS EG Work Experience Programme 2027 - Technology']){
    assert.equal(eligibleJob({title,score:8}),true,title);
  }
});
test('even positive scores cannot resurrect explicitly excluded roles',()=>{
  assert.equal(eligibleJob({title:'AI Engineer',score:9,reasons:'[Excluded: too much experience]'}),false);
});
test('Valeo explicit posting date is recovered without confusing discovery date',()=>{
  const example={description:'Other details. Job Posting Date: 2026-09-28 Join Us!',
                 detected:'2026-11-12T18:38:57Z'};
  assert.equal(postedDate(example),'2026-09-28');
  assert.equal(firstSeenDate(example),'2026-11-12T18:38:57Z');
});
test('never manufacture an employer posting date from detection timestamp',()=>{
  assert.equal(postedDate({detected:'2026-11-12T18:38:57Z'}),'');
  assert.equal(postedDate({description:'2026-10-03 is product release'}),'');
});
test('invalid and future dates are not presented as publishing dates',()=>{
  assert.equal(postedDate({published_at:'nonsense'}),'');
  assert.equal(postedDate({published_at:'2099-01-01'}),'');
});
