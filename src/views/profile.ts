import { octicon } from "@/icons";
import { AdapterFailure } from "@/adapters";
import { getProfile, type PinnedRepo, type ProfileView } from "@/adapters/profile";
import { getProfileRepos, type ProfileReposView, type RepoListItem } from "@/adapters/profile-repos";
import { absoluteTime, relativeTime } from "@/util/time";

const ROOT_CLASS = "oldgh-profile";

const TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "repositories", label: "Repositories" },
  { key: "stars", label: "Stars" },
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "achievements", label: "Achievements" },
];

export async function mountProfile(login: string, tab: string, query: string): Promise<void> {
  let view: ProfileView;
  try {
    view = await getProfile(login);
  } catch (err) {
    unmountProfile();
    throw err;
  }

  unmountProfile();
  document.documentElement.setAttribute("data-oldgh-hide-modern-profile", "");

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(view, tab);
  const after = document.querySelector(".oldgh-header");
  if (after && after.parentNode) {
    after.after(root);
  } else {
    document.body.append(root);
  }

  if (tab === "repositories") {
    void hydrateRepos(root, login, query);
  }
}

export function unmountProfile(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-profile");
}

function renderShell(v: ProfileView, tab: string): string {
  return `
    <div class="oldgh-page oldgh-profile__page">
      <aside class="oldgh-profile__sidebar">
        ${renderSidebar(v)}
      </aside>
      <main class="oldgh-profile__main">
        ${renderTabNav(v, tab)}
        ${renderTabBody(v, tab)}
      </main>
    </div>
  `;
}

function renderTabNav(v: ProfileView, tab: string): string {
  const items = TABS.map((t) => {
    const href = t.key === "overview" ? `/${v.login}` : `/${v.login}?tab=${t.key}`;
    const active = tab === t.key ? ' aria-current="page"' : "";
    return `<li class="oldgh-tabs__item"><a class="oldgh-tabs__link" href="${escapeAttr(href)}"${active}>${escapeText(t.label)}</a></li>`;
  }).join("");
  return `<nav class="oldgh-profile__tabnav" aria-label="Profile sections"><ul class="oldgh-tabs">${items}</ul></nav>`;
}

function renderTabBody(v: ProfileView, tab: string): string {
  if (tab === "repositories") {
    return `<div class="oldgh-profile__repos" data-state="loading">${renderReposLoading()}</div>`;
  }
  return `
    ${v.pinned.length > 0 ? renderPinned(v) : ""}
    ${renderContributions(v)}
  `;
}

function renderReposLoading(): string {
  return `<p class="oldgh-profile__muted">Loading repositories&hellip;</p>`;
}

async function hydrateRepos(root: HTMLElement, login: string, query: string): Promise<void> {
  const container = root.querySelector<HTMLElement>(".oldgh-profile__repos");
  if (!container) return;
  let data: ProfileReposView;
  try {
    data = await getProfileRepos(login, query);
  } catch (err) {
    container.innerHTML = `<p class="oldgh-profile__muted">${err instanceof AdapterFailure ? "Couldn't load repositories." : "Couldn't load repositories."}</p>`;
    return;
  }
  container.innerHTML = renderRepos(data);
}

function renderRepos(d: ProfileReposView): string {
  if (d.items.length === 0) {
    return `<p class="oldgh-profile__muted">No repositories.</p>`;
  }
  return `
    <ul class="oldgh-repo-list">
      ${d.items.map((r) => renderRepoRow(r)).join("")}
    </ul>
    ${renderRepoPagination(d)}
  `;
}

function renderRepoRow(r: RepoListItem): string {
  const privacy = r.isPrivate
    ? `<span class="oldgh-repo-list__visibility">Private</span>`
    : `<span class="oldgh-repo-list__visibility oldgh-repo-list__visibility--public">Public</span>`;
  const forkLabel = r.isFork ? `<span class="oldgh-repo-list__type">Forked</span>` : "";
  const mirror = r.isMirror ? `<span class="oldgh-repo-list__type">Mirror</span>` : "";
  const template = r.isTemplate ? `<span class="oldgh-repo-list__type">Template</span>` : "";

  const meta: string[] = [];
  if (r.language) {
    const swatch = r.languageColor
      ? `<span class="oldgh-profile__lang-swatch" style="background:${escapeAttr(r.languageColor)}"></span>`
      : "";
    meta.push(`<span>${swatch}${escapeText(r.language)}</span>`);
  }
  if (r.stars) meta.push(`<span>${octicon("star", { size: 12 })}${escapeText(r.stars)}</span>`);
  if (r.forks) meta.push(`<span>${octicon("repo-forked", { size: 12 })}${escapeText(r.forks)}</span>`);
  if (r.updatedIso) {
    meta.push(`<span title="${escapeAttr(absoluteTime(r.updatedIso))}">Updated ${escapeText(relativeTime(r.updatedIso))}</span>`);
  }

  return `
    <li class="oldgh-repo-list__item">
      <h3 class="oldgh-repo-list__title">
        <a href="${escapeAttr(r.href)}"><strong>${escapeText(r.name)}</strong></a>
        ${privacy}${forkLabel}${mirror}${template}
      </h3>
      ${r.description ? `<p class="oldgh-repo-list__desc">${escapeText(r.description)}</p>` : ""}
      <p class="oldgh-repo-list__meta">${meta.join("")}</p>
    </li>
  `;
}

