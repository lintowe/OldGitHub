import { AdapterFailure } from "./index";

export type ProfileKind = "user" | "org";

export type PinnedRepo = {
  nwo: string;
  href: string;
  description: string | null;
  language: string | null;
  languageColor: string | null;
  stars: string | null;
  forks: string | null;
  isPrivate: boolean;
};

export type ProfileOrg = {
  login: string;
  avatarUrl: string;
};

export type AchievementBadge = {
  name: string;
  iconUrl: string;
  href: string;
};

export type ProfileView = {
  login: string;
  kind: ProfileKind;
  avatarUrl: string;
  displayName: string;
  bio: string | null;
  homepage: string | null;
  location: string | null;
  followersCount: string | null;
  followingCount: string | null;
  repoCountHint: number | null;
  contributionHeading: string | null;
  pinned: PinnedRepo[];
  orgs: ProfileOrg[];
  achievements: AchievementBadge[];
  isViewer: boolean;
};

export async function getProfile(login: string): Promise<ProfileView> {
  const resp = await fetch(`https://github.com/${login}`, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new AdapterFailure("getProfile", `/${login} responded ${resp.status}`);
  }
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const profileUsername = meta(doc, "profile:username");
  if (!profileUsername) {
    throw new AdapterFailure("getProfile", "missing profile:username meta");
  }

  const hovercard = meta(doc, "hovercard-subject-tag");
  const kind: ProfileKind = hovercard?.startsWith("organization:") ? "org" : "user";

  const avatarUrl = meta(doc, "og:image") ?? `https://github.com/${profileUsername}.png?size=400`;

  const ogTitle = meta(doc, "og:title") ?? profileUsername;
  const displayName = kind === "user"
    ? ogTitle.replace(/\s*-\s*Overview\s*$/, "").trim() || profileUsername
    : ogTitle.trim();

  const ogDescription = meta(doc, "og:description") ?? "";
  const repoHintMatch = /\bhas (\d+(?:,\d+)*)\s+repositor/i.exec(ogDescription);
  const repoCountHint = repoHintMatch && repoHintMatch[1]
    ? parseInt(repoHintMatch[1].replace(/,/g, ""), 10)
    : null;

  const orgBio = kind === "org" && ogDescription
    ? ogDescription.replace(/\s+GitHub is where [^.]+ builds software\.?\s*$/i, "").trim()
    : null;
  const userBioEl = doc.querySelector<HTMLElement>(".user-profile-bio, [data-bio-text]");
  const userBio = userBioEl?.textContent?.trim() || null;
  const bio = orgBio || userBio;

  const homepageEl = doc.querySelector<HTMLAnchorElement>('li[itemprop="url"] a, [data-test-selector="profile-website-url"] a');
  const homepage = homepageEl?.href || null;

  const locationEl = doc.querySelector<HTMLElement>('li[itemprop="homeLocation"] span, [itemprop="homeLocation"]');
  const location = locationEl?.textContent?.trim() || null;

  return {
    login: profileUsername,
    kind,
    avatarUrl,
    displayName,
    bio,
    homepage,
    location,
    followersCount: readCountFromTabLink(doc, "followers"),
    followingCount: readCountFromTabLink(doc, "following"),
    repoCountHint,
    contributionHeading: doc.querySelector(".js-yearly-contributions h2")?.textContent?.trim() || null,
    pinned: readPinned(doc),
    orgs: readOrgs(doc),
    achievements: readAchievements(doc, profileUsername),
    isViewer: !!doc.querySelector('a[href$="/account"]'),
  };
}

function meta(doc: Document, key: string): string | null {
  return doc.querySelector<HTMLMetaElement>(`meta[name="${key}"], meta[property="${key}"]`)?.content?.trim() ?? null;
}

function readCountFromTabLink(doc: Document, tab: string): string | null {
  const anchor = doc.querySelector<HTMLAnchorElement>(`a[href*="tab=${tab}"]`);
  if (!anchor) return null;
  const bold = anchor.querySelector(".text-bold, span.color-fg-default, strong");
  const text = bold?.textContent?.trim() || anchor.textContent?.trim()?.split(/\s+/)[0];
  return text || null;
}

function readPinned(doc: Document): PinnedRepo[] {
  const items = doc.querySelectorAll<HTMLElement>(".pinned-item-list-item");
  const out: PinnedRepo[] = [];
  for (const el of Array.from(items)) {
    const titleLink = el.querySelector<HTMLAnchorElement>('a[href]');
    const href = titleLink?.getAttribute("href") || "";
    if (!href || !href.includes("/")) continue;
    const nwo = href.replace(/^\//, "");
    const desc = el.querySelector(".pinned-item-desc, p.color-fg-muted")?.textContent?.trim() || null;
    const langEl = el.querySelector<HTMLElement>('[itemprop="programmingLanguage"]');
    const language = langEl?.textContent?.trim() || null;
    const langColor = el.querySelector<HTMLElement>(".repo-language-color");
    const languageColor = langColor ? langColor.style.backgroundColor || null : null;
    const starsEl = el.querySelector<HTMLAnchorElement>('a[href*="/stargazers"]');
    const stars = starsEl?.textContent?.trim() || null;
    const forksEl = el.querySelector<HTMLAnchorElement>('a[href*="/forks"], a[href*="/network/members"]');
    const forks = forksEl?.textContent?.trim() || null;
    const isPrivate = !!el.querySelector('.Label[title="Private" i], .Label--secondary');
    out.push({ nwo, href, description: desc, language, languageColor, stars, forks, isPrivate });
  }
  return out;
}

function readOrgs(doc: Document): ProfileOrg[] {
  const anchors = doc.querySelectorAll<HTMLAnchorElement>('a[data-hovercard-type="organization"]');
  const seen = new Set<string>();
  const out: ProfileOrg[] = [];
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute("href") || "";
    const login = href.replace(/^\//, "").split("/")[0];
    if (!login || seen.has(login)) continue;
    seen.add(login);
    const img = a.querySelector<HTMLImageElement>("img");
    const avatarUrl = img?.getAttribute("src") || `https://github.com/${login}.png?size=64`;
    out.push({ login, avatarUrl });
  }
  return out;
}

function readAchievements(doc: Document, login: string): AchievementBadge[] {
  const anchors = doc.querySelectorAll<HTMLAnchorElement>(`a[href*="${login}?achievement="]`);
  const out: AchievementBadge[] = [];
  for (const a of Array.from(anchors)) {
    const img = a.querySelector<HTMLImageElement>("img");
    if (!img) continue;
    out.push({
      name: img.getAttribute("alt") || "",
      iconUrl: img.getAttribute("src") || "",
      href: a.getAttribute("href") || "",
    });
  }
  return out;
}
