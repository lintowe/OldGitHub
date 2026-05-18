import { octicon } from "@/icons";
import { fetchApi } from "@/adapters/rate-limit";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-trending";

type TrendingRepo = {
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  repoName: string;
  description: string | null;
  language: string | null;
  languageColor: string | null;
  stars: number;
  forks: number;
  starsInPeriod: number | null;
  createdAt: string;
  htmlUrl: string;
};

type TrendingPeriod = "daily" | "weekly" | "monthly";

export async function mountTrending(_pathname: string, search: string): Promise<void> {
  const root = document.createElement("div");
  root.className = ROOT_CLASS;

  const params = new URLSearchParams(search);
  const period: TrendingPeriod = (params.get("since") as TrendingPeriod) || "weekly";
  const language = params.get("language") ?? "";

  root.innerHTML = renderShell(period, language);
  adoptBodyRoot(root);

  const main = root.querySelector<HTMLElement>(".oldgh-trending__list-wrap");
  if (!main) return;

  try {
    const items = await fetchTrending(period, language);
    main.innerHTML = renderList(items);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rate-?limit|status 40[39]|status 429/i.test(msg)) {
      main.innerHTML = `
        <div class="oldgh-trending__empty">
          ${octicon("clock", { size: 36 })}
          <p>You've hit GitHub's anonymous API rate limit. Trending will work again in a few minutes.</p>
          <p><a href="https://github.com/trending${language ? `/${encodeURIComponent(language)}` : ""}?since=${encodeURIComponent(period)}">Open trending on modern GitHub</a></p>
        </div>
      `;
      return;
    }
    main.innerHTML = `<div class="oldgh-trending__empty">Couldn't load trending: ${escapeText(msg)}</div>`;
  }
}

export function unmountTrending(): void {
  removeAllBodyRoots();
}

async function fetchTrending(period: TrendingPeriod, language: string): Promise<TrendingRepo[]> {
  const scraped = await scrapeTrendingHtml(period, language);
  if (scraped.length > 0) return scraped;
  return await searchTrendingFallback(period, language);
}

