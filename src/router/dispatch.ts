import { AdapterFailure } from "@/adapters";
import { mountRepoHeader, unmountRepoHeader, updateActiveTab } from "@/views/repo-header";

type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo"; owner: string; repo: string }
  | { kind: "profile"; login: string }
  | { kind: "todo"; name: string };

type RepoKey = { owner: string; repo: string };

let mountedRepo: RepoKey | null = null;

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

export async function dispatchRoute(loc: Location | URL): Promise<void> {
  const route = resolveRoute(loc);

  try {
    if (route.kind === "out-of-scope") {
      teardownAll();
      return;
    }

    if (route.kind === "repo") {
      if (!mountedRepo || mountedRepo.owner !== route.owner || mountedRepo.repo !== route.repo) {
        await mountRepoHeader(route.owner, route.repo);
        mountedRepo = { owner: route.owner, repo: route.repo };
      } else {
        updateActiveTab(route.owner, route.repo, currentPath(loc));
      }
      return;
    }

    if (mountedRepo) {
      unmountRepoHeader();
      mountedRepo = null;
    }
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] dispatch adapter failure:", err.name, err.message);
      if (mountedRepo) {
        unmountRepoHeader();
        mountedRepo = null;
      }
      return;
    }
    throw err;
  }
}

function teardownAll(): void {
  if (mountedRepo) {
    unmountRepoHeader();
    mountedRepo = null;
  }
}

function currentPath(loc: Location | URL): string {
  return "pathname" in loc ? loc.pathname : new URL(String(loc)).pathname;
}

function resolveRoute(loc: Location | URL): Route {
  const pathname = currentPath(loc);

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
    return { kind: "profile", login: first };
  }

  return { kind: "repo", owner: first, repo: segs[1]! };
}
