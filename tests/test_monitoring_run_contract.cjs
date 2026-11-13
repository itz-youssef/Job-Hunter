/**
 * Contract tests: the published interface must never drift from the
 * Cloudflare cron configuration or claim success from an expected slot.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('dist/index.html', 'utf8');
const inlineJS = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
const wrangler = fs.readFileSync('cloudflare/scheduler/wrangler.toml', 'utf8');
const worker = fs.readFileSync('cloudflare/scheduler/worker.mjs', 'utf8');
const customWorkflow = fs.readFileSync('.github/workflows/custom-companies.yml', 'utf8');
const coreWorkflow = fs.readFileSync('.github/workflows/monitor.yml', 'utf8');

test('dashboard cron description matches real Cloudflare worker configuration', () => {
  assert.match(wrangler, /crons\s*=\s*\["\*\/5 \* \* \* \*", "3,18,33,48 \* \* \* \*"\]/);
  assert.match(worker, /"\*\/5 \* \* \* \*": "custom-companies\.yml"/);
  assert.match(worker, /"3,18,33,48 \* \* \* \*": "monitor\.yml"/);
  assert.match(inlineJS, /const CUSTOM_SCAN_MINUTES=Array\.from\(\{length:12\},\(_,i\)=>i\*5\)/);
  assert.match(inlineJS, /const CORE_SCAN_MINUTES=\[3,18,33,48\]/);
});

test('hosted dashboard fetches real independent workflow runs without a browser token', () => {
  assert.match(inlineJS, /RUNS_API_ROOT='https:\/\/api\.github\.com\/repos\/itz-youssef\/Job-Hunter\/actions\/workflows\/'/);
  assert.match(inlineJS, /SCANNER_CHANNELS/);
  assert.match(inlineJS, /Promise\.allSettled\(SCANNER_CHANNELS\.map/);
  assert.match(inlineJS, /const RUNS_REFRESH_MS=180000/);
  assert.doesNotMatch(inlineJS, /GH_DISPATCH_TOKEN|CLOUDFLARE_API_TOKEN|GH_SCHEDULER_PAT/);
});

test('actual run parsing ignores skipped fallback events and non-main branches', () => {
  const start = inlineJS.indexOf('  // Narrow queries avoid losing infrequent core runs');
  const end = inlineJS.indexOf('  async function refresh(silent=false)', start);
  assert(start >= 0 && end > start);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    inlineJS.slice(start, end) + ';this.latestScannerRun=latestScannerRun;',
    ctx,
  );
  const lookup = ctx.latestScannerRun;
  const jobs = {
    workflow_runs: [
      {head_branch:'main',path:'.github/workflows/custom-companies.yml',conclusion:'skipped',id:1},
      {head_branch:'other',path:'.github/workflows/custom-companies.yml',conclusion:'success',id:2},
      {head_branch:'main',path:'.github/workflows/custom-companies.yml',conclusion:'success',id:3},
    ],
  };
  assert.equal(lookup(jobs, 'custom-companies.yml').id, 3);
  assert.equal(lookup({workflow_runs:[]}, 'monitor.yml'), null);
  assert.throws(() => lookup({message:'rate limit'}, 'monitor.yml'), /Unexpected GitHub/);
});

test('GitHub fallback stays reversible; dispatch is still available', () => {
  for(const workflow of [customWorkflow,coreWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /CLOUDFLARE_SCHEDULER_ACTIVE/);
    assert.match(workflow, /schedule:/);
  }
});

test('published status is fetched independently from live GitHub run status', () => {
  assert.match(inlineJS, /state\.scanReport=res\[2\]\.value/);
  assert.match(inlineJS, /latestScannerRun\(/);
  assert.match(inlineJS, /Snapshot overdue/);
  assert.match(inlineJS, /Next cron slot/);
  assert.match(inlineJS, /Live status unavailable/);
});
