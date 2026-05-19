import { octicon } from "@/icons";
import { fetchApi } from "@/adapters/rate-limit";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-topic";

type TopicMeta = {
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  description: string | null;
  createdBy: string | null;
  released: string | null;
  url: string | null;
  wikipediaUrl: string | null;
  featured: boolean;
  curated: boolean;
};

type TopicRepo = {
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  repoName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  htmlUrl: string;
  isPrivate: boolean;
};

export async function mountTopic(pathname: string, search: string): Promise<void> {
  const segs = pathname.split("/").filter(Boolean);
  const slug = segs[1] || "";
  if (!slug) {
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.innerHTML = `<div class="oldgh-page"><p class="oldgh-topic__empty">No topic selected.</p></div>`;
    adoptBodyRoot(root);
    return;
  }

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(slug);
  adoptBodyRoot(root);

  const params = new URLSearchParams(search);
  const sort = params.get("s") ?? params.get("sort") ?? "stars";
  const order = params.get("o") ?? params.get("order") ?? "desc";

  const [meta, repos] = await Promise.all([
    fetchTopicMeta(slug).catch(() => null),
    fetchTopicRepos(slug, sort, order).catch(() => [] as TopicRepo[]),
  ]);

  const heroSlot = root.querySelector<HTMLElement>(".oldgh-topic__hero");
  if (heroSlot) heroSlot.innerHTML = renderHero(slug, meta);
  const reposSlot = root.querySelector<HTMLElement>(".oldgh-topic__repos");
  if (reposSlot) reposSlot.innerHTML = renderRepos(repos);
  bindSort(root);
}

export function unmountTopic(): void {
  removeAllBodyRoots();
}

