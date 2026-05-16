import { AdapterFailure } from "./index";
import { extractEmbeddedPayload, parseRepoPage } from "./_page";

export type IssueState = "OPEN" | "CLOSED";
export type PullState = "OPEN" | "CLOSED" | "MERGED";

export type Actor = {
  login: string;
  avatarUrl: string;
  isAgent?: boolean;
};

export type Label = {
  name: string;
  color: string;
  description: string | null;
};

export type ReactionCount = {
  content: string;
  count: number;
};

export type Milestone = {
  title: string;
  url: string;
};

export type CommentNode = {
  kind: "comment";
  id: string;
  author: Actor | null;
  bodyHtml: string;
  createdAt: string;
  authorAssociation: string | null;
  reactions: ReactionCount[];
  isAuthor: boolean;
};

export type EventNode = {
  kind: "event";
  type: string;
  actor: Actor | null;
  createdAt: string;
  label?: Label;
  assignee?: Actor;
  fromState?: string;
  toState?: string;
  refTitle?: string;
  refUrl?: string;
  ref?: string;
  commitOid?: string;
  commitMessageHeadline?: string;
};

export type TimelineNode = CommentNode | EventNode;

export type IssueDetail = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  titleHtml: string;
  state: IssueState;
  stateReason: string | null;
  bodyHtml: string;
  author: Actor | null;
  createdAt: string;
  labels: Label[];
  assignees: Actor[];
  milestone: Milestone | null;
  reactions: ReactionCount[];
  timeline: TimelineNode[];
  totalTimelineCount: number;
  isLocked: boolean;
};

export type PullDetail = IssueDetail & {
  isDraft: boolean;
  state: PullState;
  headRefName: string;
  baseRefName: string;
  headRepoOwner: string | null;
  commitsCount: number;
  changedFiles: number;
  additions: number;
  deletions: number;
  merged: boolean;
  mergedAt: string | null;
  mergedBy: Actor | null;
};

export async function getIssue(owner: string, repo: string, number: number): Promise<IssueDetail> {
  const url = `https://github.com/${owner}/${repo}/issues/${number}`;
  return fetchAndParse(owner, repo, number, url, "issue") as Promise<IssueDetail>;
}

export async function getPull(owner: string, repo: string, number: number): Promise<PullDetail> {
  const url = `https://github.com/${owner}/${repo}/pull/${number}`;
  return fetchAndParse(owner, repo, number, url, "pullRequest") as Promise<PullDetail>;
}

