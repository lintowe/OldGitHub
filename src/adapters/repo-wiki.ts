import { AdapterFailure } from "./index";
import { parseRepoPage } from "./_page";

export type WikiPageRef = {
  title: string;
  href: string;
};

export type WikiView = {
  owner: string;
  repo: string;
  pageTitle: string;
  metaText: string;
  bodyHtml: string;
  pages: WikiPageRef[];
  cloneUrl: string;
};

export async function getWiki(owner: string, repo: string, page: string): Promise<WikiView> {
  const slug = page === "Home" ? "" : "/" + encodeURIComponent(page).replace(/%2F/g, "/");
  const url = `https://github.com/${owner}/${repo}/wiki${slug}`;
  const resp = await fetch(url, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getWiki", `${url} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = parseRepoPage(html);

  const pageTitle = doc.querySelector(".gh-header-title")?.textContent?.trim() || page;
  const metaText = doc.querySelector(".gh-header-meta")?.textContent?.replace(/\s+/g, " ").trim() || "";
  const bodyEl = doc.querySelector(".markdown-body");
  if (!bodyEl) {
    throw new AdapterFailure("getWiki", "no .markdown-body found");
  }
  const bodyHtml = bodyEl.innerHTML;

  const pages: WikiPageRef[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>("#wiki-pages-box a, #wiki-rightbar a, .wiki-pages-list a"))) {
    const href = a.getAttribute("href") || "";
    const title = a.textContent?.trim() || "";
    if (!title || !href || href.startsWith("#") || seen.has(href)) continue;
    if (!href.includes("/wiki")) continue;
    seen.add(href);
    pages.push({ title, href });
  }

  const cloneUrl = `https://github.com/${owner}/${repo}.wiki.git`;
  return { owner, repo, pageTitle, metaText, bodyHtml, pages, cloneUrl };
}
