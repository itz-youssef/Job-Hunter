import test from "node:test";
import assert from "node:assert/strict";
import scheduler, { dispatchDue } from "./worker.mjs";

const CUSTOM = "*/5 * * * *";
const MONITOR = "3,18,33,48 * * * *";
const ENV = { GH_DISPATCH_TOKEN: "unit-test-token" };
const NOW = Date.parse("2026-11-13T12:15:00.000Z");

function fetchMock(runs = [], {
  listStatus = 200,
  dispatchStatus = 204,
  badSchema = false,
} = {}) {
  const calls = [];
  const mock = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/actions/runs?branch=main&per_page=50")) {
      return new Response(
        JSON.stringify(badSchema ? { bad: [] } : { workflow_runs: runs }),
        { status: listStatus, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(null, { status: dispatchStatus });
  };
  return { calls, mock };
}

function run(path, status, overrides = {}) {
  return {
    id: 123,
    path: ".github/workflows/" + path,
    head_branch: "main",
    event: "workflow_dispatch",
    status,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

test("custom cron dispatches correct existing workflow to main", async () => {
  const { calls, mock } = fetchMock();
  const result = await dispatchDue({ cron: CUSTOM, scheduledTime: NOW }, ENV, mock, NOW);
  assert.equal(result.result, "dispatched");
  assert.equal(result.workflow, "custom-companies.yml");
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /actions\/workflows\/custom-companies\.yml\/dispatches$/);
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), { ref: "main" });
  assert.equal(calls[1].options.headers.Authorization, "Bearer unit-test-token");
});

test("monitor cron dispatches the existing monitor workflow", async () => {
  const { calls, mock } = fetchMock();
  const result = await dispatchDue({ cron: MONITOR }, ENV, mock, NOW);
  assert.equal(result.result, "dispatched");
  assert.match(calls[1].url, /actions\/workflows\/monitor\.yml\/dispatches$/);
});

test("unknown cron does not read secret, query GitHub or dispatch", async () => {
  const { calls, mock } = fetchMock();
  const result = await dispatchDue({ cron: "0 * * * *" }, {}, mock);
  assert.equal(result.result, "ignored");
  assert.equal(calls.length, 0);
});

test("missing Cloudflare secret fails closed and never dispatches", async () => {
  const { calls, mock } = fetchMock();
  await assert.rejects(dispatchDue({ cron: CUSTOM }, {}, mock), /GH_DISPATCH_TOKEN/);
  assert.equal(calls.length, 0);
});

test("core slot queues behind an active custom scan without starving", async () => {
  const { calls, mock } = fetchMock([run("custom-companies.yml", "in_progress")]);
  const result = await dispatchDue({ cron: MONITOR }, ENV, mock, NOW);
  assert.equal(result.result, "dispatched");
  assert.equal(result.workflow, "monitor.yml");
  assert.equal(calls.length, 2);
});
test("a queued core scan prevents duplicate dispatch", async () => {
  const { calls, mock } = fetchMock([run("custom-companies.yml", "in_progress"),run("monitor.yml","queued")]);
  const result = await dispatchDue({ cron: MONITOR }, ENV, mock, NOW);
  assert.equal(result.result, "skipped");
  assert.equal(calls.length, 1);
});

test("monitor in progress blocks custom scanner to prevent concurrent writes", async () => {
  const { calls, mock } = fetchMock([run("monitor.yml", "in_progress")]);
  const result = await dispatchDue({ cron: CUSTOM }, ENV, mock, NOW);
  assert.equal(result.result, "skipped");
  assert.equal(calls.length, 1);
});

test("recently completed same workflow dispatch is not repeated", async () => {
  const { calls, mock } = fetchMock([run("custom-companies.yml", "completed")]);
  const result = await dispatchDue({ cron: CUSTOM }, ENV, mock, NOW);
  assert.equal(result.reason, "recent-dispatch");
  assert.equal(calls.length, 1);
});

test("older completed run does not block the next scheduled scan", async () => {
  const { calls, mock } = fetchMock([
    run("custom-companies.yml", "completed", {
      created_at: new Date(NOW - 6 * 60_000).toISOString(),
    }),
  ]);
  const result = await dispatchDue({ cron: CUSTOM }, ENV, mock, NOW);
  assert.equal(result.result, "dispatched");
  assert.equal(calls.length, 2);
});

test("does not block on a queued unrelated test workflow", async () => {
  const { calls, mock } = fetchMock([run("tests.yml", "queued")]);
  const result = await dispatchDue({ cron: CUSTOM }, ENV, mock, NOW);
  assert.equal(result.result, "dispatched");
  assert.equal(calls.length, 2);
});

