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
    void hydrateActivity(root, login);
  }
  decorateContributionCells(root);
  // tool-tip custom elements relocate themselves asynchronously; retry once they have
  setTimeout(() => decorateContributionCells(root), 100);
  setTimeout(() => decorateContributionCells(root), 500);
}

function decorateContributionCells(root: HTMLElement): void {
  const graph = root.querySelector<HTMLElement>(".oldgh-profile__contribs-graph");
  if (!graph) return;
  for (const cell of Array.from(graph.querySelectorAll<HTMLElement>(".ContributionCalendar-day, td.day"))) {
    const existing = cell.getAttribute("title");
    if (existing && /contributions? on/i.test(existing)) continue;
    const labelId = cell.getAttribute("aria-labelledby");
    let label: string | null = null;
    if (labelId) {
      // tool-tip elements auto-relocate to document body, so search globally
      label = document.getElementById(labelId)?.textContent?.replace(/\s+/g, " ").trim() || null;
    }
    if (!label) {
      const tipNeighbor = cell.querySelector<HTMLElement>("tool-tip, .sr-only");
      if (tipNeighbor) label = tipNeighbor.textContent?.replace(/\s+/g, " ").trim() || null;
    }
    if (!label) {
      const date = cell.getAttribute("data-date");
      if (date) label = `${date}`;
    }
    if (label) cell.setAttribute("title", label);
  }
}


