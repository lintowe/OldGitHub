import { AdapterFailure } from "./index";

const API = "https://api.github.com";

export type ContributorEntry = {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  weeks: Array<{ ts: number; commits: number; additions: number; deletions: number }>;
};

export type ContributorsView = {
  owner: string;
  repo: string;
  status: "ok" | "computing";
  entries: ContributorEntry[];
};

export type CommitActivityWeek = {
  ts: number;
  total: number;
  days: number[]; // Sun..Sat
};

export type CommitActivityView = {
  owner: string;
  repo: string;
  status: "ok" | "computing";
  weeks: CommitActivityWeek[];
};

export type CodeFrequencyPoint = {
  ts: number;
  additions: number;
  deletions: number;
};

export type CodeFrequencyView = {
  owner: string;
  repo: string;
  status: "ok" | "computing";
  points: CodeFrequencyPoint[];
};

export async function getRepoCommitActivity(owner: string, repo: string): Promise<CommitActivityView> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${API}/repos/${owner}/${repo}/stats/commit_activity`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.status === 202) {
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return { owner, repo, status: "computing", weeks: [] };
    }
    if (!resp.ok) {
      throw new AdapterFailure("getRepoCommitActivity", `responded ${resp.status}`);
    }
    const data = (await resp.json()) as unknown;
    const arr = Array.isArray(data) ? data : [];
    const weeks: CommitActivityWeek[] = [];
    for (const w of arr) {
      if (!w || typeof w !== "object") continue;
      const o = w as Record<string, unknown>;
      const ts = typeof o["week"] === "number" ? (o["week"] as number) : 0;
      const total = typeof o["total"] === "number" ? (o["total"] as number) : 0;
      const days = Array.isArray(o["days"]) ? (o["days"] as unknown[]).map((x) => (typeof x === "number" ? x : 0)) : [];
      weeks.push({ ts, total, days });
    }
    return { owner, repo, status: "ok", weeks };
  }
  return { owner, repo, status: "computing", weeks: [] };
}

export async function getRepoCodeFrequency(owner: string, repo: string): Promise<CodeFrequencyView> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${API}/repos/${owner}/${repo}/stats/code_frequency`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.status === 202) {
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return { owner, repo, status: "computing", points: [] };
    }
    if (!resp.ok) {
      throw new AdapterFailure("getRepoCodeFrequency", `responded ${resp.status}`);
    }
    const data = (await resp.json()) as unknown;
    const arr = Array.isArray(data) ? data : [];
    const points: CodeFrequencyPoint[] = [];
    for (const p of arr) {
      if (!Array.isArray(p) || p.length < 3) continue;
      const ts = typeof p[0] === "number" ? (p[0] as number) : 0;
      const additions = typeof p[1] === "number" ? (p[1] as number) : 0;
      const deletions = typeof p[2] === "number" ? (p[2] as number) : 0;
      points.push({ ts, additions, deletions });
    }
    return { owner, repo, status: "ok", points };
  }
  return { owner, repo, status: "computing", points: [] };
}

export async function getRepoContributors(owner: string, repo: string): Promise<ContributorsView> {
  // 202 = stats are being computed. Retry up to 3 times with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${API}/repos/${owner}/${repo}/stats/contributors`, {
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.status === 202) {
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return { owner, repo, status: "computing", entries: [] };
    }
    if (!resp.ok) {
      throw new AdapterFailure("getRepoContributors", `stats/contributors responded ${resp.status}`);
    }
    const data = (await resp.json()) as unknown;
    const arr = Array.isArray(data) ? data : [];
    const entries = arr.map(parseContributor).filter((c): c is ContributorEntry => c !== null);
    entries.sort((a, b) => b.totalCommits - a.totalCommits);
    return { owner, repo, status: "ok", entries };
  }
  return { owner, repo, status: "computing", entries: [] };
}

function parseContributor(raw: unknown): ContributorEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const author = readObj(r["author"]);
  const login = author && typeof author["login"] === "string" ? (author["login"] as string) : null;
  if (!login) return null;
  const weeksRaw = Array.isArray(r["weeks"]) ? r["weeks"] : [];
  let adds = 0;
  let dels = 0;
  const weeks = weeksRaw
    .map((w) => {
      if (!w || typeof w !== "object") return null;
      const o = w as Record<string, unknown>;
      const ts = typeof o["w"] === "number" ? (o["w"] as number) : 0;
      const a = typeof o["a"] === "number" ? (o["a"] as number) : 0;
      const d = typeof o["d"] === "number" ? (o["d"] as number) : 0;
      const c = typeof o["c"] === "number" ? (o["c"] as number) : 0;
      adds += a;
      dels += d;
      return { ts, commits: c, additions: a, deletions: d };
    })
    .filter((w): w is { ts: number; commits: number; additions: number; deletions: number } => w !== null);

  const avatarUrl = author && typeof author["avatar_url"] === "string" ? (author["avatar_url"] as string) : `https://github.com/${login}.png?size=40`;
  const htmlUrl = author && typeof author["html_url"] === "string" ? (author["html_url"] as string) : `https://github.com/${login}`;
  return {
    login,
    avatarUrl,
    htmlUrl,
    totalCommits: typeof r["total"] === "number" ? (r["total"] as number) : weeks.reduce((s, w) => s + w.commits, 0),
    totalAdditions: adds,
    totalDeletions: dels,
    weeks,
  };
}

function readObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
