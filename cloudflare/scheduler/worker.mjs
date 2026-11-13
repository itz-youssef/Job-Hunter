/**
 * Cloudflare Cron -> GitHub workflow_dispatch.
 *
 * This worker has no public fetch handler and its workers.dev URL is disabled.
 * GH_DISPATCH_TOKEN is a Cloudflare Worker secret: never commit a real token.
 *
 * Two independent cron expressions avoid dispatching both workflows together.
 * Inspect main-branch runs before dispatch to avoid creating a backlog in
 * GitHub's shared concurrency group. GitHub Actions remains best-effort.
 */
const REPO = "itz-youssef/Job-Hunter";
const API_ROOT = "https://api.github.com/repos/" + REPO;
const WORKFLOWS = Object.freeze({
  "*/5 * * * *": "custom-companies.yml",
  "3,18,33,48 * * * *": "monitor.yml",
});
const MONITORED_PATHS = new Set([
  ".github/workflows/custom-companies.yml",
  ".github/workflows/monitor.yml",
]);
const ACTIVE = new Set(["requested", "queued", "waiting", "pending", "in_progress"]);
const RECENT_DISPATCH_GUARD_MS = 4 * 60 * 1000;

export async function dispatchDue(
  { cron, scheduledTime } = {},
  env = {},
  fetchImpl = fetch,
  nowMs = Date.now(),
) {
  const workflow = WORKFLOWS[cron];
  if (!workflow) {
    return { result: "ignored", reason: "unknown-cron" };
  }

  const token = env.GH_DISPATCH_TOKEN;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Missing GH_DISPATCH_TOKEN Cloudflare secret");
  }

  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "job-hunter-scheduler",
  };

  // Fail closed if GitHub cannot report active runs.
  const listing = await fetchImpl(
    API_ROOT + "/actions/runs?branch=main&per_page=50",
    { method: "GET", headers },
  );
  if (!listing.ok) {
    throw new Error("GitHub Actions run check failed: HTTP " + listing.status);
  }
  const payload = await listing.json();
  if (!Array.isArray(payload.workflow_runs)) {
    throw new Error("GitHub Actions returned an unexpected runs schema");
  }
  const relevant = payload.workflow_runs.filter(
    (run) =>
      MONITORED_PATHS.has(run.path) &&
      run.head_branch === "main",
  );
  const activeRun = relevant.find((run) => ACTIVE.has(run.status));
  if (activeRun) {
    return {
      result: "skipped",
      reason: "another-scanner-active",
      workflow,
      activeRunId: activeRun.id,
    };
  }

  // New dispatches can briefly lag behind the GitHub API listing.
  const recent = relevant.find(
    (run) =>
      run.path === ".github/workflows/" + workflow &&
      run.event === "workflow_dispatch" &&
      Number.isFinite(Date.parse(run.created_at)) &&
      nowMs - Date.parse(run.created_at) >= 0 &&
      nowMs - Date.parse(run.created_at) < RECENT_DISPATCH_GUARD_MS,
  );
  if (recent) {
    return {
      result: "skipped",
      reason: "recent-dispatch",
      workflow,
      activeRunId: recent.id,
    };
  }

  const response = await fetchImpl(
    API_ROOT + "/actions/workflows/" + workflow + "/dispatches",
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (response.status !== 204) {
    throw new Error("GitHub workflow dispatch failed: HTTP " + response.status);
  }

  return {
    result: "dispatched",
    workflow,
    scheduledAt: new Date(scheduledTime ?? nowMs).toISOString(),
  };
}

export default {
  async scheduled(controller, env) {
    const outcome = await dispatchDue(controller, env);
    console.log("job-hunter-scheduler", JSON.stringify(outcome));
  },
};