async function fetchTopicMeta(slug: string): Promise<TopicMeta | null> {
  const resp = await fetchApi(`https://api.github.com/search/topics?q=${encodeURIComponent(slug)}`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github.mercy-preview+json" },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Record<string, unknown>;
  const items = Array.isArray(data["items"]) ? (data["items"] as unknown[]) : [];
  const exact = items.find((it) => {
    if (!it || typeof it !== "object") return false;
    const o = it as Record<string, unknown>;
    return typeof o["name"] === "string" && (o["name"] as string).toLowerCase() === slug.toLowerCase();
  });
  const item = (exact || items[0]) as Record<string, unknown> | undefined;
  if (!item) return null;
  return {
    name: typeof item["name"] === "string" ? (item["name"] as string) : slug,
    displayName: typeof item["display_name"] === "string" ? (item["display_name"] as string) : null,
    shortDescription: typeof item["short_description"] === "string" ? (item["short_description"] as string) : null,
    description: typeof item["description"] === "string" ? (item["description"] as string) : null,
    createdBy: typeof item["created_by"] === "string" ? (item["created_by"] as string) : null,
    released: typeof item["released"] === "string" ? (item["released"] as string) : null,
    url: typeof item["url"] === "string" ? (item["url"] as string) : null,
    wikipediaUrl: typeof item["repository_url"] === "string" ? (item["repository_url"] as string) : null,
    featured: item["featured"] === true,
    curated: item["curated"] === true,
  };
}

async function fetchTopicRepos(slug: string, sort: string, order: string): Promise<TopicRepo[]> {
  const params = new URLSearchParams({
    q: `topic:${slug}`,
    per_page: "30",
  });
  if (sort && sort !== "best-match") params.set("sort", sort);
  if (order) params.set("order", order);
  const resp = await fetchApi(`https://api.github.com/search/repositories?${params.toString()}`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github.mercy-preview+json" },
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as Record<string, unknown>;
  const items = Array.isArray(data["items"]) ? (data["items"] as unknown[]) : [];
  return items.map(parseRepo).filter((r): r is TopicRepo => r !== null);
}

function parseRepo(raw: unknown): TopicRepo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fullName = typeof r["full_name"] === "string" ? (r["full_name"] as string) : null;
  if (!fullName) return null;
  const ownerObj = r["owner"] && typeof r["owner"] === "object" ? (r["owner"] as Record<string, unknown>) : null;
  return {
    fullName,
    ownerLogin: (ownerObj && typeof ownerObj["login"] === "string" ? (ownerObj["login"] as string) : fullName.split("/")[0]) ?? "",
    ownerAvatar: (ownerObj && typeof ownerObj["avatar_url"] === "string" ? (ownerObj["avatar_url"] as string) : "") ?? "",
    repoName: (typeof r["name"] === "string" ? (r["name"] as string) : fullName.split("/")[1]) ?? "",
    description: typeof r["description"] === "string" ? (r["description"] as string) : null,
    language: typeof r["language"] === "string" ? (r["language"] as string) : null,
    stars: typeof r["stargazers_count"] === "number" ? (r["stargazers_count"] as number) : 0,
    forks: typeof r["forks_count"] === "number" ? (r["forks_count"] as number) : 0,
    updatedAt: typeof r["updated_at"] === "string" ? (r["updated_at"] as string) : "",
    htmlUrl: (typeof r["html_url"] === "string" ? (r["html_url"] as string) : `https://github.com/${fullName}`),
    isPrivate: r["private"] === true,
  };
}

function renderShell(slug: string): string {
  return `
    <div class="oldgh-page">
      <div class="oldgh-topic__hero">
        <header class="oldgh-topic__hero-loading">
          <h1>${octicon("tag", { size: 22 })} ${escapeText(slug)}</h1>
          <p>Loading topic&hellip;</p>
        </header>
      </div>
      <div class="oldgh-topic__repos">
        <div class="oldgh-topic__loading">Loading repositories&hellip;</div>
      </div>
    </div>
  `;
}

function renderHero(slug: string, meta: TopicMeta | null): string {
  const displayName = meta?.displayName || slug;
  const badges: string[] = [];
  if (meta?.featured) badges.push(`<span class="oldgh-topic__badge oldgh-topic__badge--featured">${octicon("star", { size: 11 })} Featured</span>`);
  if (meta?.curated) badges.push(`<span class="oldgh-topic__badge">Curated</span>`);
  return `
    <header class="oldgh-topic__hero-card">
      <div class="oldgh-topic__hero-main">
        <h1 class="oldgh-topic__title">
          ${octicon("tag", { size: 22 })}
          ${escapeText(displayName)}
          <code class="oldgh-topic__slug">${escapeText(slug)}</code>
        </h1>
        ${badges.length > 0 ? `<div class="oldgh-topic__badges">${badges.join("")}</div>` : ""}
        ${meta?.shortDescription ? `<p class="oldgh-topic__short">${escapeText(meta.shortDescription)}</p>` : ""}
        ${meta?.description && meta?.description !== meta?.shortDescription ? `<p class="oldgh-topic__desc">${escapeText(meta.description.slice(0, 400))}</p>` : ""}
        ${renderMeta(meta)}
      </div>
    </header>
  `;
}

function renderMeta(meta: TopicMeta | null): string {
  if (!meta) return "";
  const bits: string[] = [];
  if (meta.createdBy) bits.push(`Created by <strong>${escapeText(meta.createdBy)}</strong>`);
  if (meta.released) bits.push(`Released <strong>${escapeText(meta.released)}</strong>`);
  if (meta.url) bits.push(`<a href="${escapeAttr(meta.url)}" rel="noreferrer">${octicon("link", { size: 12 })} Website</a>`);
  if (meta.wikipediaUrl) bits.push(`<a href="${escapeAttr(meta.wikipediaUrl)}" rel="noreferrer">${octicon("book", { size: 12 })} Wikipedia</a>`);
  if (bits.length === 0) return "";
  return `<ul class="oldgh-topic__meta">${bits.map((b) => `<li>${b}</li>`).join("")}</ul>`;
}

function renderRepos(items: TopicRepo[]): string {
  if (items.length === 0) {
    return `
      <div class="oldgh-topic__empty">
        ${octicon("repo", { size: 36 })}
        <p>No repositories found for this topic.</p>
      </div>
    `;
  }
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("s") ?? "stars";
  return `
    <div class="oldgh-topic__bar">
      <div class="oldgh-topic__count"><strong>${items.length}+</strong> repositories</div>
      <label class="oldgh-topic__sort">
        <span>Sort:</span>
        <select data-oldgh-topic-sort>
          <option value="stars"${sort === "stars" ? " selected" : ""}>Most stars</option>
          <option value="forks"${sort === "forks" ? " selected" : ""}>Most forks</option>
          <option value="updated"${sort === "updated" ? " selected" : ""}>Recently updated</option>
          <option value="best-match"${sort === "best-match" ? " selected" : ""}>Best match</option>
        </select>
      </label>
    </div>
    <ul class="oldgh-topic__repo-list">
      ${items.map(renderRepoRow).join("")}
    </ul>
  `;
}

function renderRepoRow(r: TopicRepo): string {
  return `
    <li class="oldgh-topic__repo">
      <h2 class="oldgh-topic__repo-title">
        <img class="oldgh-topic__repo-avatar" src="${escapeAttr(r.ownerAvatar)}" width="20" height="20" alt="" />
        <a href="/${escapeAttr(r.ownerLogin)}">${escapeText(r.ownerLogin)}</a>
        <span class="oldgh-topic__repo-slash">/</span>
        <a href="/${escapeAttr(r.ownerLogin)}/${escapeAttr(r.repoName)}"><strong>${escapeText(r.repoName)}</strong></a>
      </h2>
      ${r.description ? `<p class="oldgh-topic__repo-desc">${escapeText(r.description)}</p>` : ""}
      <ul class="oldgh-topic__repo-meta">
        ${r.language ? `<li><span class="oldgh-search__lang-dot" style="background:${languageColor(r.language)}"></span>${escapeText(r.language)}</li>` : ""}
        <li>${octicon("star", { size: 12 })} ${formatCount(r.stars)}</li>
        <li>${octicon("repo-forked", { size: 12 })} ${formatCount(r.forks)}</li>
        ${r.updatedAt ? `<li>Updated ${escapeText(formatDate(r.updatedAt))}</li>` : ""}
      </ul>
    </li>
  `;
}

function bindSort(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>("select[data-oldgh-topic-sort]");
  if (!select) return;
  select.addEventListener("change", () => {
    const params = new URLSearchParams(window.location.search);
    const value = select.value;
    if (value === "best-match") {
      params.delete("s");
      params.delete("o");
    } else {
      params.set("s", value);
      params.set("o", "desc");
    }
    const href = `${window.location.pathname}?${params.toString()}`;
    history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
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

function languageColor(lang: string): string {
  const map: Record<string, string> = {
    "TypeScript": "#2b7489", "JavaScript": "#f1e05a", "Python": "#3572A5", "Rust": "#dea584",
    "Go": "#00ADD8", "Java": "#b07219", "C": "#555555", "C++": "#f34b7d", "C#": "#178600",
    "Ruby": "#701516", "PHP": "#4F5D95", "Swift": "#ffac45", "Kotlin": "#A97BFF", "Shell": "#89e051",
    "HTML": "#e34c26", "CSS": "#563d7c", "Vue": "#41b883",
  };
  return map[lang] ?? "#ccc";
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
