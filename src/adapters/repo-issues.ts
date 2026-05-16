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

  const relay = tryReadRelay(doc);
  if (relay) {
    return { owner, repo, rawQuery, ...relay };
  }

  const fallback = readHtmlRows(doc, rawQuery);
  if (fallback) {
    return { owner, repo, rawQuery, ...fallback };
  }

  throw new AdapterFailure("getIssueList", "no recognizable issue list shape");
}

type ListPayload = Omit<IssueListView, "owner" | "repo" | "rawQuery">;

function tryReadRelay(doc: Document): ListPayload | null {
  let payload: unknown;
  try {
    payload = extractEmbeddedPayload(doc);
  } catch {
    return null;
  }
  const root = (payload as { payload?: { preloadedQueries?: unknown[] } })?.payload;
  const queries = Array.isArray(root?.preloadedQueries) ? root!.preloadedQueries : [];
  const indexQuery = queries.find(
    (q): q is { result: { data?: { repository?: unknown } }; variables?: { query?: string } } =>
      typeof q === "object" && q !== null && (q as { queryName?: string }).queryName === "IssueIndexPageQuery",
  );
  if (!indexQuery) return null;

  const repository = (indexQuery.result?.data?.repository ?? {}) as Record<string, unknown>;
  const search = (repository["search"] ?? null) as
    | null
    | {
        edges?: { node?: unknown }[];
        issueCount?: number;
        pageInfo?: { hasNextPage?: boolean; hasPreviousPage?: boolean; startCursor?: string; endCursor?: string };
      };
  if (!search) return null;

  const rows: IssueRow[] = [];
  for (const edge of search.edges ?? []) {
    const parsed = parseNode(edge?.node);
    if (parsed) rows.push(parsed);
  }

  return {
    query: typeof indexQuery.variables?.query === "string" ? indexQuery.variables.query : "",
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

function readHtmlRows(doc: Document, rawQuery: string): ListPayload | null {
  const rowEls = doc.querySelectorAll<HTMLElement>("div.js-issue-row, li.js-issue-row");
  if (rowEls.length === 0) return null;

  const rows: IssueRow[] = [];
  for (const el of Array.from(rowEls)) {
    const parsed = parseHtmlRow(el);
    if (parsed) rows.push(parsed);
  }

  const params = new URLSearchParams(rawQuery);
  const query = params.get("q") || "";

  const stateNavLink = doc.querySelector<HTMLAnchorElement>("a.btn-link.selected, a.selected[href*='/pulls'], a.selected[href*='/issues']");
  const navCountMatch = stateNavLink?.textContent && /([\d,]+)/.exec(stateNavLink.textContent);
  const totalCount = navCountMatch && navCountMatch[1]
    ? parseInt(navCountMatch[1].replace(/,/g, ""), 10)
    : rows.length;

  const hasPrev = !!doc.querySelector('a.next_page[rel="prev"], a[aria-label="Previous"]');
  const hasNext = !!doc.querySelector('a.next_page:not([rel="prev"]), a[aria-label="Next"], a[rel="next"]');

  return {
    query,
    totalCount,
    rows,
    pageInfo: {
      hasNext,
      hasPrevious: hasPrev,
      startCursor: null,
      endCursor: null,
    },
  };
}

function parseHtmlRow(el: HTMLElement): IssueRow | null {
  const idMatch = /issue_(\d+)/.exec(el.id);
  if (!idMatch || !idMatch[1]) return null;
  const number = parseInt(idMatch[1], 10);

  const titleAnchor = el.querySelector<HTMLAnchorElement>(
    'a.Link--primary, a.h4, a[data-hovercard-type="pull_request"], a[data-hovercard-type="issue"]',
  );
  if (!titleAnchor) return null;
  const titleHtml = titleAnchor.innerHTML.trim();
  const href = titleAnchor.getAttribute("href") || "";

  const stateLabel = el.querySelector<HTMLElement>('[aria-label*="Open" i], [aria-label*="Closed" i], [aria-label*="Merged" i], [aria-label*="Draft" i]')
    ?.getAttribute("aria-label") ?? "";
  const isMerged = /merged/i.test(stateLabel) || el.classList.contains("merged");
  const isClosed = /closed/i.test(stateLabel) || el.classList.contains("closed");
  const state: IssueState = isClosed || isMerged ? "CLOSED" : "OPEN";
  const stateReason = isMerged ? "MERGED" : isClosed ? "COMPLETED" : null;

  const createdAt = el.querySelector("relative-time")?.getAttribute("datetime") || "";
  const authorEl = el.querySelector<HTMLAnchorElement>('a.opened-by, a.muted-link.text-bold, a[data-hovercard-type="user"]');
  const author: IssueActor | null = authorEl?.textContent?.trim()
    ? {
        login: authorEl.textContent.trim(),
        avatarUrl: `https://github.com/${authorEl.textContent.trim()}.png?size=40`,
      }
    : null;

  const labels: IssueLabel[] = [];
  for (const labelEl of Array.from(el.querySelectorAll<HTMLElement>("a.IssueLabel, a[data-name]"))) {
    const name = labelEl.getAttribute("data-name") || labelEl.textContent?.trim() || "";
    if (!name) continue;
    const style = labelEl.getAttribute("style") || "";
    const colorMatch = /--label-r:\s*(\d+)[^;]*;\s*--label-g:\s*(\d+)[^;]*;\s*--label-b:\s*(\d+)/.exec(style);
    let color = "cccccc";
    if (colorMatch && colorMatch[1] && colorMatch[2] && colorMatch[3]) {
      color = [colorMatch[1], colorMatch[2], colorMatch[3]]
        .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
        .join("");
    } else {
      const hexMatch = /background(?:-color)?:\s*#?([\da-f]{6})/i.exec(style);
      if (hexMatch && hexMatch[1]) color = hexMatch[1];
    }
    labels.push({ name, color });
  }

  const assignees: IssueActor[] = [];
  for (const a of Array.from(el.querySelectorAll<HTMLImageElement>('img.avatar-user, img.avatar'))) {
    const alt = a.getAttribute("alt") || "";
    const login = alt.startsWith("@") ? alt.slice(1) : alt;
    if (!login || login === author?.login) continue;
    assignees.push({
      login,
      avatarUrl: a.getAttribute("src") || `https://github.com/${login}.png?size=40`,
    });
  }

  return {
    number,
    titleHtml,
    state,
    stateReason,
    createdAt,
    closedAt: null,
    author,
    labels,
    assignees,
    milestone: null,
    isPullRequest: /\/pull\//.test(href),
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
