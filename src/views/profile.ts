import { octicon } from "@/icons";
import { AdapterFailure } from "@/adapters";
import { getProfile, type PinnedRepo, type ProfileView } from "@/adapters/profile";
import { getProfileRepos, type ProfileReposView, type RepoListItem } from "@/adapters/profile-repos";
import { absoluteTime, relativeTime } from "@/util/time";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-profile";

const USER_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "repositories", label: "Repositories" },
  { key: "stars", label: "Stars" },
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "achievements", label: "Achievements" },
];

const ORG_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "repositories", label: "Repositories" },
  { key: "projects", label: "Projects" },
  { key: "packages", label: "Packages" },
  { key: "people", label: "People" },
];

export async function mountProfile(login: string, tab: string, query: string): Promise<void> {
  const view = await getProfile(login);

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(view, tab);
  adoptBodyRoot(root, ".oldgh-header");

  if (tab === "repositories") {
    void hydrateRepos(root, login, query);
  } else if (tab === "stars") {
    void hydrateStars(root, login);
  } else if (tab !== "overview") {
    void hydrateScrapedTab(root, login, tab, query);
  }
  if (tab === "overview" && view.kind === "user") {
    void hydrateProfileReadme(root, login);
  }
}

async function hydrateStars(root: HTMLElement, login: string): Promise<void> {
  const container = root.querySelector<HTMLElement>(".oldgh-profile__scraped");
  if (!container) return;
  try {
    const resp = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/starred?per_page=30`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) {
      container.innerHTML = `<p class="oldgh-profile__muted">Couldn't load stars (${resp.status}).</p>`;
      return;
    }
    const data = (await resp.json()) as unknown[];
    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = `<p class="oldgh-profile__muted">No starred repositories.</p>`;
      return;
    }
    container.innerHTML = `
      <ul class="oldgh-profile__repos-list">
        ${data.map((r) => renderStarItem(r)).join("")}
      </ul>
    `;
  } catch {
    container.innerHTML = `<p class="oldgh-profile__muted">Couldn't load stars.</p>`;
  }
}

