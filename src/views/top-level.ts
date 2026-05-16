import { scrapeTopLevel, type TopLevelView } from "@/adapters/top-level";

const ROOT_CLASS = "oldgh-top-level";

export type TopLevelKind = "dashboard" | "notifications" | "search" | "issues" | "pulls" | "stars" | "explore" | "trending" | "watching";

export async function mountTopLevel(
  kind: TopLevelKind,
  pathname: string,
  search: string,
  titleFallback: string,
): Promise<void> {
  let view: TopLevelView;
  try {
    view = await scrapeTopLevel(pathname, search, titleFallback);
  } catch (err) {
    unmountTopLevel();
    throw err;
  }

  unmountTopLevel();
  document.documentElement.setAttribute("data-oldgh-hide-modern-repo-body", "");

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
  document.body.append(root);
}

export function unmountTopLevel(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
