import { octicon } from "@/icons";
import { getRepoOverview, type RepoOverview } from "@/adapters/repo-overview";
import { getRepoLanguages } from "@/adapters/repo";
import { languageColor, canonicalLanguageName } from "@/util/language-color";
import { absoluteTime, relativeTime } from "@/util/time";
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
  bindBranchPicker(root, { owner, repo, branch: overview.branch });

  void hydrateTreeTable(root, {
    owner,
    repo,
    branch: overview.branch,
    basePath: "",
  });

  void hydrateLanguagesBar(root, owner, repo);
  void hydrateLatestCommit(root, { owner, repo, branch: overview.branch });
}

type LatestCommitData = {
  sha: string;
  message: string;
  date: string;
  authorLogin: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
};

async function hydrateLatestCommit(
  root: HTMLElement,
  ctx: { owner: string; repo: string; branch: string },
): Promise<void> {
  const slot = root.querySelector<HTMLElement>(".oldgh-repo-home__latest-slot");
  if (!slot) return;
  try {
    const url = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/commits?sha=${encodeURIComponent(ctx.branch)}&per_page=1`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const arr = (await res.json()) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return;
    const data = parseLatestCommit(arr[0]);
    if (!data) return;
    slot.innerHTML = renderLatestCommit(ctx, data);
  } catch (err) {
    console.debug("[oldgh] latest commit fetch failed:", err);
  }
}

function parseLatestCommit(raw: unknown): LatestCommitData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sha = typeof r["sha"] === "string" ? (r["sha"] as string) : "";
  if (!sha) return null;
  const commit = r["commit"] as Record<string, unknown> | undefined;
  const commitAuthor = commit?.["author"] as Record<string, unknown> | undefined;
  const apiAuthor = r["author"] as Record<string, unknown> | undefined;
  const message = typeof commit?.["message"] === "string" ? (commit["message"] as string) : "";
  const date = typeof commitAuthor?.["date"] === "string"
    ? (commitAuthor["date"] as string)
    : typeof (commit?.["committer"] as Record<string, unknown> | undefined)?.["date"] === "string"
      ? ((commit?.["committer"] as Record<string, unknown>)["date"] as string)
      : "";
  return {
    sha,
    message: message.split("\n")[0] ?? "",
    date,
    authorLogin: typeof apiAuthor?.["login"] === "string" ? (apiAuthor["login"] as string) : null,
    authorName: typeof commitAuthor?.["name"] === "string" ? (commitAuthor["name"] as string) : "unknown",
    authorAvatarUrl: typeof apiAuthor?.["avatar_url"] === "string" ? (apiAuthor["avatar_url"] as string) : null,
  };
}

function renderLatestCommit(ctx: { owner: string; repo: string }, c: LatestCommitData): string {
  const commitUrl = `/${ctx.owner}/${ctx.repo}/commit/${c.sha}`;
  const authorHref = c.authorLogin ? `/${c.authorLogin}` : null;
  const displayName = c.authorLogin ?? c.authorName;
  const avatar = c.authorAvatarUrl
    ? `<img class="oldgh-latest-commit__avatar" src="${escapeAttr(c.authorAvatarUrl)}" alt="" width="20" height="20" />`
    : "";
  const author = authorHref
    ? `<a class="oldgh-latest-commit__author" href="${escapeAttr(authorHref)}">${escapeText(displayName)}</a>`
    : `<span class="oldgh-latest-commit__author">${escapeText(displayName)}</span>`;
  const time = c.date
    ? `<time class="oldgh-latest-commit__time" datetime="${escapeAttr(c.date)}" title="${escapeAttr(absoluteTime(c.date))}">${escapeText(relativeTime(c.date))}</time>`
    : "";
  return `
    <div class="oldgh-latest-commit">
      ${avatar}
      ${author}
      <a class="oldgh-latest-commit__message" href="${escapeAttr(commitUrl)}" title="${escapeAttr(c.message)}">${escapeText(c.message)}</a>
      <a class="oldgh-latest-commit__sha" href="${escapeAttr(commitUrl)}" title="${escapeAttr(c.sha)}"><code>${escapeText(c.sha.slice(0, 7))}</code></a>
      ${time}
    </div>
  `;
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
      <div class="oldgh-repo-home__latest-slot"></div>
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
        <details class="oldgh-branch-picker">
          <summary class="oldgh-btn oldgh-branch-picker__button" aria-haspopup="menu">
            ${branchIcon}
            <span>branch:</span>
            <strong>${escapeText(o.branch)}</strong>
            ${octicon("triangle-down", { className: "oldgh-chevron" })}
          </summary>
          <div class="oldgh-branch-picker__panel" role="menu">
            <div class="oldgh-branch-picker__filter">
              <input type="text" placeholder="Filter branches" aria-label="Filter branches" autocomplete="off" />
            </div>
            <ul class="oldgh-branch-picker__list" data-loading="pending">
              <li class="oldgh-branch-picker__status">Loading branches&hellip;</li>
            </ul>
            <a class="oldgh-branch-picker__footer" href="/${o.owner}/${o.repo}/branches">View all branches</a>
          </div>
        </details>
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

const branchCache = new Map<string, string[]>();
let branchPickerOutsideClickInstalled = false;

function installBranchPickerOutsideClick(): void {
  if (branchPickerOutsideClickInstalled) return;
  branchPickerOutsideClickInstalled = true;
  document.addEventListener("click", (e) => {
    document.querySelectorAll<HTMLDetailsElement>(".oldgh-branch-picker[open]").forEach((d) => {
      if (!d.contains(e.target as Node)) d.open = false;
    });
  });
}

function bindBranchPicker(root: HTMLElement, ctx: { owner: string; repo: string; branch: string }): void {
  installBranchPickerOutsideClick();
  const details = root.querySelector<HTMLDetailsElement>(".oldgh-branch-picker");
  if (!details) return;
  const list = details.querySelector<HTMLUListElement>(".oldgh-branch-picker__list");
  const input = details.querySelector<HTMLInputElement>(".oldgh-branch-picker__filter input");

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    if (input) {
      input.value = "";
      // focus after the toggle paint so the input is actually visible
      window.setTimeout(() => input.focus(), 0);
    }
    void loadBranches(list, ctx);
  });

  input?.addEventListener("input", () => {
    if (!list) return;
    const q = input.value.trim().toLowerCase();
    list.querySelectorAll<HTMLElement>("li[data-name]").forEach((li) => {
      const match = q === "" || (li.dataset["name"] ?? "").toLowerCase().includes(q);
      li.hidden = !match;
    });
  });

  details.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      details.open = false;
      (details.querySelector<HTMLElement>("summary"))?.focus();
    }
  });
}

async function loadBranches(list: HTMLUListElement | null, ctx: { owner: string; repo: string; branch: string }): Promise<void> {
  if (!list || list.dataset["loading"] !== "pending") return;
  list.dataset["loading"] = "done";
  const key = `${ctx.owner}/${ctx.repo}`;
  let names = branchCache.get(key);
  if (!names) {
    try {
      const res = await fetch(`https://api.github.com/repos/${ctx.owner}/${ctx.repo}/branches?per_page=100`, { credentials: "include" });
      if (!res.ok) throw new Error(`branches ${res.status}`);
      const data = await res.json() as Array<{ name: string }>;
      names = data.map((b) => b.name);
      // current branch first, then alphabetic
      names.sort((a, b) => {
        if (a === ctx.branch) return -1;
        if (b === ctx.branch) return 1;
        return a.localeCompare(b);
      });
      branchCache.set(key, names);
    } catch (err) {
      console.debug("[oldgh] branch list fetch failed:", err);
      list.innerHTML = `<li class="oldgh-branch-picker__status">Couldn't load branches.</li>`;
      return;
    }
  }
  if (names.length === 0) {
    list.innerHTML = `<li class="oldgh-branch-picker__status">No branches.</li>`;
    return;
  }
  const checkIcon = octicon("check", { size: 14 });
  list.innerHTML = names.map((name) => {
    const isCurrent = name === ctx.branch;
    const href = `/${ctx.owner}/${ctx.repo}/tree/${encodeURIComponent(name)}`;
    return `<li data-name="${escapeAttr(name)}"${isCurrent ? " data-current" : ""}><a href="${escapeAttr(href)}">${isCurrent ? checkIcon : `<span class="oldgh-branch-picker__check-spacer" aria-hidden="true"></span>`}<span class="oldgh-branch-picker__name">${escapeText(name)}</span></a></li>`;
  }).join("");
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
