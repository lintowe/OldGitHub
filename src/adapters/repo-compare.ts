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
  const basehead = `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/compare/${basehead}`,
    { credentials: "omit", headers: { Accept: "application/vnd.github+json" } },
  );
  if (!resp.ok) {
    throw new AdapterFailure("getCompare", `REST compare ${owner}/${repo}/${basehead} responded ${resp.status}`);
  }
  const data = (await resp.json()) as { files?: unknown };
  const restFiles = Array.isArray(data.files) ? data.files : [];
  const files: DiffFile[] = [];
  for (const f of restFiles) {
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    const filename = typeof obj["filename"] === "string" ? (obj["filename"] as string) : "";
    const patch = typeof obj["patch"] === "string" ? (obj["patch"] as string) : "";
    if (!filename) continue;
    if (!patch) {
      const status = typeof obj["status"] === "string" ? (obj["status"] as string) : "modified";
      const placeholder = `diff --git a/${filename} b/${filename}\n${status === "added" ? "new file mode 100644" : status === "removed" ? "deleted file mode 100644" : "index 0..0"}\n--- a/${filename}\n+++ b/${filename}\n`;
      const parsed = parseUnifiedDiff(placeholder);
      if (parsed.length > 0) files.push(parsed[0]!);
      continue;
    }
    const synthesized = `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${patch}\n`;
    const parsed = parseUnifiedDiff(synthesized);
    if (parsed.length > 0) files.push(parsed[0]!);
  }
  return { owner, repo, base, head, threeDot, files };
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
