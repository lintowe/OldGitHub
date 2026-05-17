import { scrapeSection, type ScrapedSection } from "@/adapters/repo-section";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-section";

export type SectionKind = "pulse" | "graphs" | "projects" | "security" | "discussions" | "other";

export async function mountRepoSection(
  owner: string,
  repo: string,
  kind: SectionKind,
  subPath: string,
  titleFallback: string,
): Promise<void> {
  const view = await scrapeSection(owner, repo, subPath, { titleFallback });

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
  adoptBodyRoot(root, ".oldgh-repo-header");
}

export function unmountRepoSection(): void {
  removeAllBodyRoots();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
