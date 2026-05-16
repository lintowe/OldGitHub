import { octicon } from "@/icons";
import { getRepoOverview, type RepoOverview } from "@/adapters/repo-overview";
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
}

export function unmountRepoHome(): void {
  removeAllBodyRoots();
}

function renderShell(o: RepoOverview): string {
  return `
    <div class="oldgh-page">
      ${renderTopBar(o)}
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
      <div class="oldgh-repo-home__readme-body">${o.readme.html}</div>
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

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
