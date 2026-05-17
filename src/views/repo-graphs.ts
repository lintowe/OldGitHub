import {
  getRepoContributors,
  getRepoCommitActivity,
  getRepoCodeFrequency,
  type ContributorsView,
  type ContributorEntry,
  type CommitActivityView,
  type CodeFrequencyView,
} from "@/adapters/repo-graphs";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";
import { renderInsightsNav } from "./repo-pulse";

const ROOT_CLASS = "oldgh-repo-graphs";

export type GraphsSubkind = "contributors" | "commit-activity" | "code-frequency" | "traffic";

export async function mountRepoGraphs(owner: string, repo: string, subkind: GraphsSubkind): Promise<void> {
  const root = document.createElement("div");
  root.className = `${ROOT_CLASS} ${ROOT_CLASS}--${subkind}`;
  root.innerHTML = renderShell(subkind);
  adoptBodyRoot(root, ".oldgh-repo-header");

  const main = root.querySelector<HTMLElement>(".oldgh-graphs__main");
  if (!main) return;
  try {
    if (subkind === "contributors") {
      const view = await getRepoContributors(owner, repo);
      main.innerHTML = renderContributors(view);
    } else if (subkind === "commit-activity") {
      const view = await getRepoCommitActivity(owner, repo);
      main.innerHTML = renderCommitActivity(view);
    } else if (subkind === "code-frequency") {
      const view = await getRepoCodeFrequency(owner, repo);
      main.innerHTML = renderCodeFrequency(view);
    } else {
      main.innerHTML = `<div class="oldgh-graphs__empty">${escapeText(graphTitle(subkind))} view isn't built natively yet — open the modern GitHub page <a href="/${escapeAttr(owner)}/${escapeAttr(repo)}/graphs/${escapeAttr(subkind)}">here</a>.</div>`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/422/.test(msg)) {
      main.innerHTML = `<div class="oldgh-graphs__empty">This repository is too large for the stats endpoint to return — open the modern view <a href="/${escapeAttr(owner)}/${escapeAttr(repo)}/graphs/${escapeAttr(subkind)}">here</a>.</div>`;
    } else {
      main.innerHTML = `<div class="oldgh-graphs__empty">Couldn't load: ${escapeText(msg)}</div>`;
    }
  }
}

export function unmountRepoGraphs(): void {
  removeAllBodyRoots();
}

function renderShell(subkind: GraphsSubkind): string {
  return `
    <div class="oldgh-page">
      <div class="oldgh-pulse__layout">
        <aside class="oldgh-pulse__sidebar">
          ${renderInsightsNav(subkind)}
        </aside>
        <main class="oldgh-graphs__main oldgh-pulse__main">
          <div class="oldgh-graphs__loading">Loading ${escapeText(graphTitle(subkind).toLowerCase())}…</div>
        </main>
      </div>
    </div>
  `;
}

function renderContributors(v: ContributorsView): string {
  if (v.status === "computing") {
    return `
      <div class="oldgh-graphs__empty">
        <p>GitHub is computing contributor stats for this repo. Refresh the page in a moment to see them.</p>
      </div>
    `;
  }
  if (v.entries.length === 0) {
    return `<div class="oldgh-graphs__empty">No contributors recorded for this repository.</div>`;
  }
  const maxCommits = Math.max(1, ...v.entries.map((e) => e.totalCommits));
  return `
    <header class="oldgh-graphs__header">
      <h1>Contributors</h1>
      <p class="oldgh-graphs__sub"><strong>${v.entries.length}</strong> ${v.entries.length === 1 ? "contributor" : "contributors"} ranked by commits</p>
    </header>
    <ol class="oldgh-graphs__contributors">
      ${v.entries.slice(0, 100).map((c, i) => renderContributor(c, i + 1, maxCommits)).join("")}
    </ol>
  `;
}

function renderContributor(c: ContributorEntry, rank: number, maxCommits: number): string {
  const sparkline = renderSparkline(c.weeks);
  return `
    <li class="oldgh-graphs__contrib">
      <span class="oldgh-graphs__rank">#${rank}</span>
      <a class="oldgh-graphs__avatar" href="${escapeAttr(c.htmlUrl)}">
        <img src="${escapeAttr(c.avatarUrl)}" width="40" height="40" alt="" />
      </a>
      <div class="oldgh-graphs__contrib-main">
        <a class="oldgh-graphs__name" href="${escapeAttr(c.htmlUrl)}"><strong>${escapeText(c.login)}</strong></a>
        <div class="oldgh-graphs__contrib-meta">
          <strong>${c.totalCommits.toLocaleString()}</strong> ${c.totalCommits === 1 ? "commit" : "commits"}
          · <span class="oldgh-graphs__add">+${c.totalAdditions.toLocaleString()}</span>
          · <span class="oldgh-graphs__del">−${c.totalDeletions.toLocaleString()}</span>
        </div>
      </div>
      <div class="oldgh-graphs__bar-wrap">
        <div class="oldgh-graphs__bar" style="width:${Math.round((c.totalCommits / maxCommits) * 100)}%"></div>
      </div>
      <div class="oldgh-graphs__spark">${sparkline}</div>
    </li>
  `;
}

