import { AdapterFailure } from "@/adapters";
import { mountRepoHeader, unmountRepoHeader, updateActiveTab } from "@/views/repo-header";
import { mountRepoHome, unmountRepoHome } from "@/views/repo-home";
import { mountRepoTree, unmountRepoTree } from "@/views/repo-tree";
import { mountRepoBlob, unmountRepoBlob } from "@/views/repo-blob";
import { mountRepoCommits, unmountRepoCommits } from "@/views/repo-commits";
import { mountRepoCommit, unmountRepoCommit } from "@/views/repo-commit";
import { mountRepoCompare, unmountRepoCompare } from "@/views/repo-compare";

type Route =
  | { kind: "out-of-scope" }
  | { kind: "repo-home"; owner: string; repo: string }
  | { kind: "repo-tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "repo-commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "repo-commit"; owner: string; repo: string; sha: string }
  | { kind: "repo-compare"; owner: string; repo: string; range: string }
  | { kind: "repo-other"; owner: string; repo: string }
  | { kind: "profile"; login: string }
  | { kind: "todo"; name: string };

type RepoKey = { owner: string; repo: string };

type BodyState =
  | { kind: "none" }
  | { kind: "home"; owner: string; repo: string }
  | { kind: "tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "commit"; owner: string; repo: string; sha: string }
  | { kind: "compare"; owner: string; repo: string; range: string };

let mountedRepo: RepoKey | null = null;
let bodyState: BodyState = { kind: "none" };

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
      await applyBodyState({ kind: "none" });
      teardownRepoHeader();
      return;
    }

    if (
      route.kind === "repo-home" ||
      route.kind === "repo-tree" ||
      route.kind === "repo-blob" ||
      route.kind === "repo-commits" ||
      route.kind === "repo-commit" ||
      route.kind === "repo-compare" ||
      route.kind === "repo-other"
    ) {
      await ensureRepoHeader(route.owner, route.repo, currentPath(loc));
      await applyBodyState(targetBodyForRoute(route));
      return;
    }

    await applyBodyState({ kind: "none" });
    teardownRepoHeader();
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] dispatch adapter failure:", err.name, err.message);
      await applyBodyState({ kind: "none" });
      teardownRepoHeader();
      return;
    }
    throw err;
  }
}

function targetBodyForRoute(
  route: Extract<Route, { kind: "repo-home" | "repo-tree" | "repo-blob" | "repo-commits" | "repo-commit" | "repo-compare" | "repo-other" }>,
): BodyState {
  if (route.kind === "repo-home") return { kind: "home", owner: route.owner, repo: route.repo };
  if (route.kind === "repo-tree") return { kind: "tree", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath };
  if (route.kind === "repo-blob") return { kind: "blob", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath };
  if (route.kind === "repo-commits") return { kind: "commits", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath, query: route.query };
  if (route.kind === "repo-commit") return { kind: "commit", owner: route.owner, repo: route.repo, sha: route.sha };
  if (route.kind === "repo-compare") return { kind: "compare", owner: route.owner, repo: route.repo, range: route.range };
  return { kind: "none" };
}

async function ensureRepoHeader(owner: string, repo: string, pathname: string): Promise<void> {
  if (!mountedRepo || mountedRepo.owner !== owner || mountedRepo.repo !== repo) {
    await mountRepoHeader(owner, repo);
    mountedRepo = { owner, repo };
  } else {
    updateActiveTab(owner, repo, pathname);
  }
}

function teardownRepoHeader(): void {
  if (mountedRepo) {
    unmountRepoHeader();
    mountedRepo = null;
  }
}

async function applyBodyState(target: BodyState): Promise<void> {
  if (sameBody(bodyState, target)) return;
  unmountBody();
  bodyState = { kind: "none" };
  if (target.kind === "home") {
    await mountRepoHome(target.owner, target.repo);
    bodyState = target;
    return;
  }
  if (target.kind === "tree") {
    await mountRepoTree(target.owner, target.repo, target.refAndPath);
    bodyState = target;
    return;
  }
  if (target.kind === "blob") {
    await mountRepoBlob(target.owner, target.repo, target.refAndPath);
    bodyState = target;
    return;
  }
  if (target.kind === "commits") {
    await mountRepoCommits(target.owner, target.repo, target.refAndPath, target.query);
    bodyState = target;
    return;
  }
  if (target.kind === "commit") {
    await mountRepoCommit(target.owner, target.repo, target.sha);
    bodyState = target;
    return;
  }
  if (target.kind === "compare") {
    await mountRepoCompare(target.owner, target.repo, target.range);
    bodyState = target;
    return;
  }
}

function sameBody(a: BodyState, b: BodyState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "home" && b.kind === "home") {
    return a.owner === b.owner && a.repo === b.repo;
  }
  if (a.kind === "tree" && b.kind === "tree") {
    return a.owner === b.owner && a.repo === b.repo && a.refAndPath === b.refAndPath;
  }
  if (a.kind === "blob" && b.kind === "blob") {
    return a.owner === b.owner && a.repo === b.repo && a.refAndPath === b.refAndPath;
  }
  if (a.kind === "commits" && b.kind === "commits") {
    return a.owner === b.owner && a.repo === b.repo && a.refAndPath === b.refAndPath && a.query === b.query;
  }
  if (a.kind === "commit" && b.kind === "commit") {
    return a.owner === b.owner && a.repo === b.repo && a.sha === b.sha;
  }
  if (a.kind === "compare" && b.kind === "compare") {
    return a.owner === b.owner && a.repo === b.repo && a.range === b.range;
  }
  return a.kind === "none" && b.kind === "none";
}

function unmountBody(): void {
  unmountRepoHome();
  unmountRepoTree();
  unmountRepoBlob();
  unmountRepoCommits();
  unmountRepoCommit();
  unmountRepoCompare();
}

function currentPath(loc: Location | URL): string {
  return "pathname" in loc ? loc.pathname : new URL(String(loc)).pathname;
}

function currentSearch(loc: Location | URL): string {
  const raw = "search" in loc ? loc.search : new URL(String(loc)).search;
  return raw.startsWith("?") ? raw.slice(1) : raw;
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
    return { kind: "repo-commits", owner, repo, refAndPath, query: currentSearch(loc) };
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
