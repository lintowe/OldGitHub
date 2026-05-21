import { octicon } from "@/icons";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";
import { currentUserLogin } from "@/auth/session";
import { languageColor } from "@/util/language-color";

const ROOT_CLASS = "oldgh-stars";

type StarredRepo = {
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  repoName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  htmlUrl: string;
  updatedAt: string;
  starredAt: string;
  topics: string[];
};

export async function mountStars(pathname: string, search: string): Promise<void> {
  const root = document.createElement("div");
  root.className = ROOT_CLASS;

  const segs = pathname.split("/").filter(Boolean);
  const login = segs[0] === "stars" && segs[1] ? segs[1] : currentUserLogin();
  if (!login) {
    root.innerHTML = `
      <div class="oldgh-page">
        <header class="oldgh-stars__header"><h1>Stars</h1></header>
        <p class="oldgh-stars__empty">Sign in to view your starred repositories.</p>
      </div>
    `;
    adoptBodyRoot(root);
    return;
  }

  const params = new URLSearchParams(search);
  const sort = params.get("sort") ?? "created"; // created = recently starred
  const direction = params.get("direction") ?? "desc";
  const languageFilter = params.get("language") ?? "";

  root.innerHTML = `
    <div class="oldgh-page">
      <header class="oldgh-stars__header">
        <h1>${octicon("star", { size: 22 })} ${escapeText(login)}'s Stars</h1>
        <p class="oldgh-stars__sub">Repositories starred by <a href="/${escapeAttr(login)}">${escapeText(login)}</a></p>
      </header>
      <div class="oldgh-stars__loading">Loading stars…</div>
    </div>
  `;
  adoptBodyRoot(root);

  try {
    const resp = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}/starred?per_page=100&sort=${encodeURIComponent(sort)}&direction=${encodeURIComponent(direction)}`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github.star+json" },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const data = (await resp.json()) as unknown[];
    const items = data.map(parseStarred).filter((s): s is StarredRepo => s !== null);
    const loading = root.querySelector(".oldgh-stars__loading");
    if (loading) loading.remove();
    const page = root.querySelector(".oldgh-page");
    if (page) {
      const layout = document.createElement("div");
      layout.className = "oldgh-stars__layout";
      layout.innerHTML = renderLayout(items, { login, sort, direction, languageFilter });
      page.appendChild(layout);
      bindStarsSort(layout);
    }
  } catch (err) {
    const loading = root.querySelector(".oldgh-stars__loading");
    if (loading) loading.textContent = `Couldn't load stars: ${err instanceof Error ? err.message : String(err)}`;
  }
}

type StarsCtx = { login: string; sort: string; direction: string; languageFilter: string };

