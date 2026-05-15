import { octicon } from "@/icons";
import { AdapterFailure } from "@/adapters";
import {
  getRepoOverview,
  getTreeCommitInfo,
  type CommitInfo,
  type RepoOverview,
  type TreeItem,
} from "@/adapters/repo-overview";
import { absoluteTime, relativeTime } from "@/util/time";

const ROOT_CLASS = "oldgh-repo-home";

export async function mountRepoHome(owner: string, repo: string): Promise<void> {
  let overview: RepoOverview;
  try {
    overview = await getRepoOverview(owner, repo);
  } catch (err) {
    unmountRepoHome();
    throw err;
  }

  unmountRepoHome();
  document.documentElement.setAttribute("data-oldgh-hide-modern-repo-body", "");

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(overview);
  const after = document.querySelector(".oldgh-repo-header");
  if (after && after.parentNode) {
    after.after(root);
  } else {
    document.body.append(root);
  }

  bindCloneTabs(root);
  bindCopyButtons(root);

  void hydrateCommitInfo(root, owner, repo, overview);
}

export function unmountRepoHome(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function renderShell(o: RepoOverview): string {
  const sorted = sortTree(o.tree);
  return `
    <div class="oldgh-page">
      ${renderTopBar(o)}
      ${renderTreeTable(o, sorted)}
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

function sortTree(items: TreeItem[]): TreeItem[] {
  const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;
  return [...items].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return cmp(a.name, b.name);
  });
}

function renderTreeTable(o: RepoOverview, sorted: TreeItem[]): string {
  return `
    <table class="oldgh-table oldgh-repo-home__tree" aria-label="Files">
      <thead>
        <tr>
          <th colspan="3">${escapeText(o.repo)} / <span class="oldgh-fg-muted">${escapeText(o.branch)}</span></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((it) => renderTreeRow(o, it)).join("")}
      </tbody>
    </table>
  `;
}

function renderTreeRow(o: RepoOverview, it: TreeItem): string {
  const iconName = it.isDirectory ? "file-directory" : "file";
  const href = it.isDirectory
    ? `/${o.owner}/${o.repo}/tree/${encodeURIComponent(o.branch)}/${pathSegments(it.path)}`
    : `/${o.owner}/${o.repo}/blob/${encodeURIComponent(o.branch)}/${pathSegments(it.path)}`;
  return `
    <tr data-path="${escapeAttr(it.path)}">
      <td class="oldgh-repo-home__cell-icon">
        ${octicon(iconName, { size: 16 })}
      </td>
      <td class="oldgh-repo-home__cell-name">
        <a href="${escapeAttr(href)}">${escapeText(it.name)}</a>
      </td>
      <td class="oldgh-repo-home__cell-msg" data-msg></td>
      <td class="oldgh-repo-home__cell-age" data-age></td>
    </tr>
  `;
}

function pathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
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

async function hydrateCommitInfo(
  root: HTMLElement,
  owner: string,
  repo: string,
  o: RepoOverview,
): Promise<void> {
  let info: Record<string, CommitInfo>;
  try {
    info = await getTreeCommitInfo(owner, repo, o.branch);
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] tree-commit-info failure:", err.message);
      return;
    }
    throw err;
  }

  root.querySelectorAll<HTMLTableRowElement>("tr[data-path]").forEach((row) => {
    const path = row.dataset["path"];
    if (!path) return;
    const ci = info[path];
    if (!ci) return;
    const msgCell = row.querySelector<HTMLTableCellElement>("[data-msg]");
    const ageCell = row.querySelector<HTMLTableCellElement>("[data-age]");
    if (msgCell) msgCell.innerHTML = ci.shortMessageHtmlLink;
    if (ageCell) {
      ageCell.textContent = relativeTime(ci.date);
      ageCell.title = absoluteTime(ci.date);
    }
  });
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
