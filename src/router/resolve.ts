export type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo-home"; owner: string; repo: string }
  | { kind: "repo-tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "repo-commit"; owner: string; repo: string; sha: string }
  | { kind: "repo-compare"; owner: string; repo: string; range: string }
  | { kind: "repo-issues"; owner: string; repo: string; query: string; subkind: "issues" | "pulls" }
  | { kind: "repo-issue"; owner: string; repo: string; number: number; subkind: "issue" | "pull"; tab: "conversation" | "files" | "commits" | "checks" }
  | { kind: "repo-wiki"; owner: string; repo: string; page: string }
  | { kind: "repo-actions"; owner: string; repo: string; query: string; workflowPath?: string }
  | { kind: "repo-actions-run"; owner: string; repo: string; runId: string }
  | { kind: "repo-pulse"; owner: string; repo: string }
  | { kind: "repo-graphs"; owner: string; repo: string; subkind: "contributors" | "commit-activity" | "code-frequency" | "traffic" | "community" | "network" }
  | { kind: "repo-projects"; owner: string; repo: string; query: string }
  | { kind: "repo-security"; owner: string; repo: string; subkind: "overview" | "advisories" }
  | { kind: "repo-discussions"; owner: string; repo: string; subPath: string; query: string }
  | { kind: "repo-discussion"; owner: string; repo: string; number: number }
  | { kind: "repo-other"; owner: string; repo: string }
  | { kind: "profile"; login: string; tab: ProfileTab; query: string }
  | { kind: "top-level"; subkind: "dashboard" | "notifications" | "search" | "issues" | "pulls" | "stars" | "explore" | "trending" | "watching" | "marketplace" | "settings" | "topic" | "topics" | "collections" | "sponsors" | "other"; pathname: string; search: string; title: string }
  | { kind: "todo"; name: string };

export type ProfileTab = "overview" | "repositories" | "stars" | "followers" | "following" | "achievements" | "projects" | "packages" | "sponsoring" | "people";

const OUT_OF_SCOPE_PREFIXES = [
  // auth flows — must be native
  "/login",
  "/logout",
  "/join",
  "/signup",
  "/session",
  "/password_reset",
  // app flows
  "/codespaces",
  "/sponsors",
  "/enterprises",
  "/settings",
  "/account",
  "/organizations/new",
  "/new",
  "/import",
];

const OUT_OF_SCOPE_REPO_SUFFIXES = [
  "/settings",
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
  // Intercept /sponsors/explore before the out-of-scope check below catches /sponsors/*.
  if (pathname === "/sponsors/explore" || pathname.startsWith("/sponsors/explore?") || pathname.startsWith("/sponsors/explore/")) {
    return { kind: "top-level", subkind: "sponsors", pathname, search, title: "Sponsors" };
  }
  // Intercept individual sponsor profile pages — render them in the 2013 frame instead of falling through to native.
  if (pathname.startsWith("/sponsors/") && !pathname.startsWith("/sponsors/explore")) {
    return { kind: "top-level", subkind: "other", pathname, search, title: "Sponsors" };
  }
  for (const prefix of OUT_OF_SCOPE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return { kind: "out-of-scope" };
    }
  }
  for (const suffix of OUT_OF_SCOPE_REPO_SUFFIXES) {
    if (pathname.endsWith(suffix) || pathname.includes(suffix + "/")) {
      const segs = pathname.split("/").filter(Boolean);
      if (segs.length >= 3 && !TOP_LEVEL_NON_REPO.has(segs[0]!)) {
        const segIdx = segs.indexOf(suffix.replace(/^\//, ""));
        if (segIdx === 2) return { kind: "out-of-scope" };
      }
    }
  }

  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) {
    return { kind: "top-level", subkind: "dashboard", pathname, search, title: "Dashboard" };
  }

  const first = segs[0]!;
  const topLevel = matchTopLevel(first, pathname, search);
  if (topLevel) return topLevel;

  if (first === "topics" && segs.length >= 2) {
    return { kind: "top-level", subkind: "topic", pathname, search, title: `Topic: ${segs[1]}` };
  }
  if (first === "topics" && segs.length === 1) {
    return { kind: "top-level", subkind: "topics", pathname, search, title: "Topics" };
  }
  if (first === "collections") {
    return { kind: "top-level", subkind: "collections", pathname, search, title: segs[1] ? `Collection: ${segs[1]}` : "Collections" };
  }
  if (TOP_LEVEL_NON_REPO.has(first)) {
    return { kind: "top-level", subkind: "other", pathname, search, title: prettyTitleFromPath(pathname) };
  }

  if (segs.length === 1) {
    return { kind: "profile", login: first, tab: parseProfileTab(search), query: search };
  }

  const owner = first;
  const repo = segs[1]!;
  if (segs.length === 2) {
    return { kind: "repo-home", owner, repo };
  }

  // Pass-through routes: forms, creation flows, and file downloads that GitHub handles natively.
  if (
    (segs[2] === "issues" && segs[3] === "new") ||
    (segs[2] === "discussions" && segs[3] === "new") ||
    (segs[2] === "compare" && segs[3] === "new") ||
    (segs[2] === "compare" && segs.length === 3) ||
    (segs[2] === "releases" && segs[3] === "download") ||
    segs[2] === "settings" ||
    segs[2] === "fork" ||
    segs[2] === "subscription" ||
    segs[2] === "find" ||
    segs[2] === "edit" ||
    segs[2] === "new" ||
    segs[2] === "delete" ||
    segs[2] === "merge_queue" ||
    segs[2] === "deployments" ||
    segs[2] === "archive"
  ) {
    return { kind: "out-of-scope" };
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

  if (segs[2] === "milestone" && segs.length >= 4) {
    // /owner/repo/milestone/N — redirect to issues list filtered by milestone
    const ms = segs[3]!;
    const milestoneSearch = search ? `milestone=${ms}&${search}` : `milestone=${ms}`;
    return { kind: "repo-issues", owner, repo, query: milestoneSearch, subkind: "issues" };
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
      const sub = segs[4];
      const tab: "conversation" | "files" | "commits" | "checks" =
        sub === "files" || sub === "changes" ? "files"
          : sub === "commits" ? "commits"
          : sub === "checks" ? "checks"
          : "conversation";
      return {
        kind: "repo-issue",
        owner,
        repo,
        number: num,
        subkind: segs[2] === "pull" ? "pull" : "issue",
        tab,
      };
    }
  }

  if (segs[2] === "wiki") {
    const page = segs.slice(3).join("/") || "Home";
    return { kind: "repo-wiki", owner, repo, page };
  }

  if (segs[2] === "actions") {
    if (segs[3] === "runs" && segs.length >= 5) {
      const id = segs[4]!;
      if (/^\d+$/.test(id)) {
        return { kind: "repo-actions-run", owner, repo, runId: id };
      }
    }
    if (segs[3] === "workflows" && segs.length >= 5) {
      const workflowPath = segs.slice(4).join("/");
      return { kind: "repo-actions", owner, repo, query: search, workflowPath };
    }
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

  if (segs[2] === "community") {
    return { kind: "repo-graphs", owner, repo, subkind: "community" };
  }

  if (segs[2] === "network" && segs.length > 3) {
    // /owner/repo/network/dependencies and similar sub-pages — pass through to native GitHub
    return { kind: "out-of-scope" };
  }
  if (segs[2] === "network") {
    return { kind: "repo-graphs", owner, repo, subkind: "network" };
  }

  if (segs[2] === "projects") {
    return { kind: "repo-projects", owner, repo, query: search };
  }

  if (segs[2] === "security") {
    const sub = segs[3];
    return { kind: "repo-security", owner, repo, subkind: sub === "advisories" ? "advisories" : "overview" };
  }

  if (segs[2] === "discussions") {
    if (segs.length >= 4) {
      const num = parseInt(segs[3]!, 10);
      if (!Number.isNaN(num)) {
        return { kind: "repo-discussion", owner, repo, number: num };
      }
    }
    const subPath = "/" + segs.slice(2).join("/");
    return { kind: "repo-discussions", owner, repo, subPath, query: search };
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
  "repo-discussions",
  "repo-discussion",
  "repo-wiki",
  "repo-actions",
  "repo-actions-run",
  "repo-pulse",
  "repo-graphs",
  "repo-projects",
  "repo-security",
]);

export function isCovered(pathname: string): boolean {
  const route = resolveRoute(pathname, "");
  return COVERED_REPO_KINDS.has(route.kind) || route.kind === "profile";
}

const COVERED_PROFILE_TABS = new Set<ProfileTab>(["overview", "repositories", "stars", "followers", "following", "achievements", "projects", "packages", "sponsoring", "people"]);

export function isFullyCoveredUrl(pathname: string, search: string): boolean {
  const route = resolveRoute(pathname, search);
  if (route.kind === "profile") {
    return COVERED_PROFILE_TABS.has(route.tab);
  }
  if (route.kind === "top-level") return true;
  return COVERED_REPO_KINDS.has(route.kind);
}

function prettyTitleFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function matchTopLevel(first: string, pathname: string, search: string): Route | null {
  switch (first) {
    case "dashboard":
    case "home":
    case "feed": return { kind: "top-level", subkind: "dashboard", pathname, search, title: "Dashboard" };
    case "notifications": return { kind: "top-level", subkind: "notifications", pathname, search, title: "Notifications" };
    case "search": return { kind: "top-level", subkind: "search", pathname, search, title: "Search" };
    case "issues": return { kind: "top-level", subkind: "issues", pathname, search, title: "Your issues" };
    case "pulls": return { kind: "top-level", subkind: "pulls", pathname, search, title: "Your pull requests" };
    case "stars": return { kind: "top-level", subkind: "stars", pathname, search, title: "Your stars" };
    case "explore": return { kind: "top-level", subkind: "explore", pathname, search, title: "Explore" };
    case "trending": return { kind: "top-level", subkind: "trending", pathname, search, title: "Trending" };
    case "watching": return { kind: "top-level", subkind: "watching", pathname, search, title: "Watching" };
    case "marketplace": return { kind: "top-level", subkind: "marketplace", pathname, search, title: "Marketplace" };
    case "settings": return { kind: "top-level", subkind: "settings", pathname, search, title: "Settings" };
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
    case "people":
      return t;
    default:
      return "overview";
  }
}
