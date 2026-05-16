export type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo-home"; owner: string; repo: string }
  | { kind: "repo-tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "repo-commit"; owner: string; repo: string; sha: string }
  | { kind: "repo-compare"; owner: string; repo: string; range: string }
  | { kind: "repo-issues"; owner: string; repo: string; query: string; subkind: "issues" | "pulls" }
  | { kind: "repo-issue"; owner: string; repo: string; number: number; subkind: "issue" | "pull" }
  | { kind: "repo-wiki"; owner: string; repo: string; page: string }
  | { kind: "repo-actions"; owner: string; repo: string; query: string }
  | { kind: "repo-pulse"; owner: string; repo: string }
  | { kind: "repo-graphs"; owner: string; repo: string; subkind: "contributors" | "commit-activity" | "code-frequency" | "traffic" }
  | { kind: "repo-projects"; owner: string; repo: string; query: string }
  | { kind: "repo-security"; owner: string; repo: string; subkind: "overview" | "advisories" }
  | { kind: "repo-other"; owner: string; repo: string }
  | { kind: "profile"; login: string; tab: ProfileTab; query: string }
  | { kind: "top-level"; subkind: "dashboard" | "notifications" | "search" | "issues" | "pulls" | "stars" | "explore" | "trending" | "watching"; pathname: string; search: string; title: string }
  | { kind: "todo"; name: string };

export type ProfileTab = "overview" | "repositories" | "stars" | "followers" | "following" | "achievements" | "projects" | "packages" | "sponsoring";

const OUT_OF_SCOPE_PREFIXES = [
  "/codespaces",
  "/marketplace",
  "/sponsors",
  "/enterprises",
];

const TOP_LEVEL_NON_REPO = new Set([
  "search",
  "login",
  "logout",
  "join",
  "signup",
  "settings",
  "notifications",
  "issues",
  "pulls",
  "stars",
  "explore",
  "trending",
  "marketplace",
  "sponsors",
  "enterprise",
  "enterprises",
  "codespaces",
  "new",
  "organizations",
  "orgs",
  "gist",
  "gists",
  "apps",
  "features",
  "pricing",
  "about",
  "contact",
  "help",
  "home",
  "watching",
  "collections",
  "topics",
  "dashboard",
  "discussions",
  "events",
  "feed",
  "users",
  "advisories",
  "security",
  "premium-support",
  "404",
  "site",
]);

export function resolveRoute(pathname: string, search: string): Route {
  for (const prefix of OUT_OF_SCOPE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return { kind: "out-of-scope" };
    }
  }

  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) {
    return { kind: "top-level", subkind: "dashboard", pathname, search, title: "Dashboard" };
  }

  const first = segs[0]!;
  const topLevel = matchTopLevel(first, pathname, search);
  if (topLevel) return topLevel;

  if (TOP_LEVEL_NON_REPO.has(first)) {
    return { kind: "todo", name: pathname };
  }

  if (segs.length === 1) {
    return { kind: "profile", login: first, tab: parseProfileTab(search), query: search };
  }

  const owner = first;
  const repo = segs[1]!;
  if (segs.length === 2) {
    return { kind: "repo-home", owner, repo };
  }

  if (segs[2] === "tree" && segs.length >= 4) {
    const refAndPath = segs.slice(3).join("/");
    return { kind: "repo-tree", owner, repo, refAndPath };
  }

  if (segs[2] === "blob" && segs.length >= 5) {
    const refAndPath = segs.slice(3).join("/");
    return { kind: "repo-blob", owner, repo, refAndPath };
  }

  if (segs[2] === "commits" && segs.length >= 4) {
    const refAndPath = segs.slice(3).join("/");
    return { kind: "repo-commits", owner, repo, refAndPath, query: search };
  }

  if (segs[2] === "commit" && segs.length >= 4) {
    const sha = segs[3]!;
    return { kind: "repo-commit", owner, repo, sha };
  }

  if (segs[2] === "compare" && segs.length >= 4) {
    const range = segs.slice(3).join("/");
    return { kind: "repo-compare", owner, repo, range };
  }

  if (segs[2] === "issues" && segs.length === 3) {
    return { kind: "repo-issues", owner, repo, query: search, subkind: "issues" };
  }
  if (segs[2] === "pulls" && segs.length === 3) {
    return { kind: "repo-issues", owner, repo, query: search, subkind: "pulls" };
  }

  if ((segs[2] === "issues" || segs[2] === "pull") && segs.length >= 4) {
    const num = parseInt(segs[3]!, 10);
    if (!Number.isNaN(num)) {
      return { kind: "repo-issue", owner, repo, number: num, subkind: segs[2] === "pull" ? "pull" : "issue" };
    }
  }

  if (segs[2] === "wiki") {
    const page = segs.slice(3).join("/") || "Home";
    return { kind: "repo-wiki", owner, repo, page };
  }

  if (segs[2] === "actions") {
    return { kind: "repo-actions", owner, repo, query: search };
  }

  if (segs[2] === "pulse") {
    return { kind: "repo-pulse", owner, repo };
  }

  if (segs[2] === "graphs" && segs.length >= 4) {
    const sub = segs[3]!;
    if (sub === "contributors" || sub === "commit-activity" || sub === "code-frequency" || sub === "traffic") {
      return { kind: "repo-graphs", owner, repo, subkind: sub };
    }
  }

  if (segs[2] === "projects") {
    return { kind: "repo-projects", owner, repo, query: search };
  }

  if (segs[2] === "security") {
    const sub = segs[3];
    return { kind: "repo-security", owner, repo, subkind: sub === "advisories" ? "advisories" : "overview" };
  }

  return { kind: "repo-other", owner, repo };
}

