import { octicon } from "@/icons";
import { getWiki, type WikiView } from "@/adapters/repo-wiki";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-wiki";

export async function mountRepoWiki(owner: string, repo: string, page: string): Promise<void> {
  const view = await getWiki(owner, repo, page);

  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.innerHTML = renderShell(view);
  adoptBodyRoot(root, ".oldgh-repo-header");
}

export function unmountRepoWiki(): void {
  removeAllBodyRoots();
}

function renderShell(v: WikiView): string {
  return `
    <div class="oldgh-page oldgh-wiki">
      <header class="oldgh-wiki__header">
        <h1 class="oldgh-wiki__title">${escapeText(v.pageTitle)}</h1>
        ${v.metaText ? `<p class="oldgh-wiki__meta">${escapeText(v.metaText)}</p>` : ""}
      </header>
      <div class="oldgh-wiki__layout">
        <article class="oldgh-wiki__content markdown-body">
          ${sanitizeBodyHtml(v.bodyHtml)}
        </article>
        <aside class="oldgh-wiki__sidebar">
          <div class="oldgh-wiki__pages">
            <h3>${octicon("list-unordered", { size: 12 })} Pages <span class="oldgh-wiki__pages-count">${v.pages.length}</span></h3>
            <ul>
              ${v.pages.slice(0, 60).map((p) => `<li><a href="${escapeAttr(p.href)}">${escapeText(p.title)}</a></li>`).join("")}
            </ul>
            ${v.pages.length > 60 ? `<p class="oldgh-wiki__pages-more">+${v.pages.length - 60} more pages</p>` : ""}
          </div>
          <div class="oldgh-wiki__clone">
            <h3>${octicon("repo-clone", { size: 12 })} Clone this wiki</h3>
            <input type="text" class="oldgh-input" readonly value="${escapeAttr(v.cloneUrl)}" />
          </div>
        </aside>
      </div>
    </div>
  `;
}

function sanitizeBodyHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
