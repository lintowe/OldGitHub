import { octicon } from "@/icons";
import { getCompare, type CompareView } from "@/adapters/repo-compare";
import { renderDiffFile, renderDiffSummary } from "./_diff-table";

const ROOT_CLASS = "oldgh-repo-compare";

export async function mountRepoCompare(owner: string, repo: string, range: string): Promise<void> {
  let view: CompareView;
  try {
    view = await getCompare(owner, repo, range);
  } catch (err) {
    unmountRepoCompare();
    throw err;
  }

  unmountRepoCompare();
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

export function unmountRepoCompare(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function renderShell(v: CompareView): string {
  return `
    <div class="oldgh-page">
      ${renderHeader(v)}
      ${renderDiffSummary(v.files)}
      ${v.files.map((f) => renderDiffFile(f)).join("")}
    </div>
  `;
}

function renderHeader(v: CompareView): string {
  const branchIcon = octicon("git-branch", { size: 14 });
  const sep = v.threeDot ? "..." : "..";
  const baseHref = `/${v.owner}/${v.repo}/tree/${encodeURIComponent(v.base)}`;
  const headHref = `/${v.owner}/${v.repo}/tree/${encodeURIComponent(v.head)}`;
  return `
    <div class="oldgh-repo-compare__header">
      <h1 class="oldgh-repo-compare__title">Comparing changes</h1>
      <p class="oldgh-repo-compare__intro">
        Choose two branches to see what's changed or to start a new pull request.
      </p>
      <div class="oldgh-repo-compare__refs">
        <span class="oldgh-breadcrumb__ref">${branchIcon}<span>base:</span> <a href="${escapeAttr(baseHref)}"><strong>${escapeText(v.base)}</strong></a></span>
        <span class="oldgh-repo-compare__sep">${escapeText(sep)}</span>
        <span class="oldgh-breadcrumb__ref">${branchIcon}<span>compare:</span> <a href="${escapeAttr(headHref)}"><strong>${escapeText(v.head)}</strong></a></span>
      </div>
    </div>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