async function fetchAndParse(
  owner: string,
  repo: string,
  number: number,
  url: string,
  kind: "issue" | "pullRequest",
): Promise<IssueDetail | PullDetail> {
  const resp = await fetch(url, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getIssue", `${url} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);
  const payload = extractEmbeddedPayload(doc);

  const root = (payload as { payload?: { preloadedQueries?: unknown[] } })?.payload;
  const queries = Array.isArray(root?.preloadedQueries) ? root!.preloadedQueries : [];

  let entity: Record<string, unknown> | null = null;
  for (const q of queries) {
    if (!q || typeof q !== "object") continue;
    const data = (q as { result?: { data?: { repository?: Record<string, unknown> } } }).result?.data?.repository;
    if (data && data[kind] && typeof data[kind] === "object") {
      entity = data[kind] as Record<string, unknown>;
      break;
    }
  }

  if (!entity) {
    throw new AdapterFailure("getIssue", `no ${kind} payload found`);
  }

  const base = parseEntityCore(entity, owner, repo, number);
  if (kind === "issue") return base;
  return enrichPull(base, entity);
}

function parseEntityCore(
  e: Record<string, unknown>,
  owner: string,
  repo: string,
  number: number,
): IssueDetail {
  const title = typeof e["title"] === "string" ? (e["title"] as string) : "";
  const titleHtml = typeof e["titleHTML"] === "string" ? (e["titleHTML"] as string) : escapeHtml(title);
  const state = e["state"] === "CLOSED" ? "CLOSED" : "OPEN";
  const stateReason = typeof e["stateReason"] === "string" ? (e["stateReason"] as string) : null;
  const bodyHtml = typeof e["bodyHTML"] === "string" ? (e["bodyHTML"] as string) : "";
  const createdAt = typeof e["createdAt"] === "string" ? (e["createdAt"] as string) : "";

  const front = readTimelineEdges(e["frontTimelineItems"]);
  const back = readTimelineEdges(e["backTimelineItems"]);
  const totalCount =
    readNumber(readObj(e["frontTimelineItems"]), "totalCount") ??
    front.length + back.length;

  return {
    owner,
    repo,
    number,
    title,
    titleHtml,
    state,
    stateReason,
    bodyHtml,
    author: parseActor(e["author"]),
    createdAt,
    labels: parseLabels(e["labels"]),
    assignees: parseAssignees(e["assignedActors"]),
    milestone: parseMilestone(e["milestone"]),
    reactions: parseReactions(e["reactionGroups"]),
    timeline: [...front, ...back],
    totalTimelineCount: totalCount,
    isLocked: e["locked"] === true,
  };
}

function enrichPull(base: IssueDetail, e: Record<string, unknown>): PullDetail {
  const stateRaw = typeof e["state"] === "string" ? (e["state"] as string).toUpperCase() : "OPEN";
  const state: PullState =
    stateRaw === "MERGED" ? "MERGED" : stateRaw === "CLOSED" ? "CLOSED" : "OPEN";
  const merged = e["merged"] === true || state === "MERGED";

  return {
    ...base,
    state,
    isDraft: e["isDraft"] === true,
    headRefName: typeof e["headRefName"] === "string" ? (e["headRefName"] as string) : "",
    baseRefName: typeof e["baseRefName"] === "string" ? (e["baseRefName"] as string) : "",
    headRepoOwner: readNestedString(e["headRepository"], ["owner", "login"]),
    commitsCount: readNumber(readObj(e["commits"]), "totalCount") ?? 0,
    changedFiles: typeof e["changedFiles"] === "number" ? (e["changedFiles"] as number) : 0,
    additions: typeof e["additions"] === "number" ? (e["additions"] as number) : 0,
    deletions: typeof e["deletions"] === "number" ? (e["deletions"] as number) : 0,
    merged,
    mergedAt: typeof e["mergedAt"] === "string" ? (e["mergedAt"] as string) : null,
    mergedBy: parseActor(e["mergedBy"]),
  };
}

function readTimelineEdges(raw: unknown): TimelineNode[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { edges?: unknown };
  if (!Array.isArray(r.edges)) return [];
  const out: TimelineNode[] = [];
  for (const edge of r.edges) {
    if (!edge || typeof edge !== "object") continue;
    const node = (edge as { node?: unknown }).node;
    const parsed = parseTimelineNode(node);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseTimelineNode(raw: unknown): TimelineNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const type = String(n["__typename"] ?? "");
  if (!type) return null;

  if (type === "IssueComment" || type === "PullRequestReviewThread" || type === "PullRequestReview") {
    if (type !== "IssueComment") {
      // Fallback: render as event for review/thread
      return parseEventNode(type, n);
    }
    return {
      kind: "comment",
      id: String(n["id"] ?? ""),
      author: parseActor(n["author"]),
      bodyHtml: typeof n["bodyHTML"] === "string" ? (n["bodyHTML"] as string) : "",
      createdAt: typeof n["createdAt"] === "string" ? (n["createdAt"] as string) : "",
      authorAssociation: typeof n["authorAssociation"] === "string" ? (n["authorAssociation"] as string) : null,
      reactions: parseReactions(n["reactionGroups"]),
      isAuthor: n["viewerDidAuthor"] === true,
    };
  }
  return parseEventNode(type, n);
}

function parseEventNode(type: string, n: Record<string, unknown>): EventNode {
  const ev: EventNode = {
    kind: "event",
    type,
    actor: parseActor(n["actor"]),
    createdAt: typeof n["createdAt"] === "string" ? (n["createdAt"] as string) : "",
  };

  const label = parseLabel(n["label"]);
  if (label) ev.label = label;

  const assignee = parseActor(n["assignee"]);
  if (assignee) ev.assignee = assignee;

  if (type === "RenamedTitleEvent") {
    if (typeof n["previousTitle"] === "string") ev.fromState = n["previousTitle"] as string;
    if (typeof n["currentTitle"] === "string") ev.toState = n["currentTitle"] as string;
  }

  if (type === "ReferencedEvent" || type === "CrossReferencedEvent") {
    const src = readObj(n["source"]) ?? readObj(n["subject"]);
    if (src) {
      ev.refTitle = typeof src["title"] === "string" ? (src["title"] as string) : undefined;
      ev.refUrl = typeof src["url"] === "string" ? (src["url"] as string) : undefined;
      const refNumber = src["number"];
      if (typeof refNumber === "number") ev.ref = `#${refNumber}`;
    }
    if (typeof n["commitOid"] === "string") ev.commitOid = n["commitOid"] as string;
  }

  if (type === "ClosedEvent" && typeof n["stateReason"] === "string") {
    ev.toState = (n["stateReason"] as string);
  }

  if (type === "HeadRefForcePushedEvent" || type === "BaseRefForcePushedEvent") {
    if (typeof n["beforeCommit"] === "object" && n["beforeCommit"] !== null) {
      const before = (n["beforeCommit"] as { abbreviatedOid?: string }).abbreviatedOid;
      if (typeof before === "string") ev.fromState = before;
    }
    if (typeof n["afterCommit"] === "object" && n["afterCommit"] !== null) {
      const after = (n["afterCommit"] as { abbreviatedOid?: string }).abbreviatedOid;
      if (typeof after === "string") ev.toState = after;
    }
  }

  if (type === "PullRequestCommit" || type === "Commit") {
    const commit = readObj(n["commit"]) ?? n;
    if (typeof commit["oid"] === "string") ev.commitOid = (commit["oid"] as string).slice(0, 7);
    if (typeof commit["messageHeadline"] === "string") ev.commitMessageHeadline = commit["messageHeadline"] as string;
    if (typeof commit["messageHeadlineHTML"] === "string") ev.commitMessageHeadline = commit["messageHeadlineHTML"] as string;
  }

  return ev;
}

function parseActor(raw: unknown): Actor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const login = a["login"];
  if (typeof login !== "string") return null;
  return {
    login,
    avatarUrl: typeof a["avatarUrl"] === "string" ? (a["avatarUrl"] as string) : `https://github.com/${login}.png?size=64`,
    isAgent: a["isAgent"] === true || a["isCopilot"] === true,
  };
}

function parseLabels(raw: unknown): Label[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { edges?: unknown; nodes?: unknown };
  if (Array.isArray(r.nodes)) {
    return r.nodes.map((n) => parseLabel(n)).filter((l): l is Label => l !== null);
  }
  if (!Array.isArray(r.edges)) return [];
  const out: Label[] = [];
  for (const edge of r.edges) {
    if (!edge || typeof edge !== "object") continue;
    const node = (edge as { node?: unknown }).node;
    const parsed = parseLabel(node);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseLabel(raw: unknown): Label | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const name = l["name"];
  if (typeof name !== "string") return null;
  return {
    name,
    color: typeof l["color"] === "string" ? (l["color"] as string) : "ccc",
    description: typeof l["description"] === "string" ? (l["description"] as string) : null,
  };
}

function parseAssignees(raw: unknown): Actor[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { edges?: unknown };
  if (!Array.isArray(r.edges)) return [];
  const out: Actor[] = [];
  for (const edge of r.edges) {
    if (!edge || typeof edge !== "object") continue;
    const node = (edge as { node?: unknown }).node;
    const parsed = parseActor(node);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseMilestone(raw: unknown): Milestone | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const title = m["title"];
  if (typeof title !== "string") return null;
  return {
    title,
    url: typeof m["url"] === "string" ? (m["url"] as string) : "",
  };
}

function parseReactions(raw: unknown): ReactionCount[] {
  if (!Array.isArray(raw)) return [];
  const out: ReactionCount[] = [];
  for (const rg of raw) {
    if (!rg || typeof rg !== "object") continue;
    const content = (rg as { content?: unknown }).content;
    const count =
      readNumber(readObj((rg as { reactors?: unknown }).reactors), "totalCount") ??
      readNumber(readObj((rg as { users?: unknown }).users), "totalCount") ??
      0;
    if (typeof content !== "string" || count <= 0) continue;
    out.push({ content, count });
  }
  return out;
}

function readObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function readNumber(o: Record<string, unknown> | null, key: string): number | null {
  if (!o) return null;
  const v = o[key];
  return typeof v === "number" ? v : null;
}

function readNestedString(raw: unknown, path: string[]): string | null {
  let cur: unknown = raw;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? (cur as string) : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