async function hydrateActivity(root: HTMLElement, login: string): Promise<void> {
  const slot = root.querySelector<HTMLElement>(".oldgh-profile__activity-slot");
  if (!slot) return;
  try {
    const resp = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=30`, {
      credentials: "omit",
      cache: "no-cache",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return;
    const events = (await resp.json()) as unknown[];
    if (!Array.isArray(events) || events.length === 0) return;
    const groups = groupEventsByMonth(events);
    if (groups.length === 0) return;
    slot.innerHTML = `
      <section class="oldgh-profile__activity">
        <h3 class="oldgh-profile__section-title">${octicon("clock", { size: 14 })} Public activity</h3>
        <div class="oldgh-activity">
          ${groups.map((g) => `
            <details class="oldgh-activity__group" ${g.isLatest ? "open" : ""}>
              <summary class="oldgh-activity__month">
                <span class="oldgh-activity__month-label">${escapeText(g.label)}</span>
                <span class="oldgh-activity__month-count">${g.items.length} ${g.items.length === 1 ? "event" : "events"}</span>
              </summary>
              <ul class="oldgh-activity__list">
                ${g.items.map(renderActivityItem).join("")}
              </ul>
            </details>
          `).join("")}
        </div>
      </section>
    `;
  } catch {
    // silent — activity is optional
  }
}

type ActivityItem = {
  type: string;
  iconName: string;
  line: string;
  occurredAt: string;
};

type ActivityGroup = {
  label: string;
  isLatest: boolean;
  items: ActivityItem[];
};

function groupEventsByMonth(events: unknown[]): ActivityGroup[] {
  const grouped = new Map<string, ActivityItem[]>();
  for (const raw of events) {
    const item = parseEvent(raw);
    if (!item) continue;
    const monthKey = item.occurredAt.slice(0, 7);
    const list = grouped.get(monthKey) ?? [];
    list.push(item);
    grouped.set(monthKey, list);
  }
  const out: ActivityGroup[] = [];
  let first = true;
  for (const [key, items] of grouped) {
    const d = new Date(key + "-01T00:00:00Z");
    const label = Number.isNaN(d.getTime())
      ? key
      : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    out.push({ label, isLatest: first, items });
    first = false;
  }
  return out;
}

function parseEvent(raw: unknown): ActivityItem | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const type = typeof e["type"] === "string" ? (e["type"] as string) : "";
  if (!type) return null;
  const repoRaw = e["repo"] && typeof e["repo"] === "object" ? (e["repo"] as Record<string, unknown>) : null;
  const repoName = repoRaw && typeof repoRaw["name"] === "string" ? (repoRaw["name"] as string) : "";
  const repoLink = repoName ? `<a href="/${escapeAttr(repoName)}">${escapeText(repoName)}</a>` : "this repository";
  const payload = e["payload"] && typeof e["payload"] === "object" ? (e["payload"] as Record<string, unknown>) : {};
  const createdAt = typeof e["created_at"] === "string" ? (e["created_at"] as string) : "";
  const when = createdAt
    ? `<span class="oldgh-activity__when" title="${escapeAttr(absoluteTime(createdAt))}">${escapeText(relativeTime(createdAt))}</span>`
    : "";

  const built = buildLine(type, repoName, repoLink, payload, when);
  if (!built) return null;
  return { type, iconName: built.icon, line: built.line, occurredAt: createdAt };
}

function buildLine(
  type: string,
  repoName: string,
  repoLink: string,
  payload: Record<string, unknown>,
  when: string,
): { icon: string; line: string } | null {
  switch (type) {
    case "PushEvent": {
      const commits = Array.isArray(payload["commits"]) ? (payload["commits"] as unknown[]) : [];
      const sizeRaw = payload["size"];
      const size = typeof sizeRaw === "number" ? (sizeRaw as number) : commits.length;
      const ref = typeof payload["ref"] === "string" ? (payload["ref"] as string).replace(/^refs\/heads\//, "") : "";
      const refLabel = ref ? `<code>${escapeText(ref)}</code>` : "";
      if (size > 0) {
        return { icon: "git-commit", line: `Pushed <strong>${size}</strong> commit${size === 1 ? "" : "s"} to ${refLabel} in ${repoLink} ${when}` };
      }
      return { icon: "git-commit", line: `Pushed to ${refLabel} in ${repoLink} ${when}` };
    }
    case "PullRequestEvent": {
      const action = typeof payload["action"] === "string" ? (payload["action"] as string) : "";
      const pr = payload["pull_request"] && typeof payload["pull_request"] === "object" ? (payload["pull_request"] as Record<string, unknown>) : null;
      const num = pr && typeof pr["number"] === "number" ? (pr["number"] as number) : (typeof payload["number"] === "number" ? (payload["number"] as number) : 0);
      const title = pr && typeof pr["title"] === "string" ? (pr["title"] as string) : "";
      const merged = action === "merged" || (pr && pr["merged"] === true);
      const verb = merged ? "Merged" : action === "closed" ? "Closed" : action === "opened" ? "Opened" : action === "reopened" ? "Reopened" : capitalize(action);
      const icon = merged ? "git-merge" : "git-pull-request";
      const link = num
        ? `<a href="/${escapeAttr(repoName)}/pull/${num}">${escapeText(title || "#" + num)}</a>`
        : escapeText(title);
      return { icon, line: `${escapeText(verb)} pull request ${link} in ${repoLink} ${when}` };
    }
    case "PullRequestReviewEvent": {
      const pr = payload["pull_request"] && typeof payload["pull_request"] === "object" ? (payload["pull_request"] as Record<string, unknown>) : null;
      const num = pr && typeof pr["number"] === "number" ? (pr["number"] as number) : 0;
      const link = num ? `<a href="/${escapeAttr(repoName)}/pull/${num}">#${num}</a>` : "";
      return { icon: "eye", line: `Reviewed pull request ${link} in ${repoLink} ${when}` };
    }
    case "PullRequestReviewCommentEvent": {
      const pr = payload["pull_request"] && typeof payload["pull_request"] === "object" ? (payload["pull_request"] as Record<string, unknown>) : null;
      const num = pr && typeof pr["number"] === "number" ? (pr["number"] as number) : 0;
      const link = num ? `<a href="/${escapeAttr(repoName)}/pull/${num}">#${num}</a>` : "";
      return { icon: "comment", line: `Commented on pull request ${link} in ${repoLink} ${when}` };
    }
    case "IssuesEvent": {
      const action = typeof payload["action"] === "string" ? (payload["action"] as string) : "";
      const issue = payload["issue"] && typeof payload["issue"] === "object" ? (payload["issue"] as Record<string, unknown>) : null;
      const num = issue && typeof issue["number"] === "number" ? (issue["number"] as number) : (typeof payload["number"] === "number" ? (payload["number"] as number) : 0);
      const title = issue && typeof issue["title"] === "string" ? (issue["title"] as string) : "";
      const verb = action === "closed" ? "Closed" : action === "opened" ? "Opened" : action === "reopened" ? "Reopened" : capitalize(action);
      const icon = action === "closed" ? "issue-closed" : action === "reopened" ? "issue-reopened" : "issue-opened";
      const link = num
        ? `<a href="/${escapeAttr(repoName)}/issues/${num}">${escapeText(title || "#" + num)}</a>`
        : escapeText(title);
      return { icon, line: `${escapeText(verb)} issue ${link} in ${repoLink} ${when}` };
    }
    case "IssueCommentEvent": {
      const issue = payload["issue"] && typeof payload["issue"] === "object" ? (payload["issue"] as Record<string, unknown>) : null;
      const num = issue && typeof issue["number"] === "number" ? (issue["number"] as number) : 0;
      const title = issue && typeof issue["title"] === "string" ? (issue["title"] as string) : "";
      const isPull = issue && !!issue["pull_request"];
      const path = isPull ? "pull" : "issues";
      const link = num
        ? `<a href="/${escapeAttr(repoName)}/${path}/${num}">${escapeText(title || "#" + num)}</a>`
        : "";
      return { icon: "comment", line: `Commented on ${isPull ? "pull request" : "issue"} ${link} in ${repoLink} ${when}` };
    }
    case "CreateEvent": {
      const refType = typeof payload["ref_type"] === "string" ? (payload["ref_type"] as string) : "";
      const ref = typeof payload["ref"] === "string" ? (payload["ref"] as string) : "";
      if (refType === "repository") {
        return { icon: "repo", line: `Created repository ${repoLink} ${when}` };
      }
      const label = ref ? `<code>${escapeText(ref)}</code>` : refType;
      return { icon: refType === "tag" ? "tag" : "git-branch", line: `Created ${escapeText(refType)} ${label} in ${repoLink} ${when}` };
    }
    case "DeleteEvent": {
      const refType = typeof payload["ref_type"] === "string" ? (payload["ref_type"] as string) : "";
      const ref = typeof payload["ref"] === "string" ? (payload["ref"] as string) : "";
      return { icon: "trashcan", line: `Deleted ${escapeText(refType)} <code>${escapeText(ref)}</code> in ${repoLink} ${when}` };
    }
    case "ForkEvent": {
      const fork = payload["forkee"] && typeof payload["forkee"] === "object" ? (payload["forkee"] as Record<string, unknown>) : null;
      const forkName = fork && typeof fork["full_name"] === "string" ? (fork["full_name"] as string) : "";
      const forkLink = forkName ? `<a href="/${escapeAttr(forkName)}">${escapeText(forkName)}</a>` : "a fork";
      return { icon: "repo-forked", line: `Forked ${repoLink} to ${forkLink} ${when}` };
    }
    case "WatchEvent":
      return { icon: "star", line: `Starred ${repoLink} ${when}` };
    case "ReleaseEvent": {
      const action = typeof payload["action"] === "string" ? (payload["action"] as string) : "";
      const release = payload["release"] && typeof payload["release"] === "object" ? (payload["release"] as Record<string, unknown>) : null;
      const tag = release && typeof release["tag_name"] === "string" ? (release["tag_name"] as string) : "";
      const name = release && typeof release["name"] === "string" ? (release["name"] as string) : tag;
      const html = release && typeof release["html_url"] === "string" ? (release["html_url"] as string) : "";
      const link = html ? `<a href="${escapeAttr(html)}">${escapeText(name || tag || "release")}</a>` : escapeText(name);
      const verb = action === "published" ? "Released" : capitalize(action);
      return { icon: "tag", line: `${escapeText(verb)} ${link} in ${repoLink} ${when}` };
    }
    case "PublicEvent":
      return { icon: "unlock", line: `Made ${repoLink} public ${when}` };
    case "MemberEvent": {
      const member = payload["member"] && typeof payload["member"] === "object" ? (payload["member"] as Record<string, unknown>) : null;
      const memberLogin = member && typeof member["login"] === "string" ? (member["login"] as string) : "";
      const link = memberLogin ? `<a href="/${escapeAttr(memberLogin)}">${escapeText(memberLogin)}</a>` : "a collaborator";
      return { icon: "person", line: `Added ${link} as a collaborator on ${repoLink} ${when}` };
    }
    case "CommitCommentEvent": {
      const comment = payload["comment"] && typeof payload["comment"] === "object" ? (payload["comment"] as Record<string, unknown>) : null;
      const sha = comment && typeof comment["commit_id"] === "string" ? (comment["commit_id"] as string).slice(0, 7) : "";
      const link = sha ? `<a href="/${escapeAttr(repoName)}/commit/${escapeAttr(sha)}"><code>${escapeText(sha)}</code></a>` : "";
      return { icon: "comment", line: `Commented on commit ${link} in ${repoLink} ${when}` };
    }
    case "GollumEvent": {
      const pages = Array.isArray(payload["pages"]) ? (payload["pages"] as unknown[]) : [];
      return { icon: "book", line: `Updated <strong>${pages.length}</strong> wiki page${pages.length === 1 ? "" : "s"} in ${repoLink} ${when}` };
    }
    default:
      return null;
  }
}