const COVERED_REPO_KINDS = new Set<Route["kind"]>([
  "repo-home",
  "repo-tree",
  "repo-blob",
  "repo-commits",
  "repo-commit",
  "repo-compare",
  "repo-issues",
  "repo-issue",
  "repo-wiki",
  "repo-actions",
  "repo-pulse",
  "repo-graphs",
  "repo-projects",
  "repo-security",
]);

export function isCovered(pathname: string): boolean {
  const route = resolveRoute(pathname, "");
  return COVERED_REPO_KINDS.has(route.kind) || route.kind === "profile";
}

const COVERED_PROFILE_TABS = new Set<ProfileTab>(["overview", "repositories", "stars", "followers", "following", "achievements", "projects", "packages", "sponsoring"]);

export function isFullyCoveredUrl(pathname: string, search: string): boolean {
  const route = resolveRoute(pathname, search);
  if (route.kind === "profile") {
    return COVERED_PROFILE_TABS.has(route.tab);
  }
  if (route.kind === "top-level") return true;
  return COVERED_REPO_KINDS.has(route.kind);
}

function matchTopLevel(first: string, pathname: string, search: string): Route | null {
  switch (first) {
    case "notifications": return { kind: "top-level", subkind: "notifications", pathname, search, title: "Notifications" };
    case "search": return { kind: "top-level", subkind: "search", pathname, search, title: "Search" };
    case "issues": return { kind: "top-level", subkind: "issues", pathname, search, title: "Your issues" };
    case "pulls": return { kind: "top-level", subkind: "pulls", pathname, search, title: "Your pull requests" };
    case "stars": return { kind: "top-level", subkind: "stars", pathname, search, title: "Your stars" };
    case "explore": return { kind: "top-level", subkind: "explore", pathname, search, title: "Explore" };
    case "trending": return { kind: "top-level", subkind: "trending", pathname, search, title: "Trending" };
    case "watching": return { kind: "top-level", subkind: "watching", pathname, search, title: "Watching" };
    default: return null;
  }
}

function parseProfileTab(search: string): ProfileTab {
  const params = new URLSearchParams(search);
  const t = params.get("tab");
  switch (t) {
    case "repositories":
    case "stars":
    case "followers":
    case "following":
    case "achievements":
    case "projects":
    case "packages":
    case "sponsoring":
      return t;
    default:
      return "overview";
  }
}
