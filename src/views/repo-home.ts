import { octicon } from "@/icons";
import { getRepoOverview, type RepoOverview } from "@/adapters/repo-overview";
import { getRepoLanguages } from "@/adapters/repo";
import { languageColor, canonicalLanguageName } from "@/util/language-color";
import { hydrateTreeTable, renderTreeTable } from "./_tree-table";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-home";

export async function mountRepoHome(owner: string, repo: string): Promise<void> {
  const overview = await getRepoOverview(owner, repo);

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(overview);
  adoptBodyRoot(root, ".oldgh-repo-header");

  bindCloneTabs(root);
  bindCopyButtons(root);

  void hydrateTreeTable(root, {
    owner,
    repo,
    branch: overview.branch,
    basePath: "",
  });

  void hydrateLanguagesBar(root, owner, repo);
}

async function hydrateLanguagesBar(root: HTMLElement, owner: string, repo: string): Promise<void> {
  try {
    const langs = await getRepoLanguages(owner, repo);
    if (langs.length === 0) return;
    const slot = root.querySelector<HTMLElement>(".oldgh-repo-home__langs-slot");
    if (!slot) return;
    slot.innerHTML = renderLanguageBar(langs);
  } catch {
    // ignore — language bar is decorative
  }
}

function renderLanguageBar(langs: Array<{ name: string; bytes: number; percent: number }>): string {
  const top = langs.slice(0, 8).map((l) => ({ ...l, display: canonicalLanguageName(l.name) }));
  const restPercent = langs.slice(8).reduce((s, l) => s + l.percent, 0);
  const segs = top.map((l) => `<span class="oldgh-repo-home__lang-seg" style="width:${l.percent.toFixed(2)}%;background:${languageColor(l.name)}" title="${escapeAttr(l.display)} ${l.percent.toFixed(1)}%"></span>`).join("");
  const otherSeg = restPercent > 0.1 ? `<span class="oldgh-repo-home__lang-seg" style="width:${restPercent.toFixed(2)}%;background:#ccc" title="Other ${restPercent.toFixed(1)}%"></span>` : "";
  const labels = top.map((l) => `<span class="oldgh-repo-home__lang-label"><span class="oldgh-repo-home__lang-dot" style="background:${languageColor(l.name)}"></span>${escapeText(l.display)} <strong>${l.percent.toFixed(1)}%</strong></span>`).join(" ");
  return `
    <div class="oldgh-repo-home__langs">
      <div class="oldgh-repo-home__lang-bar">${segs}${otherSeg}</div>
      <div class="oldgh-repo-home__lang-labels">${labels}${restPercent > 0.1 ? ` <span class="oldgh-repo-home__lang-label"><span class="oldgh-repo-home__lang-dot" style="background:#ccc"></span>Other <strong>${restPercent.toFixed(1)}%</strong></span>` : ""}</div>
    </div>
  `;
}

export function unmountRepoHome(): void {
  removeAllBodyRoots();
}

function renderShell(o: RepoOverview): string {
  return `
    <div class="oldgh-page">
      ${renderTopBar(o)}
      <div class="oldgh-repo-home__langs-slot"></div>
      ${renderTreeTable({ owner: o.owner, repo: o.repo, branch: o.branch, basePath: "" }, o.tree)}
      ${renderReadme(o)}
    </div>
  `;
}

function renderTopBar(o: RepoOverview): string {
  const branchIcon = octicon("git-branch", { size: 14 });
  const commitsIcon = octicon("history", { size: 14 });
  const commits = o.commitCount
    ? `<a class="oldgh-repo-home__commits" href="/${o.owner}/${o.repo}/commits/${escapeAttr(o.branch)}">${commitsIcon}<strong>${escapeText(o.commitCount)}</strong> commits</a>`
    : "";
  return `
    <div class="oldgh-repo-home__topbar">
      <div class="oldgh-repo-home__refbox">
        <button type="button" class="oldgh-btn oldgh-repo-home__branch-btn" aria-haspopup="menu">
          ${branchIcon}
          <span>branch:</span>
          <strong>${escapeText(o.branch)}</strong>
          ${octicon("triangle-down", { className: "oldgh-chevron" })}
        </button>
        ${commits}
      </div>
      ${renderCloneBox(o)}
    </div>
  `;
}

