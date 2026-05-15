import { octicon } from "@/icons";
import { getCommit, type CommitView, type PersonRef } from "@/adapters/repo-commit";
import { absoluteTime, relativeTime } from "@/util/time";
import type { DiffFile, DiffHunk, DiffLine } from "@/util/diff";

const ROOT_CLASS = "oldgh-repo-commit";

export async function mountRepoCommit(owner: string, repo: string, sha: string): Promise<void> {
  let view: CommitView;
  try {
    view = await getCommit(owner, repo, sha);
  } catch (err) {
    unmountRepoCommit();
    throw err;
  }

  unmountRepoCommit();
  document.documentElement.setAttribute("data-oldgh-hide-modern-repo-body", "");

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(view);
  const after = document.querySelector(".oldgh-repo-header");
  if (after && after.parentNode) {
    after.after(root);
  } else {
    document.body.append(root);
  }
}

export function unmountRepoCommit(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function renderShell(c: CommitView): string {
  const totalAdditions = c.files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = c.files.reduce((s, f) => s + f.deletions, 0);
  return `
    <div class="oldgh-page">
      ${renderHeader(c)}
      <div class="oldgh-repo-commit__stats">
        <span><strong>${c.files.length}</strong> file${c.files.length === 1 ? "" : "s"} changed</span>
        <span class="oldgh-repo-commit__stats-sep">·</span>
        <span class="oldgh-repo-commit__add">+${totalAdditions}</span>
        <span class="oldgh-repo-commit__del">-${totalDeletions}</span>
      </div>
      ${c.files.map((f) => renderFile(f)).join("")}
    </div>
  `;
}

function renderHeader(c: CommitView): string {
  const shortOid = c.oid.slice(0, 7);
  const author = c.authors[0];
  const commBy = c.committer && (!author || c.committer.login !== author.login)
    ? `, committed by <a href="${escapeAttr(c.committer.path)}"><strong>${escapeText(c.committer.displayName)}</strong></a>`
    : "";
  const parents = c.parents.length > 0
    ? `<div class="oldgh-repo-commit__parents">
        ${c.parents.length === 2 ? "merge of " : "parent "}${c.parents
          .map((p) => `<a href="/${escapeAttr(c.url.split("/").slice(1, 3).join("/"))}/commit/${escapeAttr(p)}"><code>${escapeText(p.slice(0, 7))}</code></a>`)
          .join(" + ")}
      </div>`
    : "";

  return `
    <div class="oldgh-repo-commit__header">
      <div class="oldgh-repo-commit__title-row">
        <h1 class="oldgh-repo-commit__title">${escapeText(c.shortMessage)}</h1>
        <a class="oldgh-btn oldgh-repo-commit__sha" href="${escapeAttr(c.url)}" title="${escapeAttr(c.oid)}"><code>${escapeText(shortOid)}</code></a>
      </div>
      ${c.bodyMessageHtml ? `<pre class="oldgh-repo-commit__body">${escapeText(c.bodyMessageHtml)}</pre>` : ""}
      <div class="oldgh-repo-commit__meta">
        ${renderAuthor(author)}${commBy}
        on <a href="${escapeAttr(c.url)}" title="${escapeAttr(absoluteTime(c.committedDate))}">${escapeText(relativeTime(c.committedDate))}</a>
      </div>
      ${parents}
    </div>
  `;
}

function renderAuthor(a: PersonRef | undefined): string {
  if (!a) return "";
  return `<img class="oldgh-repo-commit__avatar" src="${escapeAttr(a.avatarUrl)}" alt="" width="20" height="20" /> <a href="${escapeAttr(a.path)}"><strong>${escapeText(a.displayName)}</strong></a> authored`;
}

function renderFile(f: DiffFile): string {
  const statusBadge = f.status === "added"
    ? '<span class="oldgh-repo-commit__file-status oldgh-repo-commit__file-status--added">added</span>'
    : f.status === "deleted"
      ? '<span class="oldgh-repo-commit__file-status oldgh-repo-commit__file-status--deleted">deleted</span>'
      : f.status === "renamed"
        ? '<span class="oldgh-repo-commit__file-status oldgh-repo-commit__file-status--renamed">renamed</span>'
        : f.status === "binary"
          ? '<span class="oldgh-repo-commit__file-status">binary</span>'
          : "";
  return `
    <section class="oldgh-repo-commit__file">
      <div class="oldgh-repo-commit__file-head">
        <span class="oldgh-repo-commit__file-path">${escapeText(f.path)}</span>
        ${statusBadge}
        <span class="oldgh-repo-commit__file-counts">
          <span class="oldgh-repo-commit__add">+${f.additions}</span>
          <span class="oldgh-repo-commit__del">-${f.deletions}</span>
        </span>
      </div>
      ${f.isBinary
        ? `<div class="oldgh-repo-commit__binary">${escapeText(f.binaryNote ?? "Binary file changed")}</div>`
        : renderHunks(f.hunks)}
    </section>
  `;
}

function renderHunks(hunks: DiffHunk[]): string {
  if (hunks.length === 0) return "";
  return `
    <table class="oldgh-diff">
      ${hunks.map((h) => renderHunk(h)).join("")}
    </table>
  `;
}

function renderHunk(h: DiffHunk): string {
  const headerRow = `
    <tr class="oldgh-diff__hunk-header">
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__code">@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@ ${escapeText(h.header)}</td>
    </tr>
  `;
  return headerRow + h.lines.map((l) => renderLine(l)).join("");
}

function renderLine(l: DiffLine): string {
  if (l.kind === "no-newline") {
    return `<tr class="oldgh-diff__row oldgh-diff__row--no-newline">
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__code">${escapeText(l.text)}</td>
    </tr>`;
  }
  if (l.kind === "add") {
    return `<tr class="oldgh-diff__row oldgh-diff__row--add">
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__num">${l.new}</td>
      <td class="oldgh-diff__code"><span class="oldgh-diff__sign">+</span>${escapeText(l.text)}</td>
    </tr>`;
  }
  if (l.kind === "del") {
    return `<tr class="oldgh-diff__row oldgh-diff__row--del">
      <td class="oldgh-diff__num">${l.old}</td>
      <td class="oldgh-diff__num"></td>
      <td class="oldgh-diff__code"><span class="oldgh-diff__sign">-</span>${escapeText(l.text)}</td>
    </tr>`;
  }
  return `<tr class="oldgh-diff__row">
    <td class="oldgh-diff__num">${l.old}</td>
    <td class="oldgh-diff__num">${l.new}</td>
    <td class="oldgh-diff__code"><span class="oldgh-diff__sign"> </span>${escapeText(l.text)}</td>
  </tr>`;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
