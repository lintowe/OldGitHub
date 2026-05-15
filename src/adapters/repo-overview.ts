import { AdapterFailure } from "./index";
import { extractEmbeddedPayload, fetchRepoPage, parseRepoPage } from "./_page";

export type TreeItem = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type CloneUrls = {
  https: string | null;
  ssh: string | null;
  ghCli: string | null;
  zip: string | null;
};

export type ReadmeFile = {
  path: string;
  html: string;
};

export type RepoOverview = {
  owner: string;
  repo: string;
  branch: string;
  commitCount: string | null;
  tree: TreeItem[];
  readme: ReadmeFile | null;
  clone: CloneUrls;
};

export type CommitInfo = {
  oid: string;
  url: string;
  date: string;
  shortMessageHtmlLink: string;
};

export async function getRepoOverview(owner: string, repo: string): Promise<RepoOverview> {
  const html = await fetchRepoPage(owner, repo);
  const doc = parseRepoPage(html);
  const payload = extractEmbeddedPayload(doc);

  const route = read<{ payload?: unknown }>(payload, "payload");
  const routeData = read<{ codeViewRepoRoute?: unknown }>(route, "codeViewRepoRoute");
  if (!routeData) {
    throw new AdapterFailure("getRepoOverview", "missing codeViewRepoRoute in payload");
  }

  const refInfo = read<{ name?: unknown }>(routeData, "refInfo");
  const branch = typeof refInfo?.name === "string" ? refInfo.name : null;
  if (!branch) {
    throw new AdapterFailure("getRepoOverview", "missing refInfo.name");
  }

  const tree = readTree(routeData);

  const overview = read<Record<string, unknown>>(routeData, "overview") ?? {};
  const commitCountRaw = (overview as { commitCount?: unknown }).commitCount;
  const commitCount = typeof commitCountRaw === "string" ? commitCountRaw : null;
  const clone = readClone(overview);
  const readme = readReadme(overview);

  return { owner, repo, branch, commitCount, tree, readme, clone };
}

export async function getTreeCommitInfo(
  owner: string,
  repo: string,
  branch: string,
): Promise<Record<string, CommitInfo>> {
  const resp = await fetch(
    `https://github.com/${owner}/${repo}/tree-commit-info/${encodeBranch(branch)}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!resp.ok) {
    throw new AdapterFailure("getTreeCommitInfo", `${resp.status}`);
  }
  const data = (await resp.json()) as unknown;
  if (!data || typeof data !== "object") {
    throw new AdapterFailure("getTreeCommitInfo", "unexpected payload shape");
  }
  return data as Record<string, CommitInfo>;
}

function encodeBranch(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

function readTree(routeData: unknown): TreeItem[] {
  const tree = read<{ items?: unknown }>(routeData, "tree");
  if (!tree || !Array.isArray(tree.items)) return [];
  const items: TreeItem[] = [];
  for (const raw of tree.items) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const name = obj["name"];
    const path = obj["path"];
    const contentType = obj["contentType"];
    if (typeof name !== "string" || typeof path !== "string" || typeof contentType !== "string") continue;
    items.push({
      name,
      path,
      isDirectory: contentType === "directory",
    });
  }
  return items;
}

function readClone(overview: Record<string, unknown>): CloneUrls {
  const codeButton = (overview["codeButton"] ?? {}) as Record<string, unknown>;
  const local = (codeButton["local"] ?? {}) as Record<string, unknown>;
  const proto = (local["protocolInfo"] ?? {}) as Record<string, unknown>;
  const platform = (local["platformInfo"] ?? {}) as Record<string, unknown>;
  return {
    https: typeof proto["httpUrl"] === "string" ? (proto["httpUrl"] as string) : null,
    ssh: typeof proto["sshUrl"] === "string" ? (proto["sshUrl"] as string) : null,
    ghCli: typeof proto["ghCliUrl"] === "string" ? (proto["ghCliUrl"] as string) : null,
    zip: typeof platform["zipballUrl"] === "string" ? (platform["zipballUrl"] as string) : null,
  };
}

function readReadme(overview: Record<string, unknown>): ReadmeFile | null {
  const files = overview["overviewFiles"];
  if (!Array.isArray(files)) return null;
  for (const f of files) {
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    if (obj["preferredFileType"] !== "readme") continue;
    const path = obj["path"];
    const html = obj["richText"];
    if (typeof path !== "string" || typeof html !== "string") continue;
    return { path, html };
  }
  return null;
}

function read<T>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[key] as T | undefined;
}
