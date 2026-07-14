import { AdapterFailure } from "./index";
import { fetchApi } from "./rate-limit";

export type MeIssueKind = "issue" | "pull";
export type MeIssueFilter = "created" | "assigned" | "mentioned" | "review-requested";

export type MeIssueItem = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  isPull: boolean;
  draft: boolean;
  author: { login: string; avatarUrl: string } | null;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  labels: { name: string; color: string }[];
  pullState: "open" | "closed" | "merged" | "draft" | null;
};

export type MeIssuesPage = {
  kind: MeIssueKind;
  filter: MeIssueFilter;
  login: string | null;
  query: string;
  totalCount: number;
  items: MeIssueItem[];
};

const API = "https://api.github.com";

export async function getMeIssues(kind: MeIssueKind, filter: MeIssueFilter, login: string | null): Promise<MeIssuesPage> {
  if (!login) {
    return { kind, filter, login, query: "", totalCount: 0, items: [] };
  }

  const typeClause = kind === "issue" ? "type:issue" : "type:pr";
  let filterClause: string;
  switch (filter) {
    case "created": filterClause = `author:${login}`; break;
    case "assigned": filterClause = `assignee:${login}`; break;
    case "mentioned": filterClause = `mentions:${login}`; break;
    case "review-requested": filterClause = `review-requested:${login}`; break;
  }
  const q = `is:open ${typeClause} archived:false ${filterClause} sort:updated-desc`;

  const url = `${API}/search/issues?q=${encodeURIComponent(q)}&per_page=30`;
  const resp = await fetchApi(url, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getMeIssues", `search responded ${resp.status}`);
  }
  const data = (await resp.json()) as { total_count?: number; items?: unknown[] };
  const items: MeIssueItem[] = [];
  for (const raw of data.items ?? []) {
    const parsed = parseItem(raw);
    if (parsed) items.push(parsed);
  }
  return {
    kind,
    filter,
    login,
    query: q,
    totalCount: typeof data.total_count === "number" ? data.total_count : items.length,
    items,
  };
}

function parseItem(raw: unknown): MeIssueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const number = typeof r["number"] === "number" ? (r["number"] as number) : 0;
  if (!number) return null;
  const title = typeof r["title"] === "string" ? (r["title"] as string) : "";
  const urlRaw = typeof r["html_url"] === "string" ? (r["html_url"] as string) : "";
  const url = urlRaw.replace(/^https:\/\/github\.com/, "");
  const stateRaw = typeof r["state"] === "string" ? (r["state"] as string) : "open";
  const draft = r["draft"] === true;
  const isPull = !!r["pull_request"];
  let pullState: MeIssueItem["pullState"] = null;
  if (isPull) {
    if (stateRaw === "closed") {
      const prRaw = r["pull_request"];
      const mergedAt = prRaw && typeof prRaw === "object" ? (prRaw as Record<string, unknown>)["merged_at"] : null;
      pullState = mergedAt ? "merged" : "closed";
    } else if (draft) {
      pullState = "draft";
    } else {
      pullState = "open";
    }
  }

  const userRaw = r["user"];
  let author: MeIssueItem["author"] = null;
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

  const repoUrl = typeof r["repository_url"] === "string" ? (r["repository_url"] as string) : "";
  const repoMatch = /\/repos\/([^/]+)\/([^/]+)$/.exec(repoUrl);
  const repoOwner = repoMatch ? repoMatch[1]! : "";
  const repoName = repoMatch ? repoMatch[2]! : "";
  // skip items with an unparseable repository_url so the view doesn't render a bare "/" link
  if (!repoOwner || !repoName) return null;

  const labelsRaw = r["labels"];
  const labels: MeIssueItem["labels"] = [];
  if (Array.isArray(labelsRaw)) {
    for (const l of labelsRaw) {
      if (!l || typeof l !== "object") continue;
      const lr = l as Record<string, unknown>;
      const name = typeof lr["name"] === "string" ? (lr["name"] as string) : null;
      const color = typeof lr["color"] === "string" ? (lr["color"] as string) : "cccccc";
      if (name) labels.push({ name, color });
    }
  }

  return {
    number,
    title,
    url,
    state: stateRaw === "closed" ? "closed" : "open",
    isPull,
    draft,
    author,
    repoOwner,
    repoName,
    repoUrl: repoOwner && repoName ? `/${repoOwner}/${repoName}` : "",
    createdAt: typeof r["created_at"] === "string" ? (r["created_at"] as string) : "",
    updatedAt: typeof r["updated_at"] === "string" ? (r["updated_at"] as string) : "",
    comments: typeof r["comments"] === "number" ? (r["comments"] as number) : 0,
    labels,
    pullState,
  };
}
