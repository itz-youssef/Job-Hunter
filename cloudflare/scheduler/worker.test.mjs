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

test("queued custom scan blocks new custom or monitor dispatch", async () => {
  const { calls, mock } = fetchMock([run("custom-companies.yml", "queued")]);
  const result = await dispatchDue({ cron: MONITOR }, ENV, mock, NOW);
  assert.equal(result.result, "skipped");
  assert.equal(result.reason, "another-scanner-active");
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