function renderSparkline(weeks: Array<{ ts: number; commits: number }>): string {
  if (weeks.length === 0) return "";
  const tail = weeks.slice(-52);
  const max = Math.max(1, ...tail.map((w) => w.commits));
  const bars = tail
    .map((w) => `<span class="oldgh-spark-bar" style="height:${Math.max(2, Math.round((w.commits / max) * 24))}px" title="${w.commits} commits week of ${new Date(w.ts * 1000).toISOString().slice(0, 10)}"></span>`)
    .join("");
  return `<div class="oldgh-spark">${bars}</div>`;
}

function renderCommitActivity(v: CommitActivityView): string {
  if (v.status === "computing") {
    return `<div class="oldgh-graphs__empty"><p>GitHub is computing commit activity stats. Refresh the page in a moment.</p></div>`;
  }
  if (v.weeks.length === 0) {
    return `<div class="oldgh-graphs__empty">No commit activity recorded.</div>`;
  }
  const max = Math.max(1, ...v.weeks.map((w) => w.total));
  const total = v.weeks.reduce((s, w) => s + w.total, 0);
  const avg = Math.round(total / Math.max(1, v.weeks.length));
  return `
    <header class="oldgh-graphs__header">
      <h1>Commit activity</h1>
      <p class="oldgh-graphs__sub">
        <strong>${total.toLocaleString()}</strong> commits over the last 52 weeks
        · average <strong>${avg}</strong> per week
      </p>
    </header>
    <div class="oldgh-graphs__activity">
      ${renderActivityChart(v.weeks, max)}
      <ol class="oldgh-graphs__week-list">
        ${v.weeks.slice().reverse().slice(0, 12).map(renderWeekRow).join("")}
      </ol>
    </div>
  `;
}

function renderActivityChart(weeks: CommitActivityView["weeks"], max: number): string {
  const bars = weeks
    .map((w) => `<span class="oldgh-activity-bar" style="height:${Math.max(2, Math.round((w.total / max) * 110))}px" title="${w.total} commits — week of ${formatWeek(w.ts)}"></span>`)
    .join("");
  return `<div class="oldgh-activity-chart">${bars}</div>`;
}

function renderWeekRow(w: CommitActivityView["weeks"][number]): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peak = Math.max(0, ...w.days);
  const days = w.days
    .map((c, i) => `<span class="oldgh-week-day" title="${escapeText(dayNames[i] ?? "")}: ${c} commits"><span class="oldgh-week-day-bar" style="height:${peak > 0 ? Math.max(2, Math.round((c / peak) * 18)) : 2}px"></span></span>`)
    .join("");
  return `
    <li class="oldgh-graphs__week-row">
      <span class="oldgh-graphs__week-date">Week of ${escapeText(formatWeek(w.ts))}</span>
      <span class="oldgh-graphs__week-count">${w.total} commits</span>
      <div class="oldgh-week-days">${days}</div>
    </li>
  `;
}

function renderCodeFrequency(v: CodeFrequencyView): string {
  if (v.status === "computing") {
    return `<div class="oldgh-graphs__empty"><p>GitHub is computing code frequency stats. Refresh the page in a moment.</p></div>`;
  }
  if (v.points.length === 0) {
    return `<div class="oldgh-graphs__empty">No code frequency data recorded.</div>`;
  }
  const totalAdd = v.points.reduce((s, p) => s + p.additions, 0);
  const totalDel = v.points.reduce((s, p) => s + Math.abs(p.deletions), 0);
  const maxAbs = Math.max(1, ...v.points.map((p) => Math.max(p.additions, Math.abs(p.deletions))));
  return `
    <header class="oldgh-graphs__header">
      <h1>Code frequency</h1>
      <p class="oldgh-graphs__sub">
        Total <span class="oldgh-graphs__add">+${totalAdd.toLocaleString()}</span>
        / <span class="oldgh-graphs__del">−${totalDel.toLocaleString()}</span>
        across <strong>${v.points.length}</strong> weeks
      </p>
    </header>
    <div class="oldgh-codefreq">
      ${renderCodeFreqChart(v.points, maxAbs)}
      <div class="oldgh-codefreq__legend">
        <span><span class="oldgh-codefreq__swatch oldgh-codefreq__swatch--add"></span> Additions</span>
        <span><span class="oldgh-codefreq__swatch oldgh-codefreq__swatch--del"></span> Deletions</span>
      </div>
    </div>
  `;
}

function renderCodeFreqChart(points: CodeFrequencyView["points"], maxAbs: number): string {
  const tail = points.slice(-104); // up to 2 years
  return `
    <div class="oldgh-codefreq__chart">
      ${tail.map((p) => `
        <div class="oldgh-codefreq__col" title="Week of ${formatWeek(p.ts)} — +${p.additions} / −${Math.abs(p.deletions)}">
          <span class="oldgh-codefreq__add" style="height:${Math.round((p.additions / maxAbs) * 60)}px"></span>
          <span class="oldgh-codefreq__zero"></span>
          <span class="oldgh-codefreq__del" style="height:${Math.round((Math.abs(p.deletions) / maxAbs) * 60)}px"></span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatWeek(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function graphTitle(subkind: GraphsSubkind): string {
  switch (subkind) {
    case "contributors": return "Contributors";
    case "commit-activity": return "Commit activity";
    case "code-frequency": return "Code frequency";
    case "traffic": return "Traffic";
  }
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