function renderCloneBox(o: RepoOverview): string {
  const tabs: { key: string; label: string; url: string | null }[] = [
    { key: "https", label: "HTTPS", url: o.clone.https },
    { key: "ssh", label: "SSH", url: o.clone.ssh },
    { key: "cli", label: "GitHub CLI", url: o.clone.ghCli },
  ];
  const enabled = tabs.filter((t): t is { key: string; label: string; url: string } => !!t.url);
  if (enabled.length === 0 && !o.clone.zip) return "";

  const first = enabled[0];
  const zipBtn = o.clone.zip
    ? `<a class="oldgh-btn oldgh-repo-home__zip" href="${escapeAttr(o.clone.zip)}">${octicon("cloud-download", { size: 14 })}<span>Download ZIP</span></a>`
    : "";

  if (!first) {
    return `<div class="oldgh-repo-home__clone-actions">${zipBtn}</div>`;
  }

  return `
    <div class="oldgh-repo-home__clone">
      <div class="oldgh-repo-home__clone-tabs" role="tablist">
        ${enabled
          .map(
            (t, i) =>
              `<button type="button" class="oldgh-repo-home__clone-tab" role="tab" data-tab="${t.key}"${i === 0 ? ' aria-selected="true"' : ""}>${escapeText(t.label)}</button>`,
          )
          .join("")}
      </div>
      <div class="oldgh-repo-home__clone-body">
        ${enabled
          .map(
            (t, i) => `
            <div class="oldgh-repo-home__clone-pane" data-pane="${t.key}"${i === 0 ? "" : " hidden"}>
              <input type="text" readonly value="${escapeAttr(t.url)}" aria-label="${escapeAttr(t.label)} clone URL" />
              <button type="button" class="oldgh-btn oldgh-repo-home__copy" data-copy="${escapeAttr(t.url)}" aria-label="Copy to clipboard">${octicon("clippy", { size: 14 })}</button>
            </div>`,
          )
          .join("")}
      </div>
      <div class="oldgh-repo-home__clone-actions">${zipBtn}</div>
    </div>
  `;
}

function renderReadme(o: RepoOverview): string {
  if (!o.readme) return "";
  return `
    <section class="oldgh-repo-home__readme">
      <div class="oldgh-repo-home__readme-head">
        ${octicon("book", { size: 16 })}
        <a href="/${o.owner}/${o.repo}/blob/${encodeURIComponent(o.branch)}/${escapeAttr(pathSegments(o.readme.path))}">${escapeText(o.readme.path)}</a>
      </div>
      <div class="oldgh-repo-home__readme-body">${sanitizeBodyHtml(o.readme.html)}</div>
    </section>
  `;
}

function pathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function bindCloneTabs(root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    const tab = (e.target as Element | null)?.closest<HTMLButtonElement>(".oldgh-repo-home__clone-tab");
    if (!tab) return;
    const key = tab.dataset["tab"];
    if (!key) return;
    root.querySelectorAll<HTMLElement>(".oldgh-repo-home__clone-tab").forEach((t) => {
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    root.querySelectorAll<HTMLElement>(".oldgh-repo-home__clone-pane").forEach((p) => {
      p.hidden = p.dataset["pane"] !== key;
    });
  });
}

function bindCopyButtons(root: HTMLElement): void {
  root.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>(".oldgh-repo-home__copy");
    if (!btn) return;
    const text = btn.dataset["copy"];
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      const prev = btn.innerHTML;
      btn.innerHTML = octicon("check", { size: 14 });
      window.setTimeout(() => {
        btn.innerHTML = prev;
      }, 1200);
    });
  });
}

function sanitizeBodyHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href=(["'])https?:\/\/github\.com(\/[^"']*)\1/gi, 'href=$1$2$1');
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
