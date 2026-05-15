import { AdapterFailure } from "@/adapters";
import { mountRepoHeader, unmountRepoHeader, updateActiveTab } from "@/views/repo-header";
import { mountRepoHome, unmountRepoHome } from "@/views/repo-home";
import { mountRepoTree, unmountRepoTree } from "@/views/repo-tree";
import { mountRepoBlob, unmountRepoBlob } from "@/views/repo-blob";
import { mountRepoCommits, unmountRepoCommits } from "@/views/repo-commits";
import { mountRepoCommit, unmountRepoCommit } from "@/views/repo-commit";
import { mountRepoCompare, unmountRepoCompare } from "@/views/repo-compare";
import { resolveRoute, type Route } from "./resolve";

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

export async function dispatchRoute(loc: Location | URL): Promise<void> {
  const pathname = currentPath(loc);
  const search = currentSearch(loc);
  const route = resolveRoute(pathname, search);

  void chrome.runtime.sendMessage({ type: "oldgh:route-change", pathname });

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
      await ensureRepoHeader(route.owner, route.repo, pathname);
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
