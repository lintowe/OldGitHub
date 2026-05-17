import { AdapterFailure } from "./index";

export type SearchType =
  | "repositories"
  | "issues"
  | "pullrequests"
  | "users"
  | "code"
  | "commits"
  | "topics";

export type SearchSort =
  | "best-match"
  | "stars"
  | "forks"
  | "updated"
  | "created"
  | "interactions"
  | "reactions"
  | "comments";

export type SearchOrder = "asc" | "desc";

export type RepoResult = {
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  repoName: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  forks: number;
  watchers: number;
  isFork: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  htmlUrl: string;
  updatedAt: string;
  license: string | null;
  topics: string[];
};

export type IssueResult = {
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  user: { login: string; avatarUrl: string } | null;
  repoFullName: string;
  htmlUrl: string;
  commentCount: number;
  labels: Array<{ name: string; color: string }>;
  isPull: boolean;
  draft: boolean;
  merged: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserResult = {
  login: string;
  type: "User" | "Organization";
  avatarUrl: string;
  htmlUrl: string;
  score: number;
};

export type CodeResult = {
  name: string;
  path: string;
  htmlUrl: string;
  repoFullName: string;
  ownerAvatar: string;
  textMatches: Array<{ fragment: string; objectType: string | null }>;
};

export type CommitResult = {
  sha: string;
  abbrevSha: string;
  messageHeadline: string;
  repoFullName: string;
  htmlUrl: string;
  authorLogin: string | null;
  authorAvatarUrl: string;
  date: string;
};

export type TopicResult = {
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  htmlUrl: string;
  featured: boolean;
};

export type SearchSummary = {
  query: string;
  type: SearchType;
  totalCount: number;
  incompleteResults: boolean;
};

const API = "https://api.github.com";

export async function searchRepositories(query: string, sort: string, order: SearchOrder): Promise<{ summary: SearchSummary; items: RepoResult[] }> {
  const data = await rawSearch("repositories", query, sort, order);
  const items = readArray(data["items"]).map(parseRepoResult).filter((r): r is RepoResult => r !== null);
  return summaryAnd<RepoResult>(query, "repositories", data, items);
}

export async function searchIssues(query: string, sort: string, order: SearchOrder, pullOnly: boolean): Promise<{ summary: SearchSummary; items: IssueResult[] }> {
  const effective = pullOnly ? `${query} type:pr` : query;
  const data = await rawSearch("issues", effective, sort, order);
  const items = readArray(data["items"]).map(parseIssueResult).filter((r): r is IssueResult => r !== null);
  return summaryAnd<IssueResult>(query, pullOnly ? "pullrequests" : "issues", data, items);
}

export async function searchUsers(query: string, sort: string, order: SearchOrder): Promise<{ summary: SearchSummary; items: UserResult[] }> {
  const data = await rawSearch("users", query, sort, order);
  const items = readArray(data["items"]).map(parseUserResult).filter((r): r is UserResult => r !== null);
  return summaryAnd<UserResult>(query, "users", data, items);
}

export async function searchCode(query: string, sort: string, order: SearchOrder): Promise<{ summary: SearchSummary; items: CodeResult[] }> {
  const data = await rawSearch("code", query, sort, order, "application/vnd.github.text-match+json");
  const items = readArray(data["items"]).map(parseCodeResult).filter((r): r is CodeResult => r !== null);
  return summaryAnd<CodeResult>(query, "code", data, items);
}

export async function searchCommits(query: string, sort: string, order: SearchOrder): Promise<{ summary: SearchSummary; items: CommitResult[] }> {
  const data = await rawSearch("commits", query, sort, order, "application/vnd.github.cloak-preview+json");
  const items = readArray(data["items"]).map(parseCommitResult).filter((r): r is CommitResult => r !== null);
  return summaryAnd<CommitResult>(query, "commits", data, items);
}

export async function searchTopics(query: string): Promise<{ summary: SearchSummary; items: TopicResult[] }> {
  const data = await rawSearch("topics", query, "best-match", "desc", "application/vnd.github.mercy-preview+json");
  const items = readArray(data["items"]).map(parseTopicResult).filter((r): r is TopicResult => r !== null);
  return summaryAnd<TopicResult>(query, "topics", data, items);
}

async function rawSearch(
  segment: "repositories" | "issues" | "users" | "code" | "commits" | "topics",
  query: string,
  sort: string,
  order: SearchOrder,
  accept = "application/vnd.github+json",
): Promise<Record<string, unknown>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], total_count: 0, incomplete_results: false };
  }
  const params = new URLSearchParams({ q: trimmed, per_page: "30" });
  if (sort && sort !== "best-match") params.set("sort", sort);
  if (order) params.set("order", order);
  const resp = await fetch(`${API}/search/${segment}?${params.toString()}`, {
    credentials: "omit",
    headers: { Accept: accept },
  });
  if (!resp.ok) {
    throw new AdapterFailure("search", `/search/${segment} responded ${resp.status}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

function summaryAnd<T>(query: string, type: SearchType, data: Record<string, unknown>, items: T[]): { summary: SearchSummary; items: T[] } {
  return {
    summary: {
      query,
      type,
      totalCount: typeof data["total_count"] === "number" ? (data["total_count"] as number) : items.length,
      incompleteResults: data["incomplete_results"] === true,
    },
    items,
  };
}

function parseRepoResult(raw: unknown): RepoResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fullName = readString(r, "full_name");
  if (!fullName) return null;
  const owner = readObj(r["owner"]);
  const license = readObj(r["license"]);
  return {
    fullName,
    ownerLogin: (owner && readString(owner, "login")) ?? fullName.split("/")[0] ?? "",
    ownerAvatar: (owner && readString(owner, "avatar_url")) ?? "",
    repoName: readString(r, "name") ?? fullName.split("/")[1] ?? "",
    description: readString(r, "description"),
    language: readString(r, "language"),
    stargazers: readNumber(r, "stargazers_count") ?? 0,
    forks: readNumber(r, "forks_count") ?? 0,
    watchers: readNumber(r, "watchers_count") ?? 0,
    isFork: r["fork"] === true,
    isPrivate: r["private"] === true,
    isArchived: r["archived"] === true,
    htmlUrl: readString(r, "html_url") ?? `https://github.com/${fullName}`,
    updatedAt: readString(r, "updated_at") ?? "",
    license: license ? readString(license, "spdx_id") ?? readString(license, "name") : null,
    topics: readArray(r["topics"]).filter((t): t is string => typeof t === "string"),
  };
}

