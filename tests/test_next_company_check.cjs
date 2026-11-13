const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
const start = js.indexOf('  // Cloudflare calls custom company scans');
const end = js.indexOf('  function companyCard(c){', start);
assert(start >= 0 && end > start, 'Expected Cloudflare schedule and monitoring panel helpers');

const ctx = {
  Date, Intl, Number,
  esc: value => String(value),
  badge: label => String(label),
  prettyDate: value => new Date(value).toISOString(),
  REPO: 'https://github.com/itz-youssef/Job-Hunter',
  state: { runs: {}, scanReport: null, runsError: '' },
};
vm.createContext(ctx);
vm.runInContext(
  js.slice(start, end) +
    ';this.api={nextExpectedCheck,expectedCheckLabel,monitoringPanel,monitoringRunRow};',
  ctx,
);
const { nextExpectedCheck, expectedCheckLabel, monitoringPanel, monitoringRunRow } = ctx.api;
const iso = (company, when) => nextExpectedCheck(company, Date.parse(when))?.toISOString();

test('core sources retain every 15-minute Cloudflare cron schedule', () => {
  assert.equal(iso({managed:false,active:true}, '2026-11-13T00:01:00Z'), '2026-11-13T00:03:00.000Z');
  assert.equal(iso({managed:false,active:true}, '2026-11-13T00:48:10Z'), '2026-11-13T01:03:00.000Z');
});

test('custom companies now follow five-minute Cloudflare cron schedule', () => {
  assert.equal(iso({managed:true}, '2026-11-13T00:18:00Z'), '2026-11-13T00:20:00.000Z');
  assert.equal(iso({managed:true}, '2026-11-13T00:55:00Z'), '2026-11-13T01:00:00.000Z');
  assert.equal(iso({managed:true}, '2026-11-13T00:04:59Z'), '2026-11-13T00:05:00.000Z');
});

test('company on both channels shows earliest next cron slot', () => {
  assert.equal(iso({managed:true,alsoMain:true}, '2026-11-13T00:16:00Z'), '2026-11-13T00:18:00.000Z');
  assert.equal(iso({managed:true,alsoMain:true}, '2026-11-13T00:18:00Z'), '2026-11-13T00:20:00.000Z');
  assert.equal(iso({managed:true,alsoMain:true}, '2026-11-13T00:25:00Z'), '2026-11-13T00:30:00.000Z');
});

test('unknown and invalid scan inputs do not claim guaranteed deadlines', () => {
  assert.equal(nextExpectedCheck({managed:true}, NaN), null);
  assert.match(expectedCheckLabel({managed:false,active:false}), /Not currently scheduled/);
  assert.match(expectedCheckLabel({managed:true}), /Next cron slot/);
  assert.match(expectedCheckLabel({managed:true}), /approx\./);
});

test('monitor panel distinguishes a published scan from actual workflow run', () => {
  ctx.state.scanReport = {
    checked_at: new Date().toISOString(),
    emails_accepted_by_smtp: 2,
  };
  ctx.state.runs = {
    custom: {id:43427840733,status:'completed',conclusion:'success',created_at:'2026-11-13T12:45:16Z'},
    core: {id:43400000000,status:'in_progress',created_at:'2026-11-13T12:48:13Z'},
  };
  const output = monitoringPanel();
  assert.match(output, /Live monitoring runs/);
  assert.match(output, /Success/);
  assert.match(output, /Running \/ queued/);
  assert.match(output, /SMTP accepted 2 alert\(s\)/);
  assert.match(output, /actions\/runs\/43427840733/);
  assert.match(output, /Snapshot published/);
  assert.doesNotMatch(output, /email delivered/);
});

test('monitor panel reports stale data as stale, not as a successful scan', () => {
  ctx.state.scanReport = { checked_at: '2025-01-01T00:00:00Z' };
  ctx.state.runs = {};
  ctx.state.runsError = 'Live GitHub runs unavailable';
  const output = monitoringPanel();
  assert.match(output, /Snapshot overdue/);
  assert.match(output, /Unknown/);
  assert.match(output, /Live GitHub runs unavailable/);
  assert.doesNotMatch(output, /Snapshot published/);
});

test('run links use validated numeric IDs only', () => {
  const output = monitoringRunRow(
    'Custom', 'every 5 min', {managed:true},
    {id:'not-a-number"><img src=x onerror=alert(1)>',status:'completed',conclusion:'success'},
  );
  assert.doesNotMatch(output, /<img/);
  assert.match(output, /href="https:\/\/github.com\/itz-youssef\/Job-Hunter\/actions"/);
});

test('dashboard exposes monitoring to workspace, radar, and companies', () => {
  assert.match(js, /function home\(\)[\s\S]*?monitoringPanel\(\)/);
  assert.match(js, /function radarHome\(\)[\s\S]*?monitoringPanel\(\)/);
  assert.match(js, /function companiesPage\(\)[\s\S]*?monitoringPanel\(\)/);
  assert.match(html, /Last scan overdue/);
  assert.match(html, /liveFile\('dist\/custom-status\.json'\)/);
});