function renderRepoPagination(d: ProfileReposView): string {
  if (!d.pagination.prevHref && !d.pagination.nextHref) return "";
  const prev = d.pagination.prevHref
    ? `<a class="oldgh-btn" href="${escapeAttr(d.pagination.prevHref)}">${octicon("triangle-left", { size: 14 })}<span>Previous</span></a>`
    : `<button class="oldgh-btn" type="button" disabled>${octicon("triangle-left", { size: 14 })}<span>Previous</span></button>`;
  const next = d.pagination.nextHref
    ? `<a class="oldgh-btn" href="${escapeAttr(d.pagination.nextHref)}"><span>Next</span>${octicon("triangle-right", { size: 14 })}</a>`
    : `<button class="oldgh-btn" type="button" disabled><span>Next</span>${octicon("triangle-right", { size: 14 })}</button>`;
  return `<div class="oldgh-repo-list__pagination">${prev}${next}</div>`;
}

function renderSidebar(v: ProfileView): string {
  const avatar = `
    <div class="oldgh-profile__avatar">
      <img src="${escapeAttr(v.avatarUrl)}" alt="${escapeAttr(v.displayName)}" width="210" height="210" />
    </div>
  `;
  const action = v.isViewer
    ? `<a class="oldgh-btn oldgh-profile__edit" href="/settings/profile">Edit profile</a>`
    : `<button type="button" class="oldgh-btn oldgh-profile__follow">${octicon("person", { size: 14 })}<span>Follow</span></button>`;

  const stats: string[] = [];
  if (v.followersCount) stats.push(statItem(v.followersCount, "followers", `/${v.login}?tab=followers`));
  if (v.followingCount) stats.push(statItem(v.followingCount, "following", `/${v.login}?tab=following`));
  if (v.repoCountHint != null) stats.push(statItem(String(v.repoCountHint), "repos", `/${v.login}?tab=repositories`));

  const details: string[] = [];
  if (v.bio) details.push(`<p class="oldgh-profile__bio">${escapeText(v.bio)}</p>`);
  if (v.location) details.push(`<p class="oldgh-profile__detail">${octicon("location", { size: 14 })}<span>${escapeText(v.location)}</span></p>`);
  if (v.homepage) details.push(`<p class="oldgh-profile__detail">${octicon("link", { size: 14 })}<a href="${escapeAttr(v.homepage)}" rel="nofollow noopener">${escapeText(stripUrl(v.homepage))}</a></p>`);

  const highlights = renderHighlights(v);

  const orgs = v.orgs.length > 0
    ? `<section class="oldgh-profile__orgs">
        <h3>Organizations</h3>
        <ul class="oldgh-profile__org-list">
          ${v.orgs.slice(0, 12).map((o) => `<li><a href="/${escapeAttr(o.login)}" title="@${escapeAttr(o.login)}"><img src="${escapeAttr(o.avatarUrl)}" alt="${escapeAttr(o.login)}" width="32" height="32" /></a></li>`).join("")}
        </ul>
      </section>`
    : "";

  const achievements = v.achievements.length > 0
    ? `<section class="oldgh-profile__achievements">
        <h3>Achievements</h3>
        <ul class="oldgh-profile__badges">
          ${v.achievements.slice(0, 8).map((a) => `<li><a href="${escapeAttr(a.href)}" title="${escapeAttr(a.name)}"><img src="${escapeAttr(a.iconUrl)}" alt="${escapeAttr(a.name)}" width="56" height="56" /></a></li>`).join("")}
        </ul>
      </section>`
    : "";

  return `
    ${avatar}
    <h1 class="oldgh-profile__name">${escapeText(v.displayName)}</h1>
    <p class="oldgh-profile__login">${escapeText(v.login)}</p>
    ${details.join("")}
    ${action}
    ${stats.length > 0 ? `<ul class="oldgh-profile__stats">${stats.join("")}</ul>` : ""}
    ${highlights}
    ${orgs}
    ${achievements}
  `;
}

