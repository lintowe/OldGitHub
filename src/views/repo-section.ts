import { scrapeSection, type ScrapedSection } from "@/adapters/repo-section";

const ROOT_CLASS = "oldgh-repo-section";

export type SectionKind = "pulse" | "graphs" | "projects" | "security";

export async function mountRepoSection(
  owner: string,
  repo: string,
  kind: SectionKind,
  subPath: string,
  titleFallback: string,
): Promise<void> {
  let view: ScrapedSection;
  try {
    view = await scrapeSection(owner, repo, subPath, { titleFallback });
  } catch (err) {
    unmountRepoSection();
    throw err;
  }

  unmountRepoSection();
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
  const after = document.querySelector(".oldgh-repo-header");
  if (after && after.parentNode) {
    after.after(root);
  } else {
    document.body.append(root);
  }
}

export function unmountRepoSection(): void {
  document.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-oldgh-hide-modern-repo-body");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
