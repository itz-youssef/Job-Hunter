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
// Cloudflare cron is UTC. Include both Cairo UTC offsets and a bounded
// retry window; use the actual Cairo local time below to decide eligibility.
const ADAPTIVE_CRON = "15,25,35,45,55 7,8,9 * * *";
const ADAPTIVE = "adaptive-dictionary-research.yml";
const cairoParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
const cairoDay = p => p.year+"-"+p.month+"-"+p.day;
async function dispatchAdaptive(scheduledTime,env,fetchImpl,nowMs){
  const p=cairoParts(nowMs),hour=Number(p.hour),minute=Number(p.minute);
  if(hour<10||hour>11||(hour===10&&minute<15))return {result:"ignored",reason:"outside-cairo-research-window",workflow:ADAPTIVE};
  const token=env.GH_DISPATCH_TOKEN;
  if(typeof token!=="string"||!token.trim())throw Error("Missing GH_DISPATCH_TOKEN Cloudflare secret");
  const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"job-hunter-scheduler"};
  const listing=await fetchImpl(API_ROOT+"/actions/workflows/"+ADAPTIVE+"/runs?branch=main&per_page=20",{method:"GET",headers});
  if(!listing.ok)throw Error("Adaptive run check failed: HTTP "+listing.status);
  const payload=await listing.json();
  if(!Array.isArray(payload.workflow_runs))throw Error("GitHub Actions returned an unexpected adaptive runs schema");
  const runs=payload.workflow_runs.filter(r=>r.head_branch==="main");
  const active=runs.find(r=>ACTIVE.has(r.status));
  if(active)return {result:"skipped",reason:"adaptive-active",workflow:ADAPTIVE,activeRunId:active.id};
  const recent=runs.find(r=>Number.isFinite(Date.parse(r.created_at))&&nowMs-Date.parse(r.created_at)>=0&&nowMs-Date.parse(r.created_at)<RECENT_DISPATCH_GUARD_MS);
  if(recent)return {result:"skipped",reason:"adaptive-recent",workflow:ADAPTIVE,activeRunId:recent.id};
  // The authoritative daily attempt is persisted in isolated shadow state.
  // A benchmark is not a daily attempt; never mistake one for today's run.
  // Fail closed if state cannot be read or parsed; do not risk duplicate spend.
  const stateResponse=await fetchImpl(API_ROOT+"/contents/research-results/state.json?ref=research%2Fshadow-state",{method:"GET",headers:{...headers,Accept:"application/vnd.github.raw+json","Cache-Control":"no-cache"}});
  if(!stateResponse.ok)throw Error("Adaptive state check failed: HTTP "+stateResponse.status);
  const state=await stateResponse.json();
  if(!state||typeof state.last_attempt!=="string")throw Error("Adaptive state schema invalid");
  if(state.last_attempt===cairoDay(p))return {result:"skipped",reason:"adaptive-day-already-attempted",workflow:ADAPTIVE};
  const response=await fetchImpl(API_ROOT+"/actions/workflows/"+ADAPTIVE+"/dispatches",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:{mode:"daily"}})});
  if(response.status!==204)throw Error("Adaptive workflow dispatch failed: HTTP "+response.status);
  return {result:"dispatched",workflow:ADAPTIVE,scheduledAt:new Date(scheduledTime??nowMs).toISOString()};
}
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
  if(cron===ADAPTIVE_CRON)return dispatchAdaptive(scheduledTime,env,fetchImpl,nowMs);
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
  // Core's 15-minute slot must not be lost merely because a 5-minute
  // custom scan is still running. Queue one core run behind that scanner;
  // the shared GitHub concurrency group serializes publication.
  const queueCore = workflow === 'monitor.yml' && activeRun &&
    activeRun.path === '.github/workflows/custom-companies.yml' &&
    !relevant.some(run=>run.path === '.github/workflows/monitor.yml'&&ACTIVE.has(run.status));
  if (activeRun && !queueCore) {
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
