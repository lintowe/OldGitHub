import { getRepoContributors, type ContributorsView, type ContributorEntry } from "@/adapters/repo-graphs";
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
    } else {
      main.innerHTML = `<div class="oldgh-graphs__empty">${escapeText(graphTitle(subkind))} view isn't built natively yet — open the modern GitHub page <a href="/${escapeAttr(owner)}/${escapeAttr(repo)}/graphs/${escapeAttr(subkind)}">here</a>.</div>`;
    }
  } catch (err) {
    main.innerHTML = `<div class="oldgh-graphs__empty">Couldn't load: ${escapeText(err instanceof Error ? err.message : String(err))}</div>`;
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