function renderHighlights(v: ProfileView): string {
  const items: string[] = [];
  if (v.highlights.proPlan) {
    items.push(`<li class="oldgh-profile__highlight"><span class="oldgh-profile__pro">PRO</span> Account</li>`);
  }
  if (v.highlights.devProgramMember) {
    items.push(`<li class="oldgh-profile__highlight">${octicon("rocket", { size: 14 })}<a href="/settings/profile#github-developer-program">Developer Program Member</a></li>`);
  }
  if (items.length === 0) return "";
  return `
    <section class="oldgh-profile__highlights">
      <h3>Highlights</h3>
      <ul class="oldgh-profile__highlight-list">${items.join("")}</ul>
    </section>
  `;
}

function statItem(value: string, label: string, href: string): string {
  return `<li><a href="${escapeAttr(href)}"><strong>${escapeText(value)}</strong> <span>${escapeText(label)}</span></a></li>`;
}

function renderPinned(v: ProfileView): string {
  return `
    <section class="oldgh-profile__pinned">
      <h3 class="oldgh-profile__section-title">Pinned repositories</h3>
      <ul class="oldgh-profile__pinned-list">
        ${v.pinned.map((p) => renderPinnedCard(p)).join("")}
      </ul>
    </section>
  `;
}

function renderPinnedCard(p: PinnedRepo): string {
  const repoIcon = p.isPrivate ? octicon("lock", { size: 14 }) : octicon("repo", { size: 14 });
  const langSwatch = p.languageColor
    ? `<span class="oldgh-profile__lang-swatch" style="background:${escapeAttr(p.languageColor)}"></span>`
    : "";
  const meta: string[] = [];
  if (p.language) meta.push(`<span class="oldgh-profile__pinned-lang">${langSwatch}${escapeText(p.language)}</span>`);
  if (p.stars) meta.push(`<span class="oldgh-profile__pinned-count">${octicon("star", { size: 12 })}${escapeText(p.stars)}</span>`);
  if (p.forks) meta.push(`<span class="oldgh-profile__pinned-count">${octicon("repo-forked", { size: 12 })}${escapeText(p.forks)}</span>`);
  return `
    <li class="oldgh-profile__pinned-card">
      <h4 class="oldgh-profile__pinned-title">
        ${repoIcon}
        <a href="${escapeAttr(p.href)}"><strong>${escapeText(p.nwo.split("/").pop() ?? p.nwo)}</strong></a>
      </h4>
      ${p.description ? `<p class="oldgh-profile__pinned-desc">${escapeText(p.description)}</p>` : ""}
      ${meta.length > 0 ? `<p class="oldgh-profile__pinned-meta">${meta.join("")}</p>` : ""}
    </li>
  `;
}

function renderContributions(v: ProfileView): string {
  if (!v.contributionGraphHtml) {
    return `
      <section class="oldgh-profile__activity">
        <h3 class="oldgh-profile__section-title">Contributions</h3>
        <p class="oldgh-profile__activity-link">${octicon("graph", { size: 14 })}<span>See the full contribution graph at <a href="https://github.com/${escapeAttr(v.login)}">github.com/${escapeText(v.login)}</a>.</span></p>
      </section>
    `;
  }
  return `
    <section class="oldgh-profile__contribs">
      ${v.contributionHeading ? `<h3 class="oldgh-profile__section-title">${escapeText(v.contributionHeading)}</h3>` : `<h3 class="oldgh-profile__section-title">Contributions</h3>`}
      <div class="oldgh-profile__contribs-graph">${v.contributionGraphHtml}</div>
      <div class="oldgh-profile__contribs-legend">
        <span>Less</span>
        <span class="oldgh-profile__contribs-legend-cell" data-level="0"></span>
        <span class="oldgh-profile__contribs-legend-cell" data-level="1"></span>
        <span class="oldgh-profile__contribs-legend-cell" data-level="2"></span>
        <span class="oldgh-profile__contribs-legend-cell" data-level="3"></span>
        <span class="oldgh-profile__contribs-legend-cell" data-level="4"></span>
        <span>More</span>
      </div>
    </section>
  `;
}

function stripUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
