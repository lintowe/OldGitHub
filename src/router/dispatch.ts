import { AdapterFailure } from "@/adapters";
import { mountRepoHeader, unmountRepoHeader, updateActiveTab } from "@/views/repo-header";
import { mountRepoHome, unmountRepoHome } from "@/views/repo-home";
import { mountRepoTree, unmountRepoTree } from "@/views/repo-tree";
import { mountRepoBlob, unmountRepoBlob } from "@/views/repo-blob";
import { mountRepoCommits, unmountRepoCommits } from "@/views/repo-commits";
import { mountRepoCommit, unmountRepoCommit } from "@/views/repo-commit";
import { mountRepoCompare, unmountRepoCompare } from "@/views/repo-compare";
import { mountRepoIssues, unmountRepoIssues } from "@/views/repo-issues";
import { mountRepoIssue, unmountRepoIssue } from "@/views/repo-issue";
import { mountRepoWiki, unmountRepoWiki } from "@/views/repo-wiki";
import { mountRepoActions, unmountRepoActions } from "@/views/repo-actions";
import { mountRepoSection, unmountRepoSection } from "@/views/repo-section";
import { mountRepoPulse, unmountRepoPulse } from "@/views/repo-pulse";
import { mountRepoGraphs, unmountRepoGraphs } from "@/views/repo-graphs";
import { mountRepoReleases, unmountRepoReleases } from "@/views/repo-releases";
import { mountRepoList, unmountRepoList, type RepoListKind } from "@/views/repo-lists";
import { mountTopLevel, unmountTopLevel, type TopLevelKind } from "@/views/top-level";
import { mountDashboard, unmountDashboard } from "@/views/dashboard";
import { mountNotifications, unmountNotifications } from "@/views/notifications";
import { mountSearch, unmountSearch } from "@/views/search";
import { mountStars, unmountStars } from "@/views/stars";
import { mountTrending, unmountTrending } from "@/views/trending";
import { mountProfile, unmountProfile } from "@/views/profile";
import { removeAllBodyRoots } from "@/views/_body";
import { resolveRoute, type Route } from "./resolve";

const MOUNTED_ATTR = "data-oldgh-mounted";

type RepoKey = { owner: string; repo: string };

type BodyState =
  | { kind: "none" }
  | { kind: "home"; owner: string; repo: string }
  | { kind: "tree"; owner: string; repo: string; refAndPath: string }
  | { kind: "blob"; owner: string; repo: string; refAndPath: string }
  | { kind: "commits"; owner: string; repo: string; refAndPath: string; query: string }
  | { kind: "commit"; owner: string; repo: string; sha: string }
  | { kind: "compare"; owner: string; repo: string; range: string }
  | { kind: "issues"; owner: string; repo: string; query: string; subkind: "issues" | "pulls" }
  | { kind: "issue"; owner: string; repo: string; number: number; subkind: "issue" | "pull"; tab: "conversation" | "files" | "commits" | "checks" }
  | { kind: "wiki"; owner: string; repo: string; page: string }
  | { kind: "actions"; owner: string; repo: string; query: string }
  | { kind: "pulse"; owner: string; repo: string }
  | { kind: "graphs"; owner: string; repo: string; subkind: "contributors" | "commit-activity" | "code-frequency" | "traffic" }
  | { kind: "projects"; owner: string; repo: string; query: string }
  | { kind: "security"; owner: string; repo: string; subkind: "overview" | "advisories" }
  | { kind: "discussions"; owner: string; repo: string; subPath: string; query: string }
  | { kind: "repo-other"; owner: string; repo: string; pathname: string; search: string; title: string }
  | { kind: "top-level"; subkind: TopLevelKind; pathname: string; search: string; title: string }
  | { kind: "profile"; login: string; tab: string; query: string };

let mountedRepo: RepoKey | null = null;
let bodyState: BodyState = { kind: "none" };

export async function dispatchRoute(loc: Location | URL): Promise<void> {
  const pathname = currentPath(loc);
  const search = currentSearch(loc);
  const route = resolveRoute(pathname, search);

  void chrome.runtime.sendMessage({ type: "oldgh:route-change", pathname, search });

  const willMount = route.kind !== "out-of-scope" && route.kind !== "todo";
  if (willMount) {
    document.documentElement.setAttribute(MOUNTED_ATTR, route.kind);
  }

  try {
    if (route.kind === "out-of-scope") {
      await applyBodyState({ kind: "none" });
      teardownRepoHeader();
      clearMounted();
      return;
    }

    if (
      route.kind === "repo-home" ||
      route.kind === "repo-tree" ||
      route.kind === "repo-blob" ||
      route.kind === "repo-commits" ||
      route.kind === "repo-commit" ||
      route.kind === "repo-compare" ||
      route.kind === "repo-issues" ||
      route.kind === "repo-issue" ||
      route.kind === "repo-wiki" ||
      route.kind === "repo-actions" ||
      route.kind === "repo-pulse" ||
      route.kind === "repo-graphs" ||
      route.kind === "repo-projects" ||
      route.kind === "repo-security" ||
      route.kind === "repo-discussions" ||
      route.kind === "repo-other"
    ) {
      await ensureRepoHeader(route.owner, route.repo, pathname);
      await applyBodyState(targetBodyForRoute(route));
      return;
    }

    if (route.kind === "profile") {
      teardownRepoHeader();
      await applyBodyState({ kind: "profile", login: route.login, tab: route.tab, query: route.query });
      return;
    }

    if (route.kind === "top-level") {
      teardownRepoHeader();
      await applyBodyState({ kind: "top-level", subkind: route.subkind, pathname: route.pathname, search: route.search, title: route.title });
      return;
    }

    await applyBodyState({ kind: "none" });
    teardownRepoHeader();
    clearMounted();
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] dispatch adapter failure:", err.name, err.message);
      await applyBodyState({ kind: "none" });
      teardownRepoHeader();
      clearMounted();
      return;
    }
    throw err;
  }
}