function renderStarItem(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const r = raw as Record<string, unknown>;
  const full = typeof r["full_name"] === "string" ? (r["full_name"] as string) : "";
  if (!full) return "";
  const desc = typeof r["description"] === "string" ? (r["description"] as string) : "";
  const stars = typeof r["stargazers_count"] === "number" ? (r["stargazers_count"] as number) : 0;
  const forks = typeof r["forks_count"] === "number" ? (r["forks_count"] as number) : 0;
  const lang = typeof r["language"] === "string" ? (r["language"] as string) : null;
  const updated = typeof r["pushed_at"] === "string" ? (r["pushed_at"] as string) : "";
  return `
    <li class="oldgh-profile__repo">
      <h3 class="oldgh-profile__repo-name"><a href="/${escapeAttr(full)}">${escapeText(full)}</a></h3>
      ${desc ? `<p class="oldgh-profile__repo-desc">${escapeText(desc)}</p>` : ""}
      <p class="oldgh-profile__repo-meta">
        ${lang ? `<span>${escapeText(lang)}</span>` : ""}
        <span>${octicon("star", { size: 12 })}${formatNum(stars)}</span>
        <span>${octicon("repo-forked", { size: 12 })}${formatNum(forks)}</span>
        ${updated ? `<span>updated <span title="${escapeAttr(updated)}">${escapeText(relativeTime(updated))}</span></span>` : ""}
      </p>
    </li>
  `;
}

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function unmountProfile(): void {
  removeAllBodyRoots();
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
  const tabs = v.kind === "org" ? ORG_TABS : USER_TABS;
  const items = tabs.map((t) => {
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
  if (tab !== "overview") {
    return `<div class="oldgh-profile__scraped" data-state="loading"><p class="oldgh-profile__muted">Loading&hellip;</p></div>`;
  }
  return `
    <div class="oldgh-profile__readme-slot"></div>
    ${v.pinned.length > 0 ? renderPinned(v) : ""}
    ${renderContributions(v)}
  `;
}

async function hydrateProfileReadme(root: HTMLElement, login: string): Promise<void> {
  const slot = root.querySelector<HTMLElement>(".oldgh-profile__readme-slot");
  if (!slot) return;
  try {
    const resp = await fetch(`https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}/readme`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github.html+json" },
    });
    if (!resp.ok) {
      if (resp.status === 404) return;
      // try the raw fallback
      const rawResp = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(login)}/${encodeURIComponent(login)}/HEAD/README.md`, {
        credentials: "omit",
      });
      if (!rawResp.ok) return;
      const md = await rawResp.text();
      slot.innerHTML = `
        <section class="oldgh-profile__readme">
          <h3 class="oldgh-profile__section-title">${octicon("book", { size: 14 })} ${escapeText(login)}/<strong>${escapeText(login)}</strong></h3>
          <article class="oldgh-profile__readme-body markdown-body"><pre style="white-space:pre-wrap">${escapeText(md.slice(0, 50000))}</pre></article>
        </section>
      `;
      return;
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const html = typeof data["html"] === "string" ? data["html"] : (typeof data["content"] === "string" ? null : null);
    if (!html) {
      // fetch as html via accept header — sometimes API returns content
      const htmlResp = await fetch(`https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}/readme`, {
        credentials: "omit",
        headers: { Accept: "application/vnd.github.html" },
      });
      if (!htmlResp.ok) return;
      const rendered = await htmlResp.text();
      slot.innerHTML = `
        <section class="oldgh-profile__readme">
          <h3 class="oldgh-profile__section-title">${octicon("book", { size: 14 })} ${escapeText(login)}/<strong>${escapeText(login)}</strong></h3>
          <article class="oldgh-profile__readme-body markdown-body">${rendered}</article>
        </section>
      `;
      return;
    }
    slot.innerHTML = `
      <section class="oldgh-profile__readme">
        <h3 class="oldgh-profile__section-title">${octicon("book", { size: 14 })} ${escapeText(login)}/<strong>${escapeText(login)}</strong></h3>
        <article class="oldgh-profile__readme-body markdown-body">${html}</article>
      </section>
    `;
  } catch {
    // silent — no readme is fine
  }
}

function renderReposLoading(): string {
  return `<p class="oldgh-profile__muted">Loading repositories&hellip;</p>`;
}

async function hydrateScrapedTab(root: HTMLElement, login: string, tab: string, query: string): Promise<void> {
  const container = root.querySelector<HTMLElement>(".oldgh-profile__scraped");
  if (!container) return;
  const url = `https://github.com/${encodeURIComponent(login)}?tab=${encodeURIComponent(tab)}${query && !/^tab=/.test(query) ? "&" + query.replace(/^tab=[^&]*&?/, "") : ""}`;
  try {
    const resp = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const frame =
      doc.querySelector("turbo-frame#user-profile-frame") ||
      doc.querySelector("turbo-frame[id*='profile']") ||
      doc.querySelector("turbo-frame[id]");
    if (!frame) {
      container.innerHTML = `<p class="oldgh-profile__muted">Couldn't load this tab.</p>`;
      return;
    }
    if (tab === "achievements") {
      container.innerHTML = renderAchievementsFromFrame(frame);
      return;
    }
    if (tab === "followers" || tab === "following") {
      container.innerHTML = renderPeopleFromFrame(frame);
      return;
    }
    for (const node of Array.from(frame.querySelectorAll("script, style"))) node.remove();
    for (const node of Array.from(frame.querySelectorAll<HTMLElement>("*"))) {
      for (const attr of Array.from(node.attributes)) {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      }
    }
    container.innerHTML = frame.innerHTML;
  } catch {
    container.innerHTML = `<p class="oldgh-profile__muted">Couldn't load this tab.</p>`;
  }
}

function renderPeopleFromFrame(frame: Element): string {
  type P = { login: string; name: string | null; avatarUrl: string; bio: string | null; location: string | null };
  const people: P[] = [];
  const seen = new Set<string>();
  for (const card of Array.from(frame.querySelectorAll<HTMLElement>("li, div.d-table, .user-list-item"))) {
    const avatar = card.querySelector<HTMLImageElement>("img.avatar, img.avatar-user, img[src*='avatars']");
    if (!avatar) continue;
    const loginLink = card.querySelector<HTMLAnchorElement>("a[data-hovercard-type='user'], a.d-inline-block, a.text-bold[href^='/']");
    const href = loginLink?.getAttribute("href") || avatar.closest("a")?.getAttribute("href") || "";
    const m = /^\/([\w.-]+)\/?$/.exec(href);
    if (!m || !m[1]) continue;
    const login = m[1];
    if (seen.has(login)) continue;
    seen.add(login);
    let name: string | null = null;
    const nameEl = card.querySelector(".f4.lh-condensed, .text-bold[itemprop='name'], h3.f4");
    if (nameEl) name = (nameEl.textContent || "").trim() || null;
    let bio: string | null = null;
    const bioEl = card.querySelector(".user-profile-bio, .pinned-item-desc, p.color-fg-muted, [data-bio-text]");
    if (bioEl) bio = (bioEl.textContent || "").trim().slice(0, 200) || null;
    let location: string | null = null;
    const locEl = card.querySelector("[itemprop='homeLocation'], li[itemprop='homeLocation'] span");
    if (locEl) location = (locEl.textContent || "").trim() || null;
    people.push({
      login,
      name,
      avatarUrl: avatar.getAttribute("src") || `https://github.com/${login}.png?size=64`,
      bio,
      location,
    });
  }
  if (people.length === 0) {
    return `<p class="oldgh-profile__muted">No users to show.</p>`;
  }
  return `
    <ul class="oldgh-people">
      ${people.map((p) => `
        <li class="oldgh-people__item">
          <a class="oldgh-people__avatar" href="/${escapeAttr(p.login)}">
            <img src="${escapeAttr(p.avatarUrl)}" width="48" height="48" alt="${escapeAttr(p.login)}" />
          </a>
          <div class="oldgh-people__body">
            <div class="oldgh-people__name">
              ${p.name ? `<a href="/${escapeAttr(p.login)}"><strong>${escapeText(p.name)}</strong></a> ` : ""}
              <a href="/${escapeAttr(p.login)}" class="oldgh-people__login">${escapeText(p.login)}</a>
            </div>
            ${p.bio ? `<p class="oldgh-people__bio">${escapeText(p.bio)}</p>` : ""}
            ${p.location ? `<p class="oldgh-people__location">${octicon("location", { size: 12 })} ${escapeText(p.location)}</p>` : ""}
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderAchievementsFromFrame(frame: Element): string {
  type A = { slug: string; name: string; iconUrl: string; tier: string | null };
  const earned: A[] = [];
  for (const d of Array.from(frame.querySelectorAll<HTMLElement>("details[data-achievement-slug]"))) {
    const slug = d.getAttribute("data-achievement-slug") || "";
    const img = d.querySelector<HTMLImageElement>("img");
    const iconUrl = img?.getAttribute("src") || "";
    const name = img?.getAttribute("alt")?.replace(/^Achievement:\s*/i, "").trim() || slug;
    const tierEl = d.querySelector(".achievement-tier, [class*='tier']");
    const tier = tierEl?.textContent?.trim() || null;
    if (slug && iconUrl) earned.push({ slug, name, iconUrl, tier });
  }
  if (earned.length === 0) {
    return `<p class="oldgh-profile__muted">No achievements yet.</p>`;
  }
  return `
    <section class="oldgh-achievements">
      <h3 class="oldgh-achievements__heading">Earned achievements</h3>
      <ul class="oldgh-achievements__grid">
        ${earned.map((a) => `
          <li class="oldgh-achievements__item">
            <img class="oldgh-achievements__icon" src="${escapeAttr(a.iconUrl)}" alt="${escapeAttr(a.name)}" width="96" height="96" />
            <div class="oldgh-achievements__meta">
              <span class="oldgh-achievements__name">${escapeText(a.name)}</span>
              ${a.tier ? `<span class="oldgh-achievements__tier">${escapeText(a.tier)}</span>` : ""}
            </div>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
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
      <img src="${escapeAttr(v.avatarUrl)}" alt="${escapeAttr(v.displayName)}" />
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
