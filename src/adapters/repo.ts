import { AdapterFailure } from "./index";
import { fetchApi, isApiRateLimited } from "./rate-limit";
import { fetchRepoPage, parseRepoPage } from "./_page";

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
  hasIssues: boolean;
  hasWiki: boolean;
  hasProjects: boolean;
  hasDiscussions: boolean;
};

const summaryCache = new Map<string, { value: RepoSummary; expires: number }>();
const TTL_MS = 60_000;

export async function getRepoSummary(owner: string, repo: string): Promise<RepoSummary> {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const now = Date.now();
  const cached = summaryCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  if (isApiRateLimited()) {
    const scraped = await scrapeRepoSummary(owner, repo).catch(() => null);
    if (scraped) {
      summaryCache.set(key, { value: scraped, expires: now + TTL_MS });
      return scraped;
    }
    throw new AdapterFailure("getRepoSummary", "API rate-limited; skipping");
  }

  const resp = await fetchApi(`https://api.github.com/repos/${owner}/${repo}`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    // Private repos return 404 to anonymous API calls, but the page itself
    // renders fine when the user has a cookie. Fall back to scraping the
    // page so we can still show description, topics, and feature flags.
    const scraped = await scrapeRepoSummary(owner, repo).catch(() => null);
    if (scraped) {
      summaryCache.set(key, { value: scraped, expires: now + TTL_MS });
      return scraped;
    }
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
    hasIssues: data["has_issues"] !== false,
    hasWiki: data["has_wiki"] !== false,
    hasProjects: data["has_projects"] !== false,
    hasDiscussions: data["has_discussions"] === true,
  };

  summaryCache.set(key, { value: summary, expires: now + TTL_MS });
  return summary;
}

async function scrapeRepoSummary(owner: string, repo: string): Promise<RepoSummary> {
  const html = await fetchRepoPage(owner, repo);
  const doc = parseRepoPage(html);

  const titleMeta = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || "";
  const descMeta = doc.querySelector<HTMLMetaElement>('meta[name="description"], meta[property="og:description"]')?.content?.trim() || "";

  // The page's <body> data-pjax-transient-attr or sidebar links tell us
  // about features. Look at the repo tabs nav to discover which exist.
  const tabLinks = doc.querySelectorAll<HTMLAnchorElement>('nav[role="navigation"] a, ul.UnderlineNav-body a, [data-pjax-container] nav a');
  let hasIssues = false;
  let hasWiki = false;
  let hasProjects = false;
  let hasDiscussions = false;
  for (const a of Array.from(tabLinks)) {
    const href = a.getAttribute("href") || "";
    if (/\/issues$/.test(href) || /\/issues\?/.test(href)) hasIssues = true;
    else if (/\/wiki$/.test(href) || /\/wiki\//.test(href)) hasWiki = true;
    else if (/\/projects$/.test(href) || /\/projects\?/.test(href)) hasProjects = true;
    else if (/\/discussions$/.test(href) || /\/discussions\?/.test(href)) hasDiscussions = true;
  }

  // Topics are rendered as <a class="topic-tag"> or under a topics list.
  const topicEls = doc.querySelectorAll<HTMLElement>('a[data-octo-click="topic_click"], a.topic-tag, a[href^="/topics/"]');
  const topics: string[] = [];
  const seenTopic = new Set<string>();
  for (const t of Array.from(topicEls)) {
    const name = (t.textContent || "").trim();
    if (name && !seenTopic.has(name) && /^[a-z0-9-]+$/.test(name)) {
      seenTopic.add(name);
      topics.push(name);
    }
  }

  // Strip the trailing "Contribute to … on GitHub." that GitHub appends.
  const description = descMeta
    .replace(/\s*Contribute to [^.]+\s+development by creating an account on GitHub\.?\s*$/i, "")
    .replace(/^.*?:\s*/, "")
    .trim();

  const isPrivate = !!doc.querySelector('.octicon-lock, [aria-label="Private repository"]');
  const isFork = !!doc.querySelector('.octicon-repo-forked + span, [data-pjax-replace] [aria-label*="forked"]')
    || /^Forks /.test(titleMeta);
  const isArchived = !!doc.querySelector('.flash-warn, [class*="archived"]');
  const branch = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_default_branch"]')?.content
    || doc.querySelector<HTMLElement>('[data-test-selector="branch-name"]')?.textContent?.trim()
    || "main";

  return {
    owner,
    repo,
    nwo: `${owner}/${repo}`,
    isPrivate,
    isFork,
    isArchived,
    parentNwo: null,
    description,
    homepage: null,
    defaultBranch: branch,
    stars: null,
    forks: null,
    watchers: null,
    topics,
    primaryLanguage: null,
    license: null,
    hasIssues,
    hasWiki,
    hasProjects,
    hasDiscussions,
  };
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
