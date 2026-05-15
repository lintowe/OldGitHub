import { AdapterFailure } from "./index";
import { parseUnifiedDiff, type DiffFile } from "@/util/diff";

export type CompareView = {
  owner: string;
  repo: string;
  base: string;
  head: string;
  threeDot: boolean;
  files: DiffFile[];
};

export async function getCompare(owner: string, repo: string, range: string): Promise<CompareView> {
  const { base, head, threeDot } = parseRange(range);
  const resp = await fetch(
    `https://github.com/${owner}/${repo}/compare/${range}.diff`,
    { credentials: "include", headers: { Accept: "text/plain" } },
  );
  if (!resp.ok) {
    throw new AdapterFailure("getCompare", `compare .diff responded ${resp.status}`);
  }
  const diff = await resp.text();
  return { owner, repo, base, head, threeDot, files: parseUnifiedDiff(diff) };
}

function parseRange(range: string): { base: string; head: string; threeDot: boolean } {
  const threeDotIdx = range.indexOf("...");
  if (threeDotIdx >= 0) {
    return {
      base: range.slice(0, threeDotIdx),
      head: range.slice(threeDotIdx + 3),
      threeDot: true,
    };
  }
  const twoDotIdx = range.indexOf("..");
  if (twoDotIdx >= 0) {
    return {
      base: range.slice(0, twoDotIdx),
      head: range.slice(twoDotIdx + 2),
      threeDot: false,
    };
  }
  throw new AdapterFailure("getCompare", `unrecognized compare range: ${range}`);
}
