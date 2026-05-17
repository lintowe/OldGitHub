import { octicon } from "@/icons";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-trending";

type TrendingRepo = {
  fullName: string;
  ownerLogin: string;
  ownerAvatar: string;
  repoName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
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
    main.innerHTML = `<div class="oldgh-trending__empty">Couldn't load trending: ${escapeText(err instanceof Error ? err.message : String(err))}</div>`;
  }
}

export function unmountTrending(): void {
  removeAllBodyRoots();
}

async function fetchTrending(period: TrendingPeriod, language: string): Promise<TrendingRepo[]> {
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let q = `created:>${since}`;
  if (language) q += ` language:${language}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`;
  const resp = await fetch(url, { credentials: "omit", headers: { Accept: "application/vnd.github+json" } });
  if (!resp.ok) throw new Error(`status ${resp.status}`);
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
    stars: typeof r["stargazers_count"] === "number" ? (r["stargazers_count"] as number) : 0,
    forks: typeof r["forks_count"] === "number" ? (r["forks_count"] as number) : 0,
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
          ${r.language ? `<li><span class="oldgh-search__lang-dot" style="background:${languageColor(r.language)}"></span>${escapeText(r.language)}</li>` : ""}
          <li>${octicon("star", { size: 12 })} ${formatCount(r.stars)}</li>
          <li>${octicon("repo-forked", { size: 12 })} ${formatCount(r.forks)}</li>
          <li>Created ${escapeText(formatDate(r.createdAt))}</li>
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
