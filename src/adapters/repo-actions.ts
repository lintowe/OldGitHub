import { AdapterFailure } from "./index";
import { parseRepoPage } from "./_page";

export type WorkflowRunStatus = "success" | "failure" | "pending" | "queued" | "in_progress" | "cancelled" | "skipped" | "neutral" | "action_required" | "unknown";

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
};

export async function getActions(owner: string, repo: string, query: string): Promise<ActionsView> {
  const url = `https://github.com/${owner}/${repo}/actions${query ? "?" + query : ""}`;
  const resp = await fetch(url, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getActions", `${url} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);

  const workflows: WorkflowFile[] = [];
  const seenWf = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/actions/workflows/"]'))) {
    const href = a.getAttribute("href") || "";
    if (!href || seenWf.has(href)) continue;
    seenWf.add(href);
    const name = a.textContent?.trim() || href.split("/").pop() || "workflow";
    const filePath = href.replace(/^.*\/actions\/workflows\//, "");
    workflows.push({ name, filePath, href });
  }

  const runs: WorkflowRun[] = [];
  for (const row of Array.from(doc.querySelectorAll<HTMLElement>(".Box-row"))) {
    const parsed = parseRunRow(row);
    if (parsed) runs.push(parsed);
  }

  const countEl = doc.querySelector(".d-flex.flex-md-row .Box-header h2, h2.color-fg-muted");
  const countText = countEl?.textContent || "";
  const m = /([\d,]+)/.exec(countText);
  const totalCount = m && m[1] ? parseInt(m[1].replace(/,/g, ""), 10) : runs.length;

  return { owner, repo, query, workflows, runs, totalCount };
}

function parseRunRow(row: HTMLElement): WorkflowRun | null {
  const id = row.id || "";
  const titleAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/actions/runs/"]');
  if (!titleAnchor) return null;
  const url = titleAnchor.getAttribute("href") || "";

  const aria = titleAnchor.getAttribute("aria-label") || "";
  const status = parseStatusFromAria(aria) ?? parseStatusFromIcon(row);

  const titleText = titleAnchor.textContent?.replace(/\s+/g, " ").trim() || "";
  const runMatch = /Run\s+(\d+)\s+of\s+(.+?)\.\s/i.exec(aria + " ") ?? /Run\s+(\d+)\s+of\s+(.+)/i.exec(aria);
  const runNumber = runMatch && runMatch[1] ? parseInt(runMatch[1], 10) : null;
  const workflowName = runMatch && runMatch[2] ? runMatch[2].replace(/\.\s*$/, "").split(".")[0]!.trim() : "Workflow";

  const branchAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/tree/"], a.commit-ref');
  const branch = branchAnchor?.textContent?.trim() || null;
  const branchUrl = branchAnchor?.getAttribute("href") || null;

  const commitAnchor = row.querySelector<HTMLAnchorElement>('a[href*="/commit/"]');
  const commitSha = commitAnchor?.textContent?.trim() || null;
  const commitUrl = commitAnchor?.getAttribute("href") || null;

  const actorAnchor = row.querySelector<HTMLAnchorElement>('a[href^="/"][rel*="contributor"], a img.avatar-user');
  let actor: WorkflowRun["actor"] = null;
  const avatarImg = row.querySelector<HTMLImageElement>('img.avatar, img.avatar-user');
  if (avatarImg) {
    const alt = avatarImg.getAttribute("alt") || "";
    const login = alt.startsWith("@") ? alt.slice(1) : alt.split(" ")[0]!;
    if (login) {
      actor = { login, avatarUrl: avatarImg.getAttribute("src") || `https://github.com/${login}.png?size=40` };
    }
  }

  const timeEl = row.querySelector("relative-time");
  const startedAt = timeEl?.getAttribute("datetime") || null;

  const durationEl = row.querySelector<HTMLElement>('span[title*="duration"], .duration-meta, .css-truncate-target');
  const duration = durationEl?.textContent?.trim() || null;

  return {
    id,
    url,
    title: stripStatusPrefix(titleText, runNumber, workflowName),
    workflowName,
    runNumber,
    status,
    branch,
    branchUrl,
    commitSha,
    commitUrl,
    actor,
    startedAt,
    duration,
  };
}

function stripStatusPrefix(t: string, runNum: number | null, wfName: string): string {
  let out = t.replace(/^[\s ]+/, "").replace(/[\s ]+$/, "");
  if (runNum !== null) {
    const re = new RegExp(`^.*?Run\\s+${runNum}\\s+of\\s+${wfName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\.?`, "i");
    out = out.replace(re, "").trim();
  }
  return out || wfName;
}

function parseStatusFromAria(aria: string): WorkflowRunStatus | null {
  const lower = aria.toLowerCase();
  if (lower.startsWith("succeeded") || lower.startsWith("success") || lower.startsWith("passed")) return "success";
  if (lower.startsWith("failed") || lower.startsWith("failure")) return "failure";
  if (lower.startsWith("queued")) return "queued";
  if (lower.startsWith("in_progress") || lower.startsWith("in progress") || lower.startsWith("running")) return "in_progress";
  if (lower.startsWith("pending")) return "pending";
  if (lower.startsWith("cancelled") || lower.startsWith("canceled")) return "cancelled";
  if (lower.startsWith("skipped")) return "skipped";
  if (lower.startsWith("neutral")) return "neutral";
  if (lower.startsWith("requires action") || lower.startsWith("action_required")) return "action_required";
  return null;
}

function parseStatusFromIcon(row: HTMLElement): WorkflowRunStatus {
  const svg = row.querySelector("svg");
  if (!svg) return "unknown";
  const cls = svg.getAttribute("class") || "";
  if (/check-circle|success/.test(cls)) return "success";
  if (/x-circle|failure|stop/.test(cls)) return "failure";
  if (/dot-fill-pending|clock/.test(cls)) return "pending";
  if (/sync|in-progress/.test(cls)) return "in_progress";
  if (/skip/.test(cls)) return "skipped";
  if (/alert|warning/.test(cls)) return "action_required";
  return "unknown";
}