function clearMounted(): void {
  document.documentElement.removeAttribute(MOUNTED_ATTR);
  removeAllBodyRoots();
}

function targetBodyForRoute(route: Route): BodyState {
  if (route.kind === "repo-home") return { kind: "home", owner: route.owner, repo: route.repo };
  if (route.kind === "repo-tree") return { kind: "tree", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath };
  if (route.kind === "repo-blob") return { kind: "blob", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath };
  if (route.kind === "repo-commits") return { kind: "commits", owner: route.owner, repo: route.repo, refAndPath: route.refAndPath, query: route.query };
  if (route.kind === "repo-commit") return { kind: "commit", owner: route.owner, repo: route.repo, sha: route.sha };
  if (route.kind === "repo-compare") return { kind: "compare", owner: route.owner, repo: route.repo, range: route.range };
  if (route.kind === "repo-issues") return { kind: "issues", owner: route.owner, repo: route.repo, query: route.query, subkind: route.subkind };
  if (route.kind === "repo-issue") return { kind: "issue", owner: route.owner, repo: route.repo, number: route.number, subkind: route.subkind, tab: route.tab };
  if (route.kind === "repo-wiki") return { kind: "wiki", owner: route.owner, repo: route.repo, page: route.page };
  if (route.kind === "repo-actions") return { kind: "actions", owner: route.owner, repo: route.repo, query: route.query };
  if (route.kind === "repo-pulse") return { kind: "pulse", owner: route.owner, repo: route.repo };
  if (route.kind === "repo-graphs") return { kind: "graphs", owner: route.owner, repo: route.repo, subkind: route.subkind };
  if (route.kind === "repo-projects") return { kind: "projects", owner: route.owner, repo: route.repo, query: route.query };
  if (route.kind === "repo-security") return { kind: "security", owner: route.owner, repo: route.repo, subkind: route.subkind };
  if (route.kind === "repo-discussions") return { kind: "discussions", owner: route.owner, repo: route.repo, subPath: route.subPath, query: route.query };
  if (route.kind === "repo-other") {
    const path = repoOtherPath(route.owner, route.repo);
    return { kind: "repo-other", owner: route.owner, repo: route.repo, pathname: path.pathname, search: path.search, title: path.title };
  }
  return { kind: "none" };
}

