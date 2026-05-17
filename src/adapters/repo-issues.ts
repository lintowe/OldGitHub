import { AdapterFailure } from "./index";

export type IssueState = "OPEN" | "CLOSED";

export type IssueLabel = {
  name: string;
  color: string;
};

export type IssueActor = {
  login: string;
  avatarUrl: string;
};

export type IssueRow = {
  number: number;
  titleHtml: string;
  state: IssueState;
  stateReason: string | null;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  comments: number;
  author: IssueActor | null;
  labels: IssueLabel[];
  assignees: IssueActor[];
  milestone: { title: string; url: string } | null;
  isPullRequest: boolean;
  isDraft: boolean;
  merged: boolean;
};

export type IssueListView = {
  owner: string;
  repo: string;
  query: string;
  rawQuery: string;
  totalCount: number;
  openCount: number | null;
  closedCount: number | null;
  rows: IssueRow[];
  pageInfo: {
    hasNext: boolean;
    hasPrevious: boolean;
    page: number;
  };
};

const API = "https://api.github.com";

export async function getIssueList(
  owner: string,
  repo: string,
  rawQuery: string,
  kind: "issues" | "pulls",
): Promise<IssueListView> {
  const params = new URLSearchParams(rawQuery);
  const qStr = params.get("q") || "";
  const wantsClosed = /\bis:closed\b/i.test(qStr) || params.get("state") === "closed";
  const wantsAll = /\bis:all\b/i.test(qStr) || params.get("state") === "all";
  const state: "open" | "closed" | "all" = wantsAll ? "all" : (wantsClosed ? "closed" : "open");
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const labels = extractLabels(qStr) ?? params.get("labels") ?? undefined;
  const author = extractKey(qStr, "author") ?? undefined;
  const assignee = extractKey(qStr, "assignee") ?? params.get("assignee") ?? undefined;
  const milestone = extractKey(qStr, "milestone") ?? params.get("milestone") ?? undefined;
  const sortClause = extractSort(qStr);
  const sort = sortClause.sort ?? "updated";
  const direction = sortClause.direction ?? "desc";

  const apiUrl = new URL(`${API}/repos/${owner}/${repo}/${kind === "pulls" ? "pulls" : "issues"}`);
  apiUrl.searchParams.set("state", state);
  apiUrl.searchParams.set("per_page", "30");
  apiUrl.searchParams.set("page", String(page));
  apiUrl.searchParams.set("sort", sort);
  apiUrl.searchParams.set("direction", direction);
  if (labels) apiUrl.searchParams.set("labels", labels);
  if (author && kind === "issues") apiUrl.searchParams.set("creator", author);
  if (assignee) apiUrl.searchParams.set("assignee", assignee);
  if (milestone) apiUrl.searchParams.set("milestone", milestone);

  const resp = await fetch(apiUrl.toString(), {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getIssueList", `${apiUrl.pathname} responded ${resp.status}`);
  }
  const data = (await resp.json()) as unknown[];
  const rows: IssueRow[] = [];
  for (const raw of data) {
    const parsed = parseRow(raw, kind);
    if (parsed) {
      if (kind === "issues" && parsed.isPullRequest) continue;
      rows.push(parsed);
    }
  }

  const linkHeader = resp.headers.get("link") || "";
  const hasNext = /<[^>]+>;\s*rel="next"/i.test(linkHeader);
  const hasPrev = /<[^>]+>;\s*rel="prev"/i.test(linkHeader);

  const counts = await getCounts(owner, repo, kind);

  const totalCount = state === "closed"
    ? (counts.closed ?? rows.length)
    : state === "open"
      ? (counts.open ?? rows.length)
      : ((counts.open ?? 0) + (counts.closed ?? 0)) || rows.length;

  return {
    owner,
    repo,
    rawQuery,
    query: qStr,
    totalCount,
    openCount: counts.open,
    closedCount: counts.closed,
    rows,
    pageInfo: { hasNext, hasPrevious: hasPrev, page },
  };
}

async function getCounts(owner: string, repo: string, kind: "issues" | "pulls"): Promise<{ open: number | null; closed: number | null }> {
  const typeClause = kind === "pulls" ? "type:pr" : "type:issue";
  const repoClause = `repo:${owner}/${repo}`;
  const [openRes, closedRes] = await Promise.allSettled([
    fetch(`${API}/search/issues?q=${encodeURIComponent(`${typeClause} ${repoClause} is:open`)}&per_page=1`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    }),
    fetch(`${API}/search/issues?q=${encodeURIComponent(`${typeClause} ${repoClause} is:closed`)}&per_page=1`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    }),
  ]);
  return {
    open: await readTotal(openRes),
    closed: await readTotal(closedRes),
  };
}

async function readTotal(r: PromiseSettledResult<Response>): Promise<number | null> {
  if (r.status !== "fulfilled" || !r.value.ok) return null;
  try {
    const j = (await r.value.json()) as { total_count?: number };
    return typeof j.total_count === "number" ? j.total_count : null;
  } catch {
    return null;
  }
}