function renderLayout(items: StarredRepo[], ctx: StarsCtx): string {
  const filtered = ctx.languageFilter
    ? items.filter((r) => (r.language || "").toLowerCase() === ctx.languageFilter.toLowerCase())
    : items;
  const langCounts = new Map<string, number>();
  for (const it of items) {
    const k = it.language || "Unknown";
    langCounts.set(k, (langCounts.get(k) ?? 0) + 1);
  }
  const sortedLangs = Array.from(langCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return `
    <aside class="oldgh-stars__sidebar">
      <div class="oldgh-stars__sidebox">
        <h3>${octicon("flame", { size: 14 })} Stats</h3>
        <ul class="oldgh-stars__stats">
          <li><strong>${items.length}</strong> repositories starred</li>
          <li><strong>${langCounts.size}</strong> languages</li>
        </ul>
      </div>
      ${sortedLangs.length > 0 ? `
        <div class="oldgh-stars__sidebox">
          <h3>${octicon("code", { size: 14 })} Languages</h3>
          <ul class="oldgh-stars__lang-list">
            ${ctx.languageFilter ? `<li><a href="/${escapeAttr(ctx.login)}?tab=stars">${octicon("x", { size: 12 })} Clear filter</a></li>` : ""}
            ${sortedLangs.map(([lang, count]) => `
              <li class="${ctx.languageFilter.toLowerCase() === lang.toLowerCase() ? "is-active" : ""}">
                <a href="/${escapeAttr(ctx.login)}?tab=stars&language=${encodeURIComponent(lang)}">
                  ${lang !== "Unknown" ? `<span class="oldgh-search__lang-dot" style="background:${languageColor(lang)}"></span>` : ""}
                  ${escapeText(lang)}
                  <span class="oldgh-stars__lang-count">${count}</span>
                </a>
              </li>
            `).join("")}
          </ul>
        </div>
      ` : ""}
    </aside>
    <main class="oldgh-stars__main">
      <div class="oldgh-stars__bar">
        <div class="oldgh-stars__count">
          <strong>${filtered.length}</strong> ${filtered.length === 1 ? "result" : "results"}
          ${ctx.languageFilter ? ` · filtered by <strong>${escapeText(ctx.languageFilter)}</strong>` : ""}
        </div>
        <label class="oldgh-stars__sort">
          <span>Sort:</span>
          <select data-oldgh-stars-sort>
            <option value="created:desc"${ctx.sort === "created" && ctx.direction === "desc" ? " selected" : ""}>Recently starred</option>
            <option value="created:asc"${ctx.sort === "created" && ctx.direction === "asc" ? " selected" : ""}>Earliest starred</option>
            <option value="updated:desc"${ctx.sort === "updated" ? " selected" : ""}>Recently active</option>
          </select>
        </label>
      </div>
      ${renderList(filtered)}
    </main>
  `;
}

function bindStarsSort(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>("select[data-oldgh-stars-sort]");
  if (!select) return;
  select.addEventListener("change", () => {
    const [sort, direction] = select.value.split(":");
    const params = new URLSearchParams(window.location.search);
    if (sort) params.set("sort", sort);
    if (direction) params.set("direction", direction);
    const href = `${window.location.pathname}?${params.toString()}`;
    history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

export function unmountStars(): void {
  removeAllBodyRoots();
}

function parseStarred(raw: unknown): StarredRepo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // star+json wraps: { starred_at, repo }
  const repoMaybe = r["repo"];
  const repoObj = repoMaybe && typeof repoMaybe === "object" ? (repoMaybe as Record<string, unknown>) : r;
  const fullName = typeof repoObj["full_name"] === "string" ? (repoObj["full_name"] as string) : null;
  if (!fullName) return null;
  const owner = repoObj["owner"] && typeof repoObj["owner"] === "object" ? (repoObj["owner"] as Record<string, unknown>) : null;
  const license = repoObj["license"] && typeof repoObj["license"] === "object" ? (repoObj["license"] as Record<string, unknown>) : null;
  void license;
  return {
    fullName,
    ownerLogin: (owner && typeof owner["login"] === "string" ? (owner["login"] as string) : fullName.split("/")[0]) ?? "",
    ownerAvatar: (owner && typeof owner["avatar_url"] === "string" ? (owner["avatar_url"] as string) : "") ?? "",
    repoName: (typeof repoObj["name"] === "string" ? (repoObj["name"] as string) : fullName.split("/")[1]) ?? "",
    description: typeof repoObj["description"] === "string" ? (repoObj["description"] as string) : null,
    language: typeof repoObj["language"] === "string" ? (repoObj["language"] as string) : null,
    stars: typeof repoObj["stargazers_count"] === "number" ? (repoObj["stargazers_count"] as number) : 0,
    forks: typeof repoObj["forks_count"] === "number" ? (repoObj["forks_count"] as number) : 0,
    isPrivate: repoObj["private"] === true,
    isFork: repoObj["fork"] === true,
    isArchived: repoObj["archived"] === true,
    htmlUrl: (typeof repoObj["html_url"] === "string" ? (repoObj["html_url"] as string) : `https://github.com/${fullName}`),
    updatedAt: typeof repoObj["updated_at"] === "string" ? (repoObj["updated_at"] as string) : "",
    starredAt: typeof r["starred_at"] === "string" ? (r["starred_at"] as string) : "",
    topics: Array.isArray(repoObj["topics"]) ? (repoObj["topics"] as unknown[]).filter((t): t is string => typeof t === "string") : [],
  };
}

function renderList(items: StarredRepo[]): string {
  if (items.length === 0) {
    return `<p class="oldgh-stars__empty">${octicon("star", { size: 36 })} No starred repositories yet.</p>`;
  }
  return `
    <ul class="oldgh-stars__list">
      ${items.map(renderRow).join("")}
    </ul>
  `;
}

function renderRow(r: StarredRepo): string {
  return `
    <li class="oldgh-stars__row">
      <h2 class="oldgh-stars__name">
        <img class="oldgh-stars__avatar" src="${escapeAttr(r.ownerAvatar)}" width="20" height="20" alt="" />
        <a href="/${escapeAttr(r.ownerLogin)}">${escapeText(r.ownerLogin)}</a> /
        <a href="/${escapeAttr(r.ownerLogin)}/${escapeAttr(r.repoName)}"><strong>${escapeText(r.repoName)}</strong></a>
        ${r.isPrivate ? `<span class="oldgh-search__tag">Private</span>` : ""}
        ${r.isFork ? `<span class="oldgh-search__tag">Fork</span>` : ""}
        ${r.isArchived ? `<span class="oldgh-search__tag oldgh-search__tag--warn">Archived</span>` : ""}
      </h2>
      ${r.description ? `<p class="oldgh-stars__desc">${escapeText(r.description)}</p>` : ""}
      ${r.topics.length > 0 ? `<p class="oldgh-stars__topics">${r.topics.slice(0, 6).map((t) => `<a class="oldgh-search__topic" href="/topics/${escapeAttr(t)}">${escapeText(t)}</a>`).join(" ")}</p>` : ""}
      <ul class="oldgh-stars__meta">
        ${r.language ? `<li><span class="oldgh-search__lang-dot" style="background:${languageColor(r.language)}"></span>${escapeText(r.language)}</li>` : ""}
        <li>${octicon("star", { size: 12 })} ${formatCount(r.stars)}</li>
        <li>${octicon("repo-forked", { size: 12 })} ${formatCount(r.forks)}</li>
        ${r.starredAt ? `<li>Starred ${escapeText(formatDate(r.starredAt))}</li>` : ""}
        ${r.updatedAt ? `<li>Updated ${escapeText(formatDate(r.updatedAt))}</li>` : ""}
      </ul>
    </li>
  `;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
