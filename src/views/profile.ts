import { octicon } from "@/icons";
import { getProfile, type PinnedRepo, type ProfileView } from "@/adapters/profile";

const ROOT_CLASS = "oldgh-profile";

export async function mountProfile(login: string): Promise<void> {
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
  root.innerHTML = renderShell(view);
  const after = document.querySelector(".oldgh-header");
  if (after && after.parentNode) {
    after.after(root);
  } else {
    document.body.append(root);
  }
}

export function unmountProfile(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-profile");
}

function renderShell(v: ProfileView): string {
  return `
    <div class="oldgh-page oldgh-profile__page">
      <aside class="oldgh-profile__sidebar">
        ${renderSidebar(v)}
      </aside>
      <main class="oldgh-profile__main">
        ${renderHeading(v)}
        ${v.pinned.length > 0 ? renderPinned(v) : ""}
        ${renderActivityStub(v)}
      </main>
    </div>
  `;
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
  if (v.repoCountHint != null) stats.push(statItem(String(v.repoCountHint), "repositories", `/${v.login}?tab=repositories`));

  const details: string[] = [];
  if (v.bio) details.push(`<p class="oldgh-profile__bio">${escapeText(v.bio)}</p>`);
  if (v.location) details.push(`<p class="oldgh-profile__detail">${octicon("location", { size: 14 })}<span>${escapeText(v.location)}</span></p>`);
  if (v.homepage) details.push(`<p class="oldgh-profile__detail">${octicon("link", { size: 14 })}<a href="${escapeAttr(v.homepage)}" rel="nofollow noopener">${escapeText(stripUrl(v.homepage))}</a></p>`);

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
    ${orgs}
    ${achievements}
  `;
}

function statItem(value: string, label: string, href: string): string {
  return `<li><a href="${escapeAttr(href)}"><strong>${escapeText(value)}</strong> <span>${escapeText(label)}</span></a></li>`;
}

function renderHeading(v: ProfileView): string {
  const kindLabel = v.kind === "org" ? "Organization" : "Public profile";
  return `
    <header class="oldgh-profile__head">
      <h2 class="oldgh-profile__head-title">${escapeText(kindLabel)}</h2>
      ${v.contributionHeading ? `<p class="oldgh-profile__head-sub">${escapeText(v.contributionHeading)}</p>` : ""}
    </header>
  `;
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

function renderActivityStub(v: ProfileView): string {
  return `
    <section class="oldgh-profile__activity">
      <h3 class="oldgh-profile__section-title">Contributions</h3>
      <p class="oldgh-profile__activity-link">
        ${octicon("graph", { size: 14 })}
        See the full contribution graph and recent activity at
        <a href="https://github.com/${escapeAttr(v.login)}">github.com/${escapeText(v.login)}</a>.
      </p>
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
