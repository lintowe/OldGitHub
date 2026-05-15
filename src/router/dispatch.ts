import { AdapterFailure } from "@/adapters";
import { mountRepoHeader, unmountRepoHeader, updateActiveTab } from "@/views/repo-header";
import { mountRepoHome, unmountRepoHome } from "@/views/repo-home";

type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo-home"; owner: string; repo: string }
  | { kind: "repo-subpath"; owner: string; repo: string; subpath: string }
  | { kind: "profile"; login: string }
  | { kind: "todo"; name: string };

type RepoKey = { owner: string; repo: string };

let mountedRepo: RepoKey | null = null;
let mountedHome = false;

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

    if (route.kind === "repo-home" || route.kind === "repo-subpath") {
      await ensureRepoMounted(route.owner, route.repo, currentPath(loc));
      if (route.kind === "repo-home") {
        if (!mountedHome) {
          await mountRepoHome(route.owner, route.repo);
          mountedHome = true;
        }
      } else if (mountedHome) {
        unmountRepoHome();
        mountedHome = false;
      }
      return;
    }

    teardownRepo();
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] dispatch adapter failure:", err.name, err.message);
      teardownRepo();
      return;
    }
    throw err;
  }
}

async function ensureRepoMounted(owner: string, repo: string, pathname: string): Promise<void> {
  if (!mountedRepo || mountedRepo.owner !== owner || mountedRepo.repo !== repo) {
    if (mountedHome) {
      unmountRepoHome();
      mountedHome = false;
    }
    await mountRepoHeader(owner, repo);
    mountedRepo = { owner, repo };
  } else {
    updateActiveTab(owner, repo, pathname);
  }
}

function teardownRepo(): void {
  if (mountedHome) {
    unmountRepoHome();
    mountedHome = false;
  }
  if (mountedRepo) {
    unmountRepoHeader();
    mountedRepo = null;
  }
}

function teardownAll(): void {
  teardownRepo();
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

  const owner = first;
  const repo = segs[1]!;
  if (segs.length === 2) {
    return { kind: "repo-home", owner, repo };
  }
  return { kind: "repo-subpath", owner, repo, subpath: segs.slice(2).join("/") };
}
