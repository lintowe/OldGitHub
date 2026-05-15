import { AdapterFailure } from "./index";
import { fetchRepoPage, parseRepoPage } from "./_page";

export type RepoSummary = {
  owner: string;
  repo: string;
  nwo: string;
  isPrivate: boolean;
  isFork: boolean;
  parentNwo: string | null;
  description: string;
  defaultBranch: string;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
};

export async function getRepoSummary(owner: string, repo: string): Promise<RepoSummary> {
  const html = await fetchRepoPage(owner, repo);
  const doc = parseRepoPage(html);

  const nwo = meta(doc, "octolytics-dimension-repository_nwo");
  if (!nwo) {
    throw new AdapterFailure("getRepoSummary", "missing repository_nwo meta");
  }
  const expected = `${owner}/${repo}`;
  if (nwo.toLowerCase() !== expected.toLowerCase()) {
    throw new AdapterFailure("getRepoSummary", `nwo mismatch: got ${nwo}, expected ${expected}`);
  }

  const isPrivate = meta(doc, "octolytics-dimension-repository_public") === "false";
  const isFork = meta(doc, "octolytics-dimension-repository_is_fork") === "true";
  const parentNwo = isFork ? meta(doc, "octolytics-dimension-repository_network_root_nwo") : null;

  const description = extractDescription(doc);
  const defaultBranch = extractDefaultBranch(html);

  return {
    owner,
    repo,
    nwo,
    isPrivate,
    isFork,
    parentNwo: parentNwo && parentNwo !== nwo ? parentNwo : null,
    description,
    defaultBranch,
    stars: parseCount(doc, `a[href="/${owner}/${repo}/stargazers"] strong`),
    forks: parseCount(doc, `a[href="/${owner}/${repo}/forks"] strong`),
    watchers:
      parseCount(doc, `a[href="/${owner}/${repo}/watchers"] strong`) ??
      parseCount(doc, `a[href="/${owner}/${repo}/subscription"] strong`),
  };
}

function meta(doc: Document, name: string): string | null {
  return doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() ?? null;
}

function extractDescription(doc: Document): string {
  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  const m = /^GitHub\s*-\s*[^:]+:\s*(.+?)\s*(?:·\s*GitHub)?\s*$/.exec(title);
  if (m && m[1]) return m[1];

  const og = doc
    .querySelector<HTMLMetaElement>('meta[property="og:description"]')
    ?.content?.trim();
  if (!og) return "";
  return og.replace(/\.\s*Contribute to [^.]+\s+development by creating an account on GitHub\.?\s*$/i, "")
    .trim();
}

function extractDefaultBranch(html: string): string {
  const m = /"defaultBranch":"([^"\\]+)"/.exec(html);
  if (m && m[1]) return m[1];
  return "main";
}

function parseCount(doc: Document, selector: string): number | null {
  const text = doc.querySelector(selector)?.textContent?.trim();
  if (!text) return null;
  return parseHumanCount(text);
}

function parseHumanCount(text: string): number | null {
  const m = /^([\d.,]+)\s*([kKmM])?$/.exec(text);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  const unit = m[2]?.toLowerCase();
  return Math.round(n * (unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1));
}

export function formatCount(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