function renderActivityItem(item: ActivityItem): string {
  return `
    <li class="oldgh-activity__item">
      <span class="oldgh-activity__icon">${octicon(item.iconName, { size: 14 })}</span>
      <span class="oldgh-activity__line">${item.line}</span>
    </li>
  `;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
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
    <div class="oldgh-profile__activity-slot"></div>
  `;
}

async function hydrateProfileReadme(root: HTMLElement, login: string): Promise<void> {
  const slot = root.querySelector<HTMLElement>(".oldgh-profile__readme-slot");
  if (!slot) return;
  const url = `https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}/readme`;
  try {
    const htmlResp = await fetch(url, {
      credentials: "omit",
      cache: "no-cache",
      headers: { Accept: "application/vnd.github.html" },
    });
    if (htmlResp.ok) {
      const ct = htmlResp.headers.get("content-type") || "";
      const text = await htmlResp.text();
      const looksHtml = ct.includes("html") || /^\s*</.test(text);
      if (looksHtml && text.trim()) {
        slot.innerHTML = `
          <section class="oldgh-profile__readme">
            <h3 class="oldgh-profile__section-title">${octicon("book", { size: 14 })} ${escapeText(login)}/<strong>${escapeText(login)}</strong></h3>
            <article class="oldgh-profile__readme-body markdown-body">${text}</article>
          </section>
        `;
        return;
      }
    } else if (htmlResp.status === 404) {
      return;
    }
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
    const frame: Element =
      doc.querySelector("turbo-frame#user-profile-frame") ||
      doc.querySelector("turbo-frame[id*='profile']") ||
      doc.querySelector("turbo-frame[id]") ||
      doc.querySelector("main") ||
      doc.body;
    if (tab === "achievements") {
      container.innerHTML = renderAchievementsFromFrame(frame);
      return;
    }
    if (tab === "followers" || tab === "following" || tab === "people") {
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
  const cardSelectors = ["li", "div.d-table", ".user-list-item", "[data-testid*='member']"];
  let cards: HTMLElement[] = [];
  for (const sel of cardSelectors) {
    cards = Array.from(frame.querySelectorAll<HTMLElement>(sel));
    if (cards.some((c) => c.querySelector("a[data-hovercard-type='user']") && c.querySelector("img[src*='avatars']"))) break;
  }
  for (const card of cards) {
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
    for (const a of Array.from(frame.querySelectorAll<HTMLAnchorElement>("a[data-hovercard-type='user']"))) {
      const href = a.getAttribute("href") || "";
      const m = /^\/([\w.-]+)\/?$/.exec(href);
      if (!m || !m[1]) continue;
      const login = m[1];
      if (seen.has(login)) continue;
      seen.add(login);
      const avatarImg = a.querySelector<HTMLImageElement>("img[src*='avatars']")
        || (a.parentElement?.querySelector<HTMLImageElement>("img[src*='avatars']") ?? null);
      const avatarUrl = avatarImg?.getAttribute("src") || `https://github.com/${login}.png?size=64`;
      people.push({ login, name: null, avatarUrl, bio: null, location: null });
    }
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
      <section class="oldgh-profile__contribs-empty">
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