test("workflow run API errors block dispatch", async () => {
  const { calls, mock } = fetchMock([], { listStatus: 403 });
  await assert.rejects(dispatchDue({ cron: CUSTOM }, ENV, mock), /HTTP 403/);
  assert.equal(calls.length, 1);
});

test("malformed API payload blocks dispatch", async () => {
  const { calls, mock } = fetchMock([], { badSchema: true });
  await assert.rejects(dispatchDue({ cron: CUSTOM }, ENV, mock), /schema/);
  assert.equal(calls.length, 1);
});

test("GitHub dispatch API errors are not treated as accepted", async () => {
  const { calls, mock } = fetchMock([], { dispatchStatus: 422 });
  await assert.rejects(dispatchDue({ cron: CUSTOM }, ENV, mock), /HTTP 422/);
  assert.equal(calls.length, 2);
});

test("no public HTTP request handler is exposed", () => {
  assert.equal(typeof scheduler.fetch, "undefined");
  assert.equal(typeof scheduler.scheduled, "function");
});


const ADAPTIVE_CRON="15,25,35,45,55 7,8,9 * * *";
function adaptiveMock({runs=[],last_attempt="",stateStatus=200,dispatchStatus=204}={}){
 const calls=[];
 return {calls,mock:async(url,options)=>{
  calls.push({url,options});
  if(url.includes("/runs?"))return new Response(JSON.stringify({workflow_runs:runs}),{status:200});
  if(url.includes("/contents/"))return new Response(JSON.stringify({last_attempt}),{status:stateStatus});
  return new Response(null,{status:dispatchStatus});
 }};
}
test("adaptive dispatches daily at 10:15 Cairo in winter and summer, independently of scanners",async()=>{
 for(const time of ["2026-11-26T08:15:00Z","2026-07-26T07:15:00Z"]){
  const now=Date.parse(time),{calls,mock}=adaptiveMock();
  const r=await dispatchDue({cron:ADAPTIVE_CRON,scheduledTime:now},ENV,mock,now);
  assert.equal(r.result,"dispatched");assert.equal(calls.length,3);
  assert.match(calls[0].url,/adaptive-dictionary-research\.yml\/runs/);
  assert.match(calls[1].url,/research-results\/state\.json/);
  assert.deepEqual(JSON.parse(calls[2].options.body),{ref:"main",inputs:{mode:"daily"}});
 }
});
test("adaptive retries at 10:25 and 11:55 but ignores other Cairo hours",async()=>{
 for(const time of ["2026-11-26T08:25:00Z","2026-11-26T09:55:00Z"]){
  const {mock}=adaptiveMock();assert.equal((await dispatchDue({cron:ADAPTIVE_CRON},ENV,mock,Date.parse(time))).result,"dispatched");
 }
 for(const time of ["2026-11-26T07:15:00Z","2026-11-26T10:15:00Z"]){
  const {calls,mock}=adaptiveMock();assert.equal((await dispatchDue({cron:ADAPTIVE_CRON},ENV,mock,Date.parse(time))).result,"ignored");assert.equal(calls.length,0);
 }
});
test("adaptive skips active run and today's persisted attempt; yesterday's attempt does not block",async()=>{
 const now=Date.parse("2026-11-26T08:25:00Z");
 for(const status of ["queued","in_progress"]){
  const {calls,mock}=adaptiveMock({runs:[run("adaptive-dictionary-research.yml",status)]});
  assert.equal((await dispatchDue({cron:ADAPTIVE_CRON},ENV,mock,now)).reason,"adaptive-active");assert.equal(calls.length,1);
 }
 const done=adaptiveMock({last_attempt:"2026-11-26"});
 assert.equal((await dispatchDue({cron:ADAPTIVE_CRON},ENV,done.mock,now)).reason,"adaptive-day-already-attempted");assert.equal(done.calls.length,2);
 const prev=adaptiveMock({last_attempt:"2026-11-25"});
 assert.equal((await dispatchDue({cron:ADAPTIVE_CRON},ENV,prev.mock,now)).result,"dispatched");
});
test("adaptive fails closed if the authoritative shadow state is unavailable",async()=>{
 const {calls,mock}=adaptiveMock({stateStatus:503});
 await assert.rejects(dispatchDue({cron:ADAPTIVE_CRON},ENV,mock,Date.parse("2026-11-26T08:15:00Z")),/state check failed/);
 assert.equal(calls.length,2);
});
