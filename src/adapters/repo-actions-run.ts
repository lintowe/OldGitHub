import { AdapterFailure } from "./index";
import { fetchApi } from "./rate-limit";
import type { WorkflowRunStatus } from "./repo-actions";

export type RunDetail = {
  id: number;
  url: string;
  workflowName: string;
  workflowId: number | null;
  workflowUrl: string | null;
  displayTitle: string;
  runNumber: number | null;
  runAttempt: number | null;
  event: string;
  status: WorkflowRunStatus;
  rawStatus: string;
  rawConclusion: string | null;
  branch: string | null;
  branchUrl: string | null;
  commitSha: string | null;
  commitShortSha: string | null;
  commitUrl: string | null;
  commitMessage: string | null;
  triggeringActor: { login: string; avatarUrl: string } | null;
  actor: { login: string; avatarUrl: string } | null;
  startedAt: string | null;
  updatedAt: string | null;
  duration: string | null;
  htmlUrl: string;
};

export type JobStep = {
  name: string;
  status: WorkflowRunStatus;
  number: number;
  startedAt: string | null;
  completedAt: string | null;
  duration: string | null;
};

export type JobDetail = {
  id: number;
  name: string;
  status: WorkflowRunStatus;
  rawStatus: string;
  rawConclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: string | null;
  url: string;
  runnerName: string | null;
  labels: string[];
  steps: JobStep[];
};

export type RunPage = {
  owner: string;
  repo: string;
  run: RunDetail;
  jobs: JobDetail[];
};

const API = "https://api.github.com";

export async function getRunPage(owner: string, repo: string, runId: string): Promise<RunPage> {
  const [runResp, jobsResp] = await Promise.all([
    fetchApi(`${API}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    }),
    fetchApi(`${API}/repos/${owner}/${repo}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    }),
  ]);

  if (!runResp.ok) {
    throw new AdapterFailure("getRunPage", `run responded ${runResp.status}`);
  }
  if (!jobsResp.ok) {
    throw new AdapterFailure("getRunPage", `jobs responded ${jobsResp.status}`);
  }

  const runRaw = (await runResp.json()) as Record<string, unknown>;
  const jobsRaw = (await jobsResp.json()) as { jobs?: unknown[] };

  const run = parseRun(runRaw, owner, repo);
  const jobs: JobDetail[] = [];
  for (const j of jobsRaw.jobs ?? []) {
    const parsed = parseJob(j);
    if (parsed) jobs.push(parsed);
  }

  return { owner, repo, run, jobs };
}

function parseRun(r: Record<string, unknown>, owner: string, repo: string): RunDetail {
  const id = typeof r["id"] === "number" ? (r["id"] as number) : 0;
  const htmlUrl = typeof r["html_url"] === "string" ? (r["html_url"] as string) : "";
  const workflowName = typeof r["name"] === "string" ? (r["name"] as string) : "Workflow";
  const workflowId = typeof r["workflow_id"] === "number" ? (r["workflow_id"] as number) : null;
  const workflowUrl = workflowId != null ? `/${owner}/${repo}/actions?workflow=${workflowId}` : null;
  const displayTitle = typeof r["display_title"] === "string" ? (r["display_title"] as string) : workflowName;
  const runNumber = typeof r["run_number"] === "number" ? (r["run_number"] as number) : null;
  const runAttempt = typeof r["run_attempt"] === "number" ? (r["run_attempt"] as number) : null;
  const event = typeof r["event"] === "string" ? (r["event"] as string) : "";
  const rawStatus = typeof r["status"] === "string" ? (r["status"] as string) : "";
  const rawConclusion = typeof r["conclusion"] === "string" ? (r["conclusion"] as string) : null;
  const status = resolveStatus(rawStatus, rawConclusion);
  const branch = typeof r["head_branch"] === "string" ? (r["head_branch"] as string) : null;
  const headSha = typeof r["head_sha"] === "string" ? (r["head_sha"] as string) : null;
  const commitRaw = r["head_commit"];
  const commitMessage = commitRaw && typeof commitRaw === "object"
    ? (typeof (commitRaw as Record<string, unknown>)["message"] === "string"
        ? ((commitRaw as Record<string, unknown>)["message"] as string).split("\n")[0]!
        : null)
    : null;

  const startedAt = typeof r["run_started_at"] === "string" ? (r["run_started_at"] as string) : null;
  const updatedAt = typeof r["updated_at"] === "string" ? (r["updated_at"] as string) : null;
  const duration = computeDuration(startedAt, updatedAt);

  return {
    id,
    url: htmlUrl,
    workflowName,
    workflowId,
    workflowUrl,
    displayTitle,
    runNumber,
    runAttempt,
    event,
    status,
    rawStatus,
    rawConclusion,
    branch,
    branchUrl: branch ? `/${owner}/${repo}/tree/${encodeURIComponent(branch)}` : null,
    commitSha: headSha,
    commitShortSha: headSha ? headSha.slice(0, 7) : null,
    commitUrl: headSha ? `/${owner}/${repo}/commit/${headSha}` : null,
    commitMessage: commitMessage ?? null,
    triggeringActor: parseUser(r["triggering_actor"]),
    actor: parseUser(r["actor"]),
    startedAt,
    updatedAt,
    duration,
    htmlUrl,
  };
}

