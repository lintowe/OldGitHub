import { AdapterFailure } from "./index";
import { extractEmbeddedPayload, parseRepoPage } from "./_page";

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
  author: IssueActor | null;
  labels: IssueLabel[];
  assignees: IssueActor[];
  milestone: { title: string; url: string } | null;
  isPullRequest: boolean;
};

export type IssueListView = {
  owner: string;
  repo: string;
  query: string;
  rawQuery: string;
  totalCount: number;
  rows: IssueRow[];
  pageInfo: {
    hasNext: boolean;
    hasPrevious: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

export async function getIssueList(
  owner: string,
  repo: string,
  rawQuery: string,
  kind: "issues" | "pulls",
): Promise<IssueListView> {
  const path = kind === "pulls" ? "pulls" : "issues";
  const url = `https://github.com/${owner}/${repo}/${path}${rawQuery ? "?" + rawQuery : ""}`;
  const resp = await fetch(url, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getIssueList", `${url} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);
  const payload = extractEmbeddedPayload(doc);

  const root = (payload as { payload?: { preloadedQueries?: unknown[] } })?.payload;
  const queries = Array.isArray(root?.preloadedQueries) ? root!.preloadedQueries : [];
  const indexQuery = queries.find(
    (q): q is { result: { data?: { repository?: unknown } }; variables?: { query?: string } } =>
      typeof q === "object" && q !== null && (q as { queryName?: string }).queryName === "IssueIndexPageQuery",
  );
  if (!indexQuery) {
    throw new AdapterFailure("getIssueList", "missing IssueIndexPageQuery");
  }

  const repository = (indexQuery.result?.data?.repository ?? {}) as Record<string, unknown>;
  const search = (repository["search"] ?? null) as
    | null
    | {
        edges?: { node?: unknown }[];
        issueCount?: number;
        pageInfo?: { hasNextPage?: boolean; hasPreviousPage?: boolean; startCursor?: string; endCursor?: string };
      };
  if (!search) {
    throw new AdapterFailure("getIssueList", "missing search result");
  }

  const rows: IssueRow[] = [];
  for (const edge of search.edges ?? []) {
    const parsed = parseNode(edge?.node);
    if (parsed) rows.push(parsed);
  }

  return {
    owner,
    repo,
    query: typeof indexQuery.variables?.query === "string" ? indexQuery.variables.query : rawQuery,
    rawQuery,
    totalCount: typeof search.issueCount === "number" ? search.issueCount : rows.length,
    rows,
    pageInfo: {
      hasNext: search.pageInfo?.hasNextPage === true,
      hasPrevious: search.pageInfo?.hasPreviousPage === true,
      startCursor: search.pageInfo?.startCursor ?? null,
      endCursor: search.pageInfo?.endCursor ?? null,
    },
  };
}

function parseNode(raw: unknown): IssueRow | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const number = n["number"];
  const state = n["state"];
  const titleHtml = n["titleHtml"];
  if (typeof number !== "number" || typeof state !== "string" || typeof titleHtml !== "string") {
    return null;
  }
  const typename = String(n["__typename"] ?? "");
  return {
    number,
    titleHtml,
    state: state === "CLOSED" ? "CLOSED" : "OPEN",
    stateReason: typeof n["stateReason"] === "string" ? (n["stateReason"] as string) : null,
    createdAt: typeof n["createdAt"] === "string" ? (n["createdAt"] as string) : "",
    closedAt: typeof n["closedAt"] === "string" ? (n["closedAt"] as string) : null,
    author: parseActor(n["author"]),
    labels: parseLabels(n["labels"]),
    assignees: parseAssignees(n["assignedActors"]),
    milestone: parseMilestone(n["milestone"]),
    isPullRequest: typename === "PullRequest",
  };
}

function parseActor(raw: unknown): IssueActor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const login = a["login"];
  if (typeof login !== "string") return null;
  return {
    login,
    avatarUrl: typeof a["avatarUrl"] === "string" ? (a["avatarUrl"] as string) : `https://github.com/${login}.png?size=64`,
  };
}

function parseLabels(raw: unknown): IssueLabel[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { edges?: unknown };
  if (!Array.isArray(r.edges)) return [];
  const out: IssueLabel[] = [];
  for (const edge of r.edges) {
    if (!edge || typeof edge !== "object") continue;
    const node = (edge as { node?: unknown }).node;
    if (!node || typeof node !== "object") continue;
    const name = (node as { name?: unknown }).name;
    const color = (node as { color?: unknown }).color;
    if (typeof name !== "string") continue;
    out.push({
      name,
      color: typeof color === "string" ? color : "ccc",
    });
  }
  return out;
}

function parseAssignees(raw: unknown): IssueActor[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { edges?: unknown };
  if (!Array.isArray(r.edges)) return [];
  const out: IssueActor[] = [];
  for (const edge of r.edges) {
    if (!edge || typeof edge !== "object") continue;
    const node = (edge as { node?: unknown }).node;
    const parsed = parseActor(node);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseMilestone(raw: unknown): { title: string; url: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const title = m["title"];
  const url = m["url"];
  if (typeof title !== "string") return null;
  return { title, url: typeof url === "string" ? url : "" };
}