function matchRepoList(subPath: string): RepoListKind | null {
  const seg = subPath.replace(/^\//, "").split(/[\/?]/)[0];
  if (seg === "tags" || seg === "branches" || seg === "forks" || seg === "stargazers" || seg === "labels" || seg === "milestones") {
    return seg as RepoListKind;
  }
  return null;
}

function repoOtherPath(owner: string, repo: string): { pathname: string; search: string; title: string } {
  const pathname = window.location.pathname;
  const search = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
  const prefix = `/${owner}/${repo}/`;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const first = rest.split("/")[0] || "Other";
  const title = first.charAt(0).toUpperCase() + first.slice(1);
  return { pathname, search, title };
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
  if (target.kind === "none") {
    unmountBody();
    bodyState = { kind: "none" };
    return;
  }
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
  if (target.kind === "issues") {
    await mountRepoIssues(target.owner, target.repo, target.query, target.subkind);
    bodyState = target;
    return;
  }
  if (target.kind === "issue") {
    await mountRepoIssue(target.owner, target.repo, target.number, target.subkind, target.tab);
    bodyState = target;
    return;
  }
  if (target.kind === "wiki") {
    await mountRepoWiki(target.owner, target.repo, target.page);
    bodyState = target;
    return;
  }
  if (target.kind === "actions") {
    await mountRepoActions(target.owner, target.repo, target.query);
    bodyState = target;
    return;
  }
  if (target.kind === "pulse") {
    await mountRepoPulse(target.owner, target.repo);
    bodyState = target;
    return;
  }
  if (target.kind === "graphs") {
    await mountRepoGraphs(target.owner, target.repo, target.subkind);
    bodyState = target;
    return;
  }
  if (target.kind === "projects") {
    const subPath = `/projects${target.query ? "?" + target.query : ""}`;
    await mountRepoSection(target.owner, target.repo, "projects", subPath, "Projects");
    bodyState = target;
    return;
  }
  if (target.kind === "security") {
    const subPath = target.subkind === "advisories" ? "/security/advisories" : "/security";
    await mountRepoSection(target.owner, target.repo, "security", subPath, "Security");
    bodyState = target;
    return;
  }
  if (target.kind === "discussions") {
    const subPath = target.subPath + (target.query ? "?" + target.query : "");
    await mountRepoSection(target.owner, target.repo, "discussions", subPath, "Discussions");
    bodyState = target;
    return;
  }
  if (target.kind === "repo-other") {
    const prefix = `/${target.owner}/${target.repo}`;
    const subPath = target.pathname.startsWith(prefix) ? target.pathname.slice(prefix.length) : target.pathname;
    if (subPath === "/releases" || subPath.startsWith("/releases?") || subPath === "/releases/" || subPath.startsWith("/releases/latest")) {
      await mountRepoReleases(target.owner, target.repo, target.search);
      bodyState = target;
      return;
    }
    const listMatch = matchRepoList(subPath);
    if (listMatch) {
      await mountRepoList(target.owner, target.repo, listMatch, target.search);
      bodyState = target;
      return;
    }
    const full = subPath + (target.search ? "?" + target.search : "");
    await mountRepoSection(target.owner, target.repo, "other", full || "/", target.title);
    bodyState = target;
    return;
  }
  if (target.kind === "profile") {
    await mountProfile(target.login, target.tab, target.query);
    bodyState = target;
    return;
  }
  if (target.kind === "top-level") {
    if (target.subkind === "dashboard") {
      await mountDashboard();
    } else if (target.subkind === "notifications") {
      await mountNotifications(target.search);
    } else if (target.subkind === "search") {
      await mountSearch(target.pathname, target.search);
    } else if (target.subkind === "stars") {
      await mountStars(target.pathname, target.search);
    } else if (target.subkind === "trending") {
      await mountTrending(target.pathname, target.search);
    } else {
      await mountTopLevel(target.subkind, target.pathname, target.search, target.title);
    }
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
  if (a.kind === "issues" && b.kind === "issues") {
    return a.owner === b.owner && a.repo === b.repo && a.query === b.query && a.subkind === b.subkind;
  }
  if (a.kind === "issue" && b.kind === "issue") {
    return a.owner === b.owner && a.repo === b.repo && a.number === b.number && a.subkind === b.subkind && a.tab === b.tab;
  }
  if (a.kind === "wiki" && b.kind === "wiki") {
    return a.owner === b.owner && a.repo === b.repo && a.page === b.page;
  }
  if (a.kind === "actions" && b.kind === "actions") {
    return a.owner === b.owner && a.repo === b.repo && a.query === b.query;
  }
  if (a.kind === "pulse" && b.kind === "pulse") {
    return a.owner === b.owner && a.repo === b.repo;
  }
  if (a.kind === "graphs" && b.kind === "graphs") {
    return a.owner === b.owner && a.repo === b.repo && a.subkind === b.subkind;
  }
  if (a.kind === "projects" && b.kind === "projects") {
    return a.owner === b.owner && a.repo === b.repo && a.query === b.query;
  }
  if (a.kind === "security" && b.kind === "security") {
    return a.owner === b.owner && a.repo === b.repo && a.subkind === b.subkind;
  }
  if (a.kind === "discussions" && b.kind === "discussions") {
    return a.owner === b.owner && a.repo === b.repo && a.subPath === b.subPath && a.query === b.query;
  }
  if (a.kind === "repo-other" && b.kind === "repo-other") {
    return a.owner === b.owner && a.repo === b.repo && a.pathname === b.pathname && a.search === b.search;
  }
  if (a.kind === "profile" && b.kind === "profile") {
    return a.login === b.login && a.tab === b.tab && a.query === b.query;
  }
  if (a.kind === "top-level" && b.kind === "top-level") {
    return a.subkind === b.subkind && a.pathname === b.pathname && a.search === b.search;
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
  unmountRepoIssues();
  unmountRepoIssue();
  unmountRepoWiki();
  unmountRepoActions();
  unmountRepoSection();
  unmountRepoPulse();
  unmountRepoGraphs();
  unmountRepoReleases();
  unmountRepoList();
  unmountTopLevel();
  unmountDashboard();
  unmountNotifications();
  unmountSearch();
  unmountStars();
  unmountTrending();
  unmountProfile();
}

function currentPath(loc: Location | URL): string {
  return "pathname" in loc ? loc.pathname : new URL(String(loc)).pathname;
}

function currentSearch(loc: Location | URL): string {
  const raw = "search" in loc ? loc.search : new URL(String(loc)).search;
  return raw.startsWith("?") ? raw.slice(1) : raw;
}
