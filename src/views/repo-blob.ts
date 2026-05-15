import { octicon } from "@/icons";
import { getRepoBlob, type RepoBlobView } from "@/adapters/repo-overview";
import { highlightFile } from "@/highlight";

const ROOT_CLASS = "oldgh-repo-blob";

export async function mountRepoBlob(owner: string, repo: string, refAndPath: string): Promise<void> {
  let view: RepoBlobView;
  try {
    view = await getRepoBlob(owner, repo, refAndPath);
  } catch (err) {
    unmountRepoBlob();
    throw err;
  }

  unmountRepoBlob();
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

  if (!view.isBinary && view.rawLines.length > 0) {
    void hydrateHighlight(root, view);
  }
}

async function hydrateHighlight(root: HTMLElement, view: RepoBlobView): Promise<void> {
  const result = await highlightFile(view.rawLines.join("\n"), view.language);
  if (!result) return;
  const codeCells = root.querySelectorAll<HTMLTableCellElement>("td.oldgh-repo-blob__code");
  for (let i = 0; i < codeCells.length && i < result.lines.length; i++) {
    codeCells[i]!.innerHTML = result.lines[i]!;
  }
  root.classList.add(`oldgh-hljs-${result.language}`);
  root.classList.add("oldgh-hljs");
}

export function unmountRepoBlob(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function renderShell(v: RepoBlobView): string {
  return `
    <div class="oldgh-page">
      ${renderBreadcrumb(v)}
      <div class="oldgh-repo-blob__file">
        ${renderFileHeader(v)}
        ${v.isBinary ? renderBinary(v) : v.truncated ? renderTruncated(v) : renderSource(v)}
      </div>
    </div>
  `;
}

function renderBreadcrumb(v: RepoBlobView): string {
  const parts = v.path.split("/").filter(Boolean);
  const branchIcon = octicon("git-branch", { size: 14 });
  const pieces: string[] = [];
  pieces.push(`<span class="oldgh-breadcrumb__ref">${branchIcon}<strong>${escapeText(v.branch)}</strong></span>`);
  pieces.push(`<span class="oldgh-breadcrumb__sep">/</span>`);
  pieces.push(`<a class="oldgh-breadcrumb__seg" href="/${v.owner}/${v.repo}">${escapeText(v.repo)}</a>`);
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    acc = acc ? `${acc}/${seg}` : seg;
    pieces.push(`<span class="oldgh-breadcrumb__sep">/</span>`);
    if (i === parts.length - 1) {
      pieces.push(`<span class="oldgh-breadcrumb__seg oldgh-breadcrumb__seg--current">${escapeText(seg)}</span>`);
    } else {
      const href = `/${v.owner}/${v.repo}/tree/${encodeURIComponent(v.branch)}/${acc.split("/").map(encodeURIComponent).join("/")}`;
      pieces.push(`<a class="oldgh-breadcrumb__seg" href="${escapeAttr(href)}">${escapeText(seg)}</a>`);
    }
  }
  return `<div class="oldgh-breadcrumb">${pieces.join("")}</div>`;
}

function renderFileHeader(v: RepoBlobView): string {
  const lineCount = v.rawLines.length;
  const byteSize = v.isBinary ? "binary" : formatBytes(v.rawLines.reduce((s, l) => s + l.length + 1, 0));
  const lang = v.language ? `<span class="oldgh-repo-blob__lang">${escapeText(v.language)}</span>` : "";
  const raw = v.rawBlobUrl
    ? `<a class="oldgh-btn" href="${escapeAttr(v.rawBlobUrl)}">${octicon("file-binary", { size: 14 })}<span>Raw</span></a>`
    : "";
  const blame = `<a class="oldgh-btn" href="/${v.owner}/${v.repo}/blame/${encodeURIComponent(v.branch)}/${pathSegments(v.path)}">${octicon("versions", { size: 14 })}<span>Blame</span></a>`;
  const history = `<a class="oldgh-btn" href="/${v.owner}/${v.repo}/commits/${encodeURIComponent(v.branch)}/${pathSegments(v.path)}">${octicon("history", { size: 14 })}<span>History</span></a>`;

  return `
    <div class="oldgh-repo-blob__file-header">
      <div class="oldgh-repo-blob__meta">
        ${v.isBinary ? "" : `<span>${lineCount} line${lineCount === 1 ? "" : "s"}</span><span class="oldgh-repo-blob__sep">·</span>`}
        <span>${byteSize}</span>
        ${lang ? `<span class="oldgh-repo-blob__sep">·</span>${lang}` : ""}
      </div>
      <div class="oldgh-repo-blob__actions">${raw}${blame}${history}</div>
    </div>
  `;
}

function renderSource(v: RepoBlobView): string {
  const rows: string[] = [];
  for (let i = 0; i < v.rawLines.length; i++) {
    const n = i + 1;
    rows.push(`<tr id="L${n}"><td class="oldgh-repo-blob__num"><a href="#L${n}">${n}</a></td><td class="oldgh-repo-blob__code">${escapeText(v.rawLines[i]!)}</td></tr>`);
  }
  return `
    <table class="oldgh-repo-blob__table">
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function renderBinary(v: RepoBlobView): string {
  return `
    <div class="oldgh-repo-blob__binary">
      <p>This file is a binary and cannot be displayed inline.</p>
      ${v.rawBlobUrl ? `<a class="oldgh-btn" href="${escapeAttr(v.rawBlobUrl)}">${octicon("cloud-download", { size: 14 })}<span>Download</span></a>` : ""}
    </div>
  `;
}

function renderTruncated(v: RepoBlobView): string {
  return `
    <div class="oldgh-repo-blob__truncated">
      <p>This file has been truncated. ${v.rawBlobUrl ? `<a href="${escapeAttr(v.rawBlobUrl)}">View raw</a>.` : ""}</p>
      ${renderSource(v)}
    </div>
  `;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function pathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
