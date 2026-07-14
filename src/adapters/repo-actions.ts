import { AdapterFailure } from "./index";
import { fetchApi } from "./rate-limit";

export type WorkflowRunStatus = "success" | "failure" | "pending" | "queued" | "in_progress" | "cancelled" | "skipped" | "neutral" | "action_required" | "timed_out" | "stale" | "unknown";

export type WorkflowRun = {
  id: string;
  url: string;
  title: string;
  workflowName: string;
  runNumber: number | null;
  status: WorkflowRunStatus;
  branch: string | null;
  branchUrl: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  actor: { login: string; avatarUrl: string } | null;
  startedAt: string | null;
  duration: string | null;
};

export type WorkflowFile = {
  id: number;
  name: string;
  filePath: string;
  href: string;
};

export type ActionsView = {
  owner: string;
  repo: string;
  query: string;
  workflows: WorkflowFile[];
  runs: WorkflowRun[];
  totalCount: number;
  selectedWorkflowId: string;
  selectedWorkflowName: string | null;
  selectedWorkflowFilePath: string | null;
};

const API = "https://api.github.com";

export async function getActions(owner: string, repo: string, query: string, workflowPath: string | null = null): Promise<ActionsView> {
  const params = new URLSearchParams(query);
  const queryWorkflowId = params.get("workflow") ?? "";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const workflowsResp = await fetchApi(`${API}/repos/${owner}/${repo}/actions/workflows?per_page=100`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!workflowsResp.ok) {
    throw new AdapterFailure("getActions", `workflows responded ${workflowsResp.status}`);
  }
  const workflowsData = (await workflowsResp.json()) as { workflows?: unknown[] };
  const workflows: WorkflowFile[] = [];
  for (const w of workflowsData.workflows ?? []) {
    if (!w || typeof w !== "object") continue;
    const r = w as Record<string, unknown>;
    const id = typeof r["id"] === "number" ? (r["id"] as number) : null;
    const name = typeof r["name"] === "string" ? (r["name"] as string) : null;
    if (id == null || !name) continue;
    const filePath = typeof r["path"] === "string" ? (r["path"] as string) : "";
    workflows.push({
      id,
      name,
      filePath,
      href: filePath ? `/${owner}/${repo}/actions/workflows/${filePath.replace(/^\.github\/workflows\//, "")}` : `/${owner}/${repo}/actions?workflow=${id}`,
    });
  }

  let workflowId = queryWorkflowId;
  let selectedWorkflowFilePath: string | null = null;
  let selectedWorkflowName: string | null = null;
  if (workflowPath) {
    const normalized = workflowPath.startsWith(".github/workflows/") ? workflowPath : `.github/workflows/${workflowPath}`;
    const match = workflows.find((w) => w.filePath === normalized);
    if (match) {
      workflowId = String(match.id);
      selectedWorkflowFilePath = match.filePath;
      selectedWorkflowName = match.name;
    } else {
      selectedWorkflowFilePath = normalized;
    }
  } else if (queryWorkflowId) {
    const match = workflows.find((w) => String(w.id) === queryWorkflowId);
    if (match) {
      selectedWorkflowName = match.name;
      selectedWorkflowFilePath = match.filePath;
    }
  }

  const runsPath = workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/runs`
    : `/repos/${owner}/${repo}/actions/runs`;
  const runsResp = await fetchApi(`${API}${runsPath}?per_page=30&page=${page}`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!runsResp.ok) {
    throw new AdapterFailure("getActions", `runs responded ${runsResp.status}`);
  }
  const runsData = (await runsResp.json()) as { workflow_runs?: unknown[]; total_count?: number };
  const runs: WorkflowRun[] = [];
  for (const raw of runsData.workflow_runs ?? []) {
    const parsed = parseRun(raw, owner, repo);
    if (parsed) runs.push(parsed);
  }
  const totalCount = typeof runsData.total_count === "number" ? runsData.total_count : runs.length;

  return {
    owner,
    repo,
    query,
    workflows,
    runs,
    totalCount,
    selectedWorkflowId: workflowId,
    selectedWorkflowName,
    selectedWorkflowFilePath,
  };
}

function parseRun(raw: unknown, owner: string, repo: string): WorkflowRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r["id"] === "number" ? String(r["id"] as number) : "";
  if (!id) return null;
  const url = (typeof r["html_url"] === "string" ? (r["html_url"] as string) : "").replace(/^https:\/\/github\.com/, "");
  const workflowName = typeof r["name"] === "string" ? (r["name"] as string) : "Workflow";
  const displayTitle = typeof r["display_title"] === "string" ? (r["display_title"] as string) : workflowName;
  const runNumber = typeof r["run_number"] === "number" ? (r["run_number"] as number) : null;
  const branch = typeof r["head_branch"] === "string" ? (r["head_branch"] as string) : null;
  const headSha = typeof r["head_sha"] === "string" ? (r["head_sha"] as string) : null;
  const status = resolveStatus(typeof r["status"] === "string" ? (r["status"] as string) : "", typeof r["conclusion"] === "string" ? (r["conclusion"] as string) : null);
  const actorRaw = r["actor"];
  let actor: WorkflowRun["actor"] = null;
  if (actorRaw && typeof actorRaw === "object") {
    const a = actorRaw as Record<string, unknown>;
    const login = typeof a["login"] === "string" ? (a["login"] as string) : null;
    if (login) {
      actor = {
        login,
        avatarUrl: typeof a["avatar_url"] === "string" ? (a["avatar_url"] as string) : `https://github.com/${login}.png?size=40`,
      };
    }
  }
  const runStartedAt = typeof r["run_started_at"] === "string" ? (r["run_started_at"] as string) : null;
  const updatedAt = typeof r["updated_at"] === "string" ? (r["updated_at"] as string) : null;
  const duration = computeDuration(runStartedAt, updatedAt);

  return {
    id,
    url,
    title: displayTitle,
    workflowName,
    runNumber,
    status,
    branch,
    branchUrl: branch ? `/${owner}/${repo}/tree/${encodeURIComponent(branch)}` : null,
    commitSha: headSha ? headSha.slice(0, 7) : null,
    commitUrl: headSha ? `/${owner}/${repo}/commit/${headSha}` : null,
    actor,
    startedAt: runStartedAt,
    duration,
  };
}

function resolveStatus(status: string, conclusion: string | null): WorkflowRunStatus {
  if (status !== "completed") {
    if (status === "queued") return "queued";
    if (status === "in_progress") return "in_progress";
    if (status === "pending" || status === "waiting") return "pending";
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
