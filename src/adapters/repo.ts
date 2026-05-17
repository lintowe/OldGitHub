import { AdapterFailure } from "./index";

export type RepoSummary = {
  owner: string;
  repo: string;
  nwo: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  parentNwo: string | null;
  description: string;
  homepage: string | null;
  defaultBranch: string;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  topics: string[];
  primaryLanguage: string | null;
  license: string | null;
};

const summaryCache = new Map<string, { value: RepoSummary; expires: number }>();
const TTL_MS = 60_000;

export async function getRepoSummary(owner: string, repo: string): Promise<RepoSummary> {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const now = Date.now();
  const cached = summaryCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getRepoSummary", `responded ${resp.status}`);
  }
  const data = (await resp.json()) as Record<string, unknown>;

  const fullName = typeof data["full_name"] === "string" ? (data["full_name"] as string) : `${owner}/${repo}`;
  const parent = data["parent"] && typeof data["parent"] === "object" ? (data["parent"] as Record<string, unknown>) : null;
  const license = data["license"] && typeof data["license"] === "object" ? (data["license"] as Record<string, unknown>) : null;

  const summary: RepoSummary = {
    owner,
    repo,
    nwo: fullName,
    isPrivate: data["private"] === true,
    isFork: data["fork"] === true,
    isArchived: data["archived"] === true,
    parentNwo: parent ? (typeof parent["full_name"] === "string" ? (parent["full_name"] as string) : null) : null,
    description: typeof data["description"] === "string" ? (data["description"] as string) : "",
    homepage: typeof data["homepage"] === "string" && (data["homepage"] as string).trim() ? (data["homepage"] as string) : null,
    defaultBranch: typeof data["default_branch"] === "string" ? (data["default_branch"] as string) : "main",
    stars: typeof data["stargazers_count"] === "number" ? (data["stargazers_count"] as number) : null,
    forks: typeof data["forks_count"] === "number" ? (data["forks_count"] as number) : null,
    watchers: typeof data["subscribers_count"] === "number" ? (data["subscribers_count"] as number) : (typeof data["watchers_count"] === "number" ? (data["watchers_count"] as number) : null),
    topics: Array.isArray(data["topics"]) ? (data["topics"] as unknown[]).filter((t): t is string => typeof t === "string") : [],
    primaryLanguage: typeof data["language"] === "string" ? (data["language"] as string) : null,
    license: license ? (typeof license["spdx_id"] === "string" ? (license["spdx_id"] as string) : (typeof license["name"] === "string" ? (license["name"] as string) : null)) : null,
  };

  summaryCache.set(key, { value: summary, expires: now + TTL_MS });
  return summary;
}

export async function getRepoLanguages(owner: string, repo: string): Promise<Array<{ name: string; bytes: number; percent: number }>> {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as Record<string, unknown>;
  const entries: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "number") entries.push([k, v]);
  }
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (total === 0) return [];
  entries.sort((a, b) => b[1] - a[1]);
  return entries.map(([name, bytes]) => ({ name, bytes, percent: (bytes / total) * 100 }));
}

export function formatCount(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
