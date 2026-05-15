export type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo-home"; owner: string; repo: string }
  | { kind: "repo-tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "repo-commit"; owner: string; repo: string; sha: string }
  | { kind: "repo-compare"; owner: string; repo: string; range: string }
  | { kind: "repo-other"; owner: string; repo: string }
  | { kind: "profile"; login: string; tab: ProfileTab; query: string }
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
    return { kind: "todo", name: "dashboard" };
  }

  const first = segs[0]!;
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

  return { kind: "repo-other", owner, repo };
}

export function isCovered(pathname: string): boolean {
  const route = resolveRoute(pathname, "");
  return (
    route.kind === "repo-home" ||
    route.kind === "repo-tree" ||
    route.kind === "repo-blob" ||
    route.kind === "repo-commits" ||
    route.kind === "repo-commit" ||
    route.kind === "repo-compare" ||
    route.kind === "profile"
  );
}

const COVERED_PROFILE_TABS = new Set<ProfileTab>(["overview", "repositories"]);

export function isFullyCoveredUrl(pathname: string, search: string): boolean {
  const route = resolveRoute(pathname, search);
  if (route.kind === "profile") {
    return COVERED_PROFILE_TABS.has(route.tab);
  }
  return (
    route.kind === "repo-home" ||
    route.kind === "repo-tree" ||
    route.kind === "repo-blob" ||
    route.kind === "repo-commits" ||
    route.kind === "repo-commit" ||
    route.kind === "repo-compare"
  );
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
