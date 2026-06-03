import { octicon } from "@/icons";
import { AdapterFailure } from "@/adapters";
import { getRepoSummary, formatCount, type RepoSummary } from "@/adapters/repo";

const TABS = [
  { key: "code", label: "Code", path: "", icon: "code" },
  { key: "issues", label: "Issues", path: "/issues", icon: "issue-opened" },
  { key: "pulls", label: "Pull requests", path: "/pulls", icon: "git-pull-request" },
  { key: "discussions", label: "Discussions", path: "/discussions", icon: "comment-discussion" },
  { key: "actions", label: "Actions", path: "/actions", icon: "play" },
  { key: "projects", label: "Projects", path: "/projects", icon: "project" },
  { key: "wiki", label: "Wiki", path: "/wiki", icon: "book" },
  { key: "releases", label: "Releases", path: "/releases", icon: "tag" },
  { key: "security", label: "Security", path: "/security", icon: "shield" },
  { key: "insights", label: "Insights", path: "/pulse", icon: "graph" },
  { key: "settings", label: "Settings", path: "/settings", icon: "gear" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ROOT_CLASS = "oldgh-repo-header";

export async function mountRepoHeader(owner: string, repo: string, prefetched?: Promise<RepoSummary | null> | RepoSummary | null): Promise<void> {
  let summary: RepoSummary | null = null;
  try {
    summary = prefetched !== undefined ? await prefetched : await getRepoSummary(owner, repo);
  } catch (err) {
    console.debug("[oldgh] getRepoSummary failed, rendering minimal header:", err);
  }

  const header = document.createElement("div");
  header.className = ROOT_CLASS;
  header.dataset.oldghOwner = owner;
  header.dataset.oldghRepo = repo;
  header.innerHTML = summary
    ? renderRepoHeaderHtml(summary, currentTabKey(owner, repo, window.location.pathname))
    : renderMinimalHeader(owner, repo, currentTabKey(owner, repo, window.location.pathname));

  unmountRepoHeader();
  document.documentElement.setAttribute("data-oldgh-hide-modern-repo-header", "");
  const after = document.querySelector(".oldgh-header");
  if (after && after.parentNode) {
    after.after(header);
  } else {
    document.body.prepend(header);
  }
}

export function prefetchRepoSummary(owner: string, repo: string): Promise<RepoSummary | null> {
  return getRepoSummary(owner, repo).catch((err) => {
    console.debug("[oldgh] prefetchRepoSummary failed:", err);
    return null;
  });
}

function renderMinimalHeader(owner: string, repo: string, activeTab: TabKey): string {
  const minimal: RepoSummary = {
    owner,
    repo,
    nwo: `${owner}/${repo}`,
    isPrivate: false,
    isFork: false,
    isArchived: false,
    parentNwo: null,
    description: "",
    homepage: null,
    defaultBranch: "main",
    stars: null,
    forks: null,
    watchers: null,
    topics: [],
    primaryLanguage: null,
    license: null,
    hasIssues: true,
    hasWiki: true,
    hasProjects: true,
    hasDiscussions: false,
  };
  return renderRepoHeaderHtml(minimal, activeTab);
}

export function unmountRepoHeader(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-header");
}

export function updateActiveTab(owner: string, repo: string, pathname: string): void {
  const active = currentTabKey(owner, repo, pathname);
  document.querySelectorAll<HTMLAnchorElement>(".oldgh-repo-tabs__link").forEach((link) => {
    if (link.dataset.tab === active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function renderRepoHeaderHtml(s: RepoSummary, activeTab: TabKey): string {
  const repoIcon = s.isPrivate
    ? octicon("lock", { size: 18 })
    : s.isFork
      ? octicon("repo-forked", { size: 18 })
      : octicon("repo", { size: 18 });

  const forkOf = s.isFork && s.parentNwo
    ? `<div class="oldgh-repo-header__fork-of">forked from <a href="/${escapeAttr(s.parentNwo)}">${escapeText(s.parentNwo)}</a></div>`
    : "";

  const descBits: string[] = [];
  if (s.description) descBits.push(`<span class="oldgh-repo-header__description-text">${escapeText(s.description)}</span>`);
  if (s.homepage) {
    const href = /^https?:\/\//.test(s.homepage) ? s.homepage : `https://${s.homepage}`;
    descBits.push(`<a class="oldgh-repo-header__homepage" href="${escapeAttr(href)}" rel="noopener noreferrer nofollow">${octicon("link", { size: 12 })} ${escapeText(s.homepage.replace(/^https?:\/\//, ""))}</a>`);
  }
  const description = descBits.length > 0
    ? `<p class="oldgh-repo-header__description">${descBits.join(" ")}</p>`
    : "";
  const archivedBadge = s.isArchived
    ? ` <span class="oldgh-repo-header__archived" title="This repository is archived">${s.isPrivate ? "Private" : "Public"} archive</span>`
    : "";
  const archivedBanner = s.isArchived
    ? `<div class="oldgh-repo-header__archive-banner">${octicon("archive", { size: 16 })}<span>This repository has been archived by the owner. It is now read-only.</span></div>`
    : "";

  const topics = s.topics.length > 0
    ? `<p class="oldgh-repo-header__topics">${s.topics.slice(0, 12).map((t) => `<a class="oldgh-repo-header__topic" href="/topics/${escapeAttr(t)}">${escapeText(t)}</a>`).join("")}</p>`
    : "";

  const watchersText = formatCount(s.watchers);
  const starsText = formatCount(s.stars);
  const forksText = formatCount(s.forks);

  const watch = renderActionButton({
    href: `/${s.owner}/${s.repo}/subscription`,
    icon: "eye",
    label: "Watch",
    listHref: `/${s.owner}/${s.repo}/watchers`,
    count: watchersText,
  });
  const star = renderActionButton({
    href: `/${s.owner}/${s.repo}/stargazers`,
    icon: "star",
    label: "Star",
    listHref: `/${s.owner}/${s.repo}/stargazers`,
    count: starsText,
  });
  const fork = renderActionButton({
    href: `/${s.owner}/${s.repo}/fork`,
    icon: "repo-forked",
    label: "Fork",
    listHref: `/${s.owner}/${s.repo}/forks`,
    count: forksText,
  });

  return `
    <div class="oldgh-page">
      <div class="oldgh-repo-titlebar">
        <h1 class="oldgh-repo-header__title">
          <span class="oldgh-repo-header__icon">${repoIcon}</span>
          <a href="/${escapeAttr(s.owner)}">${escapeText(s.owner)}</a>
          <span class="oldgh-repo-header__slash">/</span>
          <a href="/${escapeAttr(s.owner)}/${escapeAttr(s.repo)}"><strong>${escapeText(s.repo)}</strong></a>
          ${archivedBadge}
        </h1>
        <div class="oldgh-repo-header__actions">${watch}${star}${fork}</div>
      </div>
      ${forkOf}
      ${description}
      ${topics}
      ${archivedBanner}
      <nav class="oldgh-repo-tabs" aria-label="Repository">
        <ul class="oldgh-tabs">
          ${TABS.filter((t) => isTabAvailable(s, t.key)).map((t) => renderTab(s, t, activeTab)).join("")}
        </ul>
      </nav>
    </div>
  `;
}

type ActionButton = {
  href: string;
  icon: string;
  label: string;
  listHref: string;
  count: string;
};

function renderActionButton(b: ActionButton): string {
  const icon = octicon(b.icon, { size: 14 });
  const count = b.count
    ? `<a class="oldgh-repo-header__action-count" href="${escapeAttr(b.listHref)}">${escapeText(b.count)}</a>`
    : "";
  return `
    <span class="oldgh-repo-header__action">
      <a class="oldgh-btn oldgh-repo-header__action-btn" href="${escapeAttr(b.href)}">
        ${icon}<span>${b.label}</span>
      </a>
      ${count}
    </span>
  `;
}

function isTabAvailable(s: RepoSummary, key: TabKey): boolean {
  switch (key) {
    case "issues": return s.hasIssues;
    case "discussions": return s.hasDiscussions;
    case "wiki": return s.hasWiki;
    case "projects": return s.hasProjects;
    default: return true;
  }
}

function renderTab(s: RepoSummary, tab: (typeof TABS)[number], active: TabKey): string {
  const href = `/${s.owner}/${s.repo}${tab.path}`;
  const icon = octicon(tab.icon, { size: 14 });
  const ariaCurrent = tab.key === active ? ' aria-current="page"' : "";
  return `
    <li class="oldgh-tabs__item">
      <a class="oldgh-tabs__link oldgh-repo-tabs__link"
         data-tab="${tab.key}"
         href="${escapeAttr(href)}"${ariaCurrent}>
        ${icon}<span>${tab.label}</span>
      </a>
    </li>
  `;
}

function currentTabKey(owner: string, repo: string, pathname: string): TabKey {
  const prefix = `/${owner}/${repo}`;
  if (pathname === prefix || pathname === `${prefix}/`) return "code";
  const rest = pathname.slice(prefix.length);
  if (rest.startsWith("/releases")) return "releases";
  if (rest.startsWith("/tree/") || rest.startsWith("/blob/") || rest.startsWith("/commits") || rest.startsWith("/commit/") || rest.startsWith("/tags") || rest.startsWith("/branches")) {
    return "code";
  }
  if (rest.startsWith("/issues") || rest.startsWith("/labels") || rest.startsWith("/milestones") || rest.startsWith("/milestone/")) return "issues";
  if (rest.startsWith("/pulls") || rest.startsWith("/pull/")) return "pulls";
  if (rest.startsWith("/discussions")) return "discussions";
  if (rest.startsWith("/actions") || rest.startsWith("/runs/")) return "actions";
  if (rest.startsWith("/projects")) return "projects";
  if (rest.startsWith("/wiki")) return "wiki";
  if (rest.startsWith("/security") || rest.startsWith("/dependabot")) return "security";
  if (rest.startsWith("/pulse") || rest.startsWith("/graphs") || rest.startsWith("/network") || rest.startsWith("/community")) return "insights";
  if (rest.startsWith("/settings")) return "settings";
  return "code";
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