async function scrapeTrendingHtml(period: TrendingPeriod, language: string): Promise<TrendingRepo[]> {
  const path = language ? `/trending/${encodeURIComponent(language)}` : "/trending";
  const url = `https://github.com${path}?since=${encodeURIComponent(period)}`;
  try {
    const resp = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } });
    if (!resp.ok) return [];
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = doc.querySelectorAll<HTMLElement>("article.Box-row");
    const out: TrendingRepo[] = [];
    for (const row of Array.from(rows)) {
      const heading = row.querySelector<HTMLAnchorElement>("h2 a, h3 a");
      const href = heading?.getAttribute("href") || "";
      if (!href) continue;
      const slug = href.replace(/^\/+/, "");
      const [owner, repoName] = slug.split("/");
      if (!owner || !repoName) continue;
      const description = row.querySelector<HTMLElement>("p")?.textContent?.trim() || null;
      const langEl = row.querySelector<HTMLElement>("[itemprop='programmingLanguage']");
      const language = langEl?.textContent?.trim() || null;
      const dot = row.querySelector<HTMLElement>(".repo-language-color");
      const languageColor = dot?.style.backgroundColor || null;
      const starsAnchor = row.querySelector<HTMLAnchorElement>(`a[href$="/${owner}/${repoName}/stargazers"]`);
      const forksAnchor = row.querySelector<HTMLAnchorElement>(`a[href$="/${owner}/${repoName}/forks"]`);
      const momentumEl = row.querySelector<HTMLElement>(".float-sm-right, .d-inline-block.float-sm-right");
      const momentum = momentumEl?.textContent?.trim() || "";
      const starsInPeriod = parseShortCount((momentum.match(/^([\d,.]+\s*[km]?)/i)?.[1] ?? "").replace(/[\s,]/g, ""));
      out.push({
        fullName: `${owner}/${repoName}`,
        ownerLogin: owner,
        ownerAvatar: `https://avatars.githubusercontent.com/${owner}`,
        repoName,
        description,
        language,
        languageColor,
        stars: parseShortCount(starsAnchor?.textContent || "") ?? 0,
        forks: parseShortCount(forksAnchor?.textContent || "") ?? 0,
        starsInPeriod,
        createdAt: "",
        htmlUrl: `https://github.com/${owner}/${repoName}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseShortCount(s: string): number | null {
  const trimmed = s.replace(/[\s,]/g, "").toLowerCase();
  const m = /^([\d.]+)([km])?$/.exec(trimmed);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (Number.isNaN(n)) return null;
  if (m[2] === "k") return Math.round(n * 1000);
  if (m[2] === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

async function searchTrendingFallback(period: TrendingPeriod, language: string): Promise<TrendingRepo[]> {
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let q = `created:>${since}`;
  if (language) q += ` language:${language}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`;
  const resp = await fetchApi(url, { credentials: "omit", headers: { Accept: "application/vnd.github+json" } });
  if (!resp.ok) {
    if (resp.status === 403 || resp.status === 429) throw new Error(`rate-limited (status ${resp.status})`);
    throw new Error(`status ${resp.status}`);
  }
  const data = (await resp.json()) as { items?: unknown[] };
  return (data.items ?? []).map(parseRepo).filter((r): r is TrendingRepo => r !== null);
}

function parseRepo(raw: unknown): TrendingRepo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fullName = typeof r["full_name"] === "string" ? (r["full_name"] as string) : null;
  if (!fullName) return null;
  const owner = r["owner"] && typeof r["owner"] === "object" ? (r["owner"] as Record<string, unknown>) : null;
  return {
    fullName,
    ownerLogin: (owner && typeof owner["login"] === "string" ? (owner["login"] as string) : fullName.split("/")[0]) ?? "",
    ownerAvatar: (owner && typeof owner["avatar_url"] === "string" ? (owner["avatar_url"] as string) : "") ?? "",
    repoName: (typeof r["name"] === "string" ? (r["name"] as string) : fullName.split("/")[1]) ?? "",
    description: typeof r["description"] === "string" ? (r["description"] as string) : null,
    language: typeof r["language"] === "string" ? (r["language"] as string) : null,
    languageColor: null,
    stars: typeof r["stargazers_count"] === "number" ? (r["stargazers_count"] as number) : 0,
    forks: typeof r["forks_count"] === "number" ? (r["forks_count"] as number) : 0,
    starsInPeriod: null,
    createdAt: typeof r["created_at"] === "string" ? (r["created_at"] as string) : "",
    htmlUrl: (typeof r["html_url"] === "string" ? (r["html_url"] as string) : `https://github.com/${fullName}`),
  };
}

function renderShell(period: TrendingPeriod, language: string): string {
  const periodTabs: Array<{ key: TrendingPeriod; label: string }> = [
    { key: "daily", label: "Today" },
    { key: "weekly", label: "This week" },
    { key: "monthly", label: "This month" },
  ];
  return `
    <div class="oldgh-page">
      <header class="oldgh-trending__header">
        <h1>Trending</h1>
        <p class="oldgh-trending__sub">See what the GitHub community is most excited about ${escapeText(period === "daily" ? "today" : period === "weekly" ? "this week" : "this month")}.</p>
      </header>
      <div class="oldgh-trending__bar">
        <nav class="oldgh-trending__tabs">
          ${periodTabs.map((t) => `<a class="${period === t.key ? "is-active" : ""}" href="/trending?since=${t.key}${language ? `&language=${encodeURIComponent(language)}` : ""}">${escapeText(t.label)}</a>`).join("")}
        </nav>
        <form class="oldgh-trending__lang" action="/trending" method="get">
          <input type="hidden" name="since" value="${escapeAttr(period)}" />
          <label>Language: <input name="language" value="${escapeAttr(language)}" placeholder="any" /></label>
          <button type="submit" class="oldgh-btn">Filter</button>
        </form>
      </div>
      <div class="oldgh-trending__list-wrap">
        <div class="oldgh-trending__loading">Loading trending repositories…</div>
      </div>
    </div>
  `;
}

function renderList(items: TrendingRepo[]): string {
  if (items.length === 0) {
    return `<div class="oldgh-trending__empty">No matching repositories found.</div>`;
  }
  return `
    <ol class="oldgh-trending__list">
      ${items.map((r, i) => renderRow(r, i + 1)).join("")}
    </ol>
  `;
}

function renderRow(r: TrendingRepo, rank: number): string {
  const langDot = r.language
    ? `<li><span class="oldgh-search__lang-dot" style="background:${r.languageColor || languageColor(r.language)}"></span>${escapeText(r.language)}</li>`
    : "";
  const periodLine = r.starsInPeriod && r.starsInPeriod > 0
    ? `<li class="oldgh-trending__momentum">${octicon("star", { size: 12 })} ${formatCount(r.starsInPeriod)} stars this period</li>`
    : r.createdAt
      ? `<li>Created ${escapeText(formatDate(r.createdAt))}</li>`
      : "";
  return `
    <li class="oldgh-trending__row">
      <span class="oldgh-trending__rank">#${rank}</span>
      <div class="oldgh-trending__main">
        <h2 class="oldgh-trending__name">
          <img class="oldgh-trending__avatar" src="${escapeAttr(r.ownerAvatar)}" width="20" height="20" alt="" />
          <a href="/${escapeAttr(r.ownerLogin)}">${escapeText(r.ownerLogin)}</a> /
          <a href="${escapeAttr(r.htmlUrl)}"><strong>${escapeText(r.repoName)}</strong></a>
        </h2>
        ${r.description ? `<p class="oldgh-trending__desc">${escapeText(r.description)}</p>` : ""}
        <ul class="oldgh-trending__meta">
          ${langDot}
          <li>${octicon("star", { size: 12 })} ${formatCount(r.stars)}</li>
          <li>${octicon("repo-forked", { size: 12 })} ${formatCount(r.forks)}</li>
          ${periodLine}
        </ul>
      </div>
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