function parseIssueResult(raw: unknown): IssueResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = readString(r, "title");
  const num = readNumber(r, "number");
  if (!title || num == null) return null;
  const user = readObj(r["user"]);
  const pull = readObj(r["pull_request"]);
  const htmlUrl = readString(r, "html_url") ?? "";
  const repoFullName = htmlUrl.replace("https://github.com/", "").replace(/\/(issues|pull)\/\d+.*/, "");
  return {
    number: num,
    title,
    state: readString(r, "state") === "closed" ? "closed" : "open",
    body: readString(r, "body"),
    user: user ? { login: readString(user, "login") ?? "", avatarUrl: readString(user, "avatar_url") ?? "" } : null,
    repoFullName,
    htmlUrl,
    commentCount: readNumber(r, "comments") ?? 0,
    labels: readArray(r["labels"])
      .map((l) => {
        if (!l || typeof l !== "object") return null;
        const o = l as Record<string, unknown>;
        const n = readString(o, "name");
        if (!n) return null;
        return { name: n, color: readString(o, "color") ?? "ccc" };
      })
      .filter((x): x is { name: string; color: string } => x !== null),
    isPull: !!pull,
    draft: r["draft"] === true,
    merged: pull ? readString(pull, "merged_at") !== null : false,
    createdAt: readString(r, "created_at") ?? "",
    updatedAt: readString(r, "updated_at") ?? "",
  };
}

function parseUserResult(raw: unknown): UserResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const login = readString(r, "login");
  if (!login) return null;
  const type = readString(r, "type") === "Organization" ? "Organization" : "User";
  return {
    login,
    type,
    avatarUrl: readString(r, "avatar_url") ?? `https://github.com/${login}.png?size=96`,
    htmlUrl: readString(r, "html_url") ?? `https://github.com/${login}`,
    score: readNumber(r, "score") ?? 0,
  };
}

function parseCodeResult(raw: unknown): CodeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = readString(r, "name");
  if (!name) return null;
  const repo = readObj(r["repository"]);
  const owner = repo ? readObj(repo["owner"]) : null;
  const matches = readArray(r["text_matches"])
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const o = m as Record<string, unknown>;
      const fragment = readString(o, "fragment");
      if (!fragment) return null;
      return { fragment, objectType: readString(o, "object_type") };
    })
    .filter((x): x is { fragment: string; objectType: string | null } => x !== null);
  return {
    name,
    path: readString(r, "path") ?? "",
    htmlUrl: readString(r, "html_url") ?? "",
    repoFullName: (repo && readString(repo, "full_name")) ?? "",
    ownerAvatar: (owner && readString(owner, "avatar_url")) ?? "",
    textMatches: matches,
  };
}

function parseCommitResult(raw: unknown): CommitResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sha = readString(r, "sha");
  if (!sha) return null;
  const commit = readObj(r["commit"]);
  const author = commit ? readObj(commit["author"]) : null;
  const ghAuthor = readObj(r["author"]);
  const repo = readObj(r["repository"]);
  const message = (commit && readString(commit, "message")) ?? "";
  return {
    sha,
    abbrevSha: sha.slice(0, 7),
    messageHeadline: message.split("\n")[0] ?? "",
    repoFullName: (repo && readString(repo, "full_name")) ?? "",
    htmlUrl: readString(r, "html_url") ?? "",
    authorLogin: ghAuthor ? readString(ghAuthor, "login") : null,
    authorAvatarUrl: (ghAuthor && readString(ghAuthor, "avatar_url")) ?? "",
    date: (author && readString(author, "date")) ?? "",
  };
}

function parseTopicResult(raw: unknown): TopicResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = readString(r, "name");
  if (!name) return null;
  return {
    name,
    displayName: readString(r, "display_name"),
    shortDescription: readString(r, "short_description") ?? readString(r, "description"),
    htmlUrl: `https://github.com/topics/${name}`,
    featured: r["featured"] === true,
  };
}

function readObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function readArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function readString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}
function readNumber(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === "number" ? v : null;
}
