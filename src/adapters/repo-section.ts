import { AdapterFailure } from "./index";
import { parseRepoPage } from "./_page";

export type ScrapedSection = {
  owner: string;
  repo: string;
  title: string;
  contentHtml: string;
  sourceUrl: string;
};

export async function scrapeSection(
  owner: string,
  repo: string,
  path: string,
  options: { titleFallback: string; selectors?: string[] },
): Promise<ScrapedSection> {
  const sourceUrl = `https://github.com/${owner}/${repo}${path}`;
  const resp = await fetch(sourceUrl, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("scrapeSection", `${sourceUrl} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);

  const candidates = options.selectors ?? [
    "turbo-frame#repo-content-turbo-frame",
    "[data-pjax='#repo-content-pjax-container']",
    "#repo-content-pjax-container",
    "#js-repo-pjax-container",
    "[data-turbo-body]",
    "main #repo-content-turbo-frame",
    ".application-main",
    "main",
  ];

  let main: Element | null = null;
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el && el.innerHTML.trim().length > 100) {
      main = el;
      break;
    }
  }

  if (!main) {
    throw new AdapterFailure("scrapeSection", "no main content found");
  }

  cleanScrapedContent(main);

  const inMainH1 = main.querySelector("h1");
  const titleFromMain = inMainH1?.textContent?.trim() || "";
  const docTitleRaw = doc.querySelector("title")?.textContent?.trim() || "";
  const docTitleClean = docTitleRaw.split("·")[0]?.trim() || "";
  const title = titleFromMain || options.titleFallback || docTitleClean || "Other";

  return {
    owner,
    repo,
    title,
    contentHtml: main.innerHTML,
    sourceUrl,
  };
}

function cleanScrapedContent(el: Element): void {
  const removeSelectors = [
    "header.AppHeader",
    ".AppHeader-globalBar",
    "header[role='banner']",
    "footer",
    "#repository-container-header",
    ".pagehead",
    ".UnderlineNav.js-repo-nav",
    ".js-pjax-loader-bar",
    ".flash",
    "script",
    "style",
  ];
  for (const sel of removeSelectors) {
    el.querySelectorAll(sel).forEach((n) => n.remove());
  }
  // Strip on* event handlers as a precaution.
  for (const node of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  }
}