function parseUser(raw: unknown): { login: string; avatarUrl: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const login = typeof a["login"] === "string" ? (a["login"] as string) : null;
  if (!login) return null;
  const avatarUrl = typeof a["avatar_url"] === "string"
    ? (a["avatar_url"] as string)
    : `https://github.com/${login}.png?size=40`;
  return { login, avatarUrl };
}

function parseJob(raw: unknown): JobDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const id = typeof j["id"] === "number" ? (j["id"] as number) : 0;
  if (!id) return null;
  const name = typeof j["name"] === "string" ? (j["name"] as string) : "Job";
  const rawStatus = typeof j["status"] === "string" ? (j["status"] as string) : "";
  const rawConclusion = typeof j["conclusion"] === "string" ? (j["conclusion"] as string) : null;
  const status = resolveStatus(rawStatus, rawConclusion);
  const startedAt = typeof j["started_at"] === "string" ? (j["started_at"] as string) : null;
  const completedAt = typeof j["completed_at"] === "string" ? (j["completed_at"] as string) : null;
  const url = typeof j["html_url"] === "string" ? (j["html_url"] as string) : "";
  const runnerName = typeof j["runner_name"] === "string" ? (j["runner_name"] as string) : null;
  const labelsRaw = j["labels"];
  const labels: string[] = [];
  if (Array.isArray(labelsRaw)) {
    for (const l of labelsRaw) {
      if (typeof l === "string") labels.push(l);
    }
  }
  const stepsRaw = j["steps"];
  const steps: JobStep[] = [];
  if (Array.isArray(stepsRaw)) {
    for (const s of stepsRaw) {
      const parsed = parseStep(s);
      if (parsed) steps.push(parsed);
    }
  }
  return {
    id,
    name,
    status,
    rawStatus,
    rawConclusion,
    startedAt,
    completedAt,
    duration: computeDuration(startedAt, completedAt),
    url,
    runnerName,
    labels,
    steps,
  };
}

function parseStep(raw: unknown): JobStep | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const name = typeof s["name"] === "string" ? (s["name"] as string) : null;
  if (!name) return null;
  const number = typeof s["number"] === "number" ? (s["number"] as number) : 0;
  const rawStatus = typeof s["status"] === "string" ? (s["status"] as string) : "";
  const rawConclusion = typeof s["conclusion"] === "string" ? (s["conclusion"] as string) : null;
  const status = resolveStatus(rawStatus, rawConclusion);
  const startedAt = typeof s["started_at"] === "string" ? (s["started_at"] as string) : null;
  const completedAt = typeof s["completed_at"] === "string" ? (s["completed_at"] as string) : null;
  return {
    name,
    number,
    status,
    startedAt,
    completedAt,
    duration: computeDuration(startedAt, completedAt),
  };
}

function resolveStatus(status: string, conclusion: string | null): WorkflowRunStatus {
  if (status !== "completed") {
    if (status === "queued") return "queued";
    if (status === "in_progress") return "in_progress";
    if (status === "pending" || status === "waiting") return "pending";
    if (status === "") return "unknown";
    return "pending";
  }
  switch (conclusion) {
    case "success": return "success";
    case "failure": return "failure";
    case "timed_out": return "timed_out";
    case "action_required": return "action_required";
    case "cancelled": return "cancelled";
    case "skipped": return "skipped";
    case "neutral": return "neutral";
    case "stale": return "stale";
    default: return "unknown";
  }
}

function computeDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min < 60) return `${min}m ${rest}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}
