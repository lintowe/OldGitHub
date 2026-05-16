import { scrapeTopLevel, type TopLevelView } from "@/adapters/top-level";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-top-level";

export type TopLevelKind = "dashboard" | "notifications" | "search" | "issues" | "pulls" | "stars" | "explore" | "trending" | "watching";

export async function mountTopLevel(
  kind: TopLevelKind,
  pathname: string,
  search: string,
  titleFallback: string,
): Promise<void> {
  const view = await scrapeTopLevel(pathname, search, titleFallback);

  const root = document.createElement("div");
  root.className = `${ROOT_CLASS} ${ROOT_CLASS}--${kind}`;
  root.innerHTML = `
    <div class="oldgh-page">
      <header class="oldgh-section__header">
        <h1>${escapeText(view.title)}</h1>
      </header>
      <div class="oldgh-section__content">
        ${view.contentHtml}
      </div>
    </div>
  `;
  adoptBodyRoot(root);
}

export function unmountTopLevel(): void {
  removeAllBodyRoots();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