function parseRow(raw: unknown, kind: "issues" | "pulls"): IssueRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const number = typeof r["number"] === "number" ? (r["number"] as number) : 0;
  if (!number) return null;
  const title = typeof r["title"] === "string" ? (r["title"] as string) : "";
  const stateRaw = typeof r["state"] === "string" ? (r["state"] as string) : "open";
  const state: IssueState = stateRaw === "closed" ? "CLOSED" : "OPEN";
  const stateReason = typeof r["state_reason"] === "string" ? (r["state_reason"] as string) : null;

  const isPullRequest = kind === "pulls" || !!r["pull_request"];
  let merged = false;
  let isDraft = false;
  if (kind === "pulls") {
    merged = !!r["merged_at"];
    isDraft = r["draft"] === true;
  } else if (r["pull_request"] && typeof r["pull_request"] === "object") {
    merged = !!(r["pull_request"] as Record<string, unknown>)["merged_at"];
  }

  const userRaw = r["user"];
  let author: IssueActor | null = null;
  if (userRaw && typeof userRaw === "object") {
    const u = userRaw as Record<string, unknown>;
    const login = typeof u["login"] === "string" ? (u["login"] as string) : null;
    if (login) {
      author = {
        login,
        avatarUrl: typeof u["avatar_url"] === "string" ? (u["avatar_url"] as string) : `https://github.com/${login}.png?size=40`,
      };
    }
  }

  const labelsRaw = r["labels"];
  const labels: IssueLabel[] = [];
  if (Array.isArray(labelsRaw)) {
    for (const l of labelsRaw) {
      if (!l || typeof l !== "object") continue;
      const lr = l as Record<string, unknown>;
      const name = typeof lr["name"] === "string" ? (lr["name"] as string) : null;
      const color = typeof lr["color"] === "string" ? (lr["color"] as string) : "cccccc";
      if (name) labels.push({ name, color });
    }
  }

  const assigneesRaw = r["assignees"];
  const assignees: IssueActor[] = [];
  if (Array.isArray(assigneesRaw)) {
    for (const a of assigneesRaw) {
      if (!a || typeof a !== "object") continue;
      const ar = a as Record<string, unknown>;
      const login = typeof ar["login"] === "string" ? (ar["login"] as string) : null;
      if (login) {
        assignees.push({
          login,
          avatarUrl: typeof ar["avatar_url"] === "string" ? (ar["avatar_url"] as string) : `https://github.com/${login}.png?size=40`,
        });
      }
    }
  }

  let milestone: { title: string; url: string } | null = null;
  const ms = r["milestone"];
  if (ms && typeof ms === "object") {
    const m = ms as Record<string, unknown>;
    const t = typeof m["title"] === "string" ? (m["title"] as string) : null;
    if (t) {
      const num = typeof m["number"] === "number" ? (m["number"] as number) : 0;
      milestone = { title: t, url: num ? `/milestone/${num}` : "" };
    }
  }

  return {
    number,
    titleHtml: escapeText(title),
    state,
    stateReason,
    createdAt: typeof r["created_at"] === "string" ? (r["created_at"] as string) : "",
    closedAt: typeof r["closed_at"] === "string" ? (r["closed_at"] as string) : null,
    updatedAt: typeof r["updated_at"] === "string" ? (r["updated_at"] as string) : "",
    comments: typeof r["comments"] === "number" ? (r["comments"] as number) : 0,
    author,
    labels,
    assignees,
    milestone,
    isPullRequest,
    isDraft,
    merged,
  };
}

function extractLabels(q: string): string | null {
  const matches = Array.from(q.matchAll(/\blabel:("([^"]+)"|([^\s"]+))/gi));
  if (matches.length === 0) return null;
  return matches.map((m) => m[2] || m[3] || "").filter(Boolean).join(",");
}

function extractKey(q: string, key: string): string | null {
  const m = new RegExp(`\\b${key}:("([^"]+)"|([^\\s"]+))`, "i").exec(q);
  if (!m) return null;
  return m[2] || m[3] || null;
}

function extractSort(q: string): { sort: "created" | "updated" | "comments" | null; direction: "asc" | "desc" | null } {
  const m = /\bsort:([\w-]+)\b/i.exec(q);
  if (!m || !m[1]) return { sort: null, direction: null };
  const v = m[1].toLowerCase();
  if (v.startsWith("created")) return { sort: "created", direction: v.endsWith("asc") ? "asc" : "desc" };
  if (v.startsWith("updated")) return { sort: "updated", direction: v.endsWith("asc") ? "asc" : "desc" };
  if (v.startsWith("comments")) return { sort: "comments", direction: v.endsWith("asc") ? "asc" : "desc" };
  return { sort: null, direction: null };
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
