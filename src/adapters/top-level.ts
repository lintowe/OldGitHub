import { AdapterFailure } from "./index";
import { parseRepoPage } from "./_page";

export type TopLevelView = {
  title: string;
  contentHtml: string;
  sourceUrl: string;
};

export async function scrapeTopLevel(
  path: string,
  search: string,
  titleFallback: string,
  selectors?: string[],
): Promise<TopLevelView> {
  const sourceUrl = `https://github.com${path}${search ? "?" + search : ""}`;
  const resp = await fetch(sourceUrl, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("scrapeTopLevel", `${sourceUrl} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);

  const candidates = selectors ?? [
    "main",
    "[data-turbo-body]",
    "#js-pjax-container",
    ".application-main",
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
    throw new AdapterFailure("scrapeTopLevel", "no main content");
  }
  cleanScraped(main);

  const title = pickTitle(doc, titleFallback);
  return { title, contentHtml: main.innerHTML, sourceUrl };
}

function pickTitle(doc: Document, fallback: string): string {
  const candidates = doc.querySelectorAll<HTMLElement>("h1.h2, h1.h3, h1");
  for (const h of Array.from(candidates)) {
    if (h.classList.contains("sr-only")) continue;
    if (h.getAttribute("aria-hidden") === "true") continue;
    if (h.closest("dialog, modal-dialog, .Overlay--hidden, [hidden]")) continue;
    const txt = h.textContent?.trim();
    if (txt) return txt;
  }
  return fallback;
}

function cleanScraped(el: Element): void {
  const removeSelectors = [
    "header.AppHeader",
    ".AppHeader-globalBar",
    "header[role='banner']",
    "footer",
    "#repository-container-header",
    ".pagehead",
    ".UnderlineNav.js-repo-nav",
    "script",
    "style",
  ];
  for (const sel of removeSelectors) {
    el.querySelectorAll(sel).forEach((n) => n.remove());
  }
  for (const node of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  }
}
