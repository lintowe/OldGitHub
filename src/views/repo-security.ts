import { octicon } from "@/icons";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-security";

type SecurityCard = {
  key: string;
  title: string;
  icon: string;
  status: "enabled" | "disabled" | "configurable" | "needs-setup";
  description: string;
  action: { label: string; href: string } | null;
};

type SecurityView = {
  owner: string;
  repo: string;
  hasSecurityPolicy: boolean;
  securityPolicyUrl: string | null;
  features: SecurityCard[];
};

export async function mountRepoSecurity(owner: string, repo: string, subkind: "overview" | "advisories"): Promise<void> {
  const root = document.createElement("div");
  root.className = `${ROOT_CLASS} ${ROOT_CLASS}--${subkind}`;
  root.innerHTML = renderShell(owner, repo, subkind);
  adoptBodyRoot(root, ".oldgh-repo-header");

  if (subkind === "advisories") return; // handled by scraped fallback elsewhere if needed

  const main = root.querySelector<HTMLElement>(".oldgh-security__main");
  if (!main) return;

  try {
    const view = await fetchSecurityView(owner, repo);
    main.innerHTML = renderOverview(view);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    main.innerHTML = `<div class="oldgh-security__empty">Couldn't load security overview: ${escapeText(msg)}</div>`;
  }
}

export function unmountRepoSecurity(): void {
  removeAllBodyRoots();
}

async function fetchSecurityView(owner: string, repo: string): Promise<SecurityView> {
  // Pull community profile to learn if there's a security policy file.
  const community = await fetch(`https://api.github.com/repos/${owner}/${repo}/community/profile`, {
    credentials: "omit",
    headers: { Accept: "application/vnd.github+json" },
  });
  let securityFile: { html_url?: string; name?: string } | null = null;
  if (community.ok) {
    const j = (await community.json()) as Record<string, unknown>;
    const files = (j["files"] && typeof j["files"] === "object" ? j["files"] : null) as Record<string, unknown> | null;
    const sec = files?.["security"];
    if (sec && typeof sec === "object") {
      securityFile = sec as { html_url?: string; name?: string };
    }
  }

  const features: SecurityCard[] = [
    {
      key: "security-policy",
      title: "Security policy",
      icon: "shield-check",
      status: securityFile ? "enabled" : "needs-setup",
      description: securityFile
        ? `Define how users should report security vulnerabilities for this repository. Current policy: ${securityFile.name || "SECURITY.md"}.`
        : "Define how users should report security vulnerabilities for this repository.",
      action: securityFile?.html_url
        ? { label: "View policy", href: securityFile.html_url }
        : { label: "Set up", href: `/${owner}/${repo}/security/policy/edit` },
    },
    {
      key: "advisories",
      title: "Security advisories",
      icon: "megaphone",
      status: "configurable",
      description: "View or disclose security advisories for this repository. Use draft advisories to coordinate disclosure privately before patching.",
      action: { label: "View advisories", href: `/${owner}/${repo}/security/advisories` },
    },
    {
      key: "private-reporting",
      title: "Private vulnerability reporting",
      icon: "lock",
      status: "configurable",
      description: "Allow users to privately report potential security vulnerabilities, so they can be triaged before going public.",
      action: { label: "Manage in settings", href: `/${owner}/${repo}/settings/security_analysis` },
    },
    {
      key: "dependabot",
      title: "Dependabot alerts",
      icon: "package-dependents",
      status: "configurable",
      description: "Get notified when one of your dependencies has a known vulnerability. Pair with auto-updates to keep things patched.",
      action: { label: "Configure Dependabot", href: `/${owner}/${repo}/security/dependabot` },
    },
    {
      key: "code-scanning",
      title: "Code scanning",
      icon: "search",
      status: "configurable",
      description: "Automatically detect common vulnerability and coding errors in your code with CodeQL or third-party tools.",
      action: { label: "Set up code scanning", href: `/${owner}/${repo}/security/code-scanning` },
    },
    {
      key: "secret-scanning",
      title: "Secret scanning",
      icon: "key",
      status: "configurable",
      description: "GitHub scans every push for known secret formats (tokens, private keys, etc.) and alerts you so you can rotate them.",
      action: { label: "View detected secrets", href: `/${owner}/${repo}/security/secret-scanning` },
    },
  ];

  return {
    owner,
    repo,
    hasSecurityPolicy: !!securityFile,
    securityPolicyUrl: securityFile?.html_url ?? null,
    features,
  };
}

function renderShell(owner: string, repo: string, subkind: "overview" | "advisories"): string {
  const items: Array<{ key: string; label: string; icon: string; href: string }> = [
    { key: "overview", label: "Overview", icon: "shield", href: `/${owner}/${repo}/security` },
    { key: "advisories", label: "Advisories", icon: "megaphone", href: `/${owner}/${repo}/security/advisories` },
  ];
  return `
    <div class="oldgh-page">
      <header class="oldgh-security__header">
        <h1>${octicon("shield", { size: 22 })} Security: <strong>${escapeText(owner)}/${escapeText(repo)}</strong></h1>
      </header>
      <div class="oldgh-security__layout">
        <aside class="oldgh-security__sidebar">
          <ul class="oldgh-security__nav">
            ${items.map((it) => `
              <li class="${subkind === it.key ? "is-active" : ""}">
                <a href="${escapeAttr(it.href)}">${octicon(it.icon, { size: 14 })}<span>${escapeText(it.label)}</span></a>
              </li>
            `).join("")}
          </ul>
        </aside>
        <main class="oldgh-security__main">
          <div class="oldgh-security__loading">Loading security overview&hellip;</div>
        </main>
      </div>
    </div>
  `;
}

function renderOverview(v: SecurityView): string {
  const enabledCount = v.features.filter((f) => f.status === "enabled").length;
  return `
    <div class="oldgh-security__hero">
      <div class="oldgh-security__hero-icon">${octicon("shield-check", { size: 32 })}</div>
      <div class="oldgh-security__hero-text">
        <h2>Security and analysis</h2>
        <p>${enabledCount > 0
          ? `<strong>${enabledCount}</strong> of <strong>${v.features.length}</strong> recommended features are configured for this repo.`
          : `Configure the recommended features below to improve this repository's security posture.`}</p>
      </div>
    </div>
    <ul class="oldgh-security__features">
      ${v.features.map(renderFeature).join("")}
    </ul>
  `;
}

function renderFeature(f: SecurityCard): string {
  const statusChip = f.status === "enabled"
    ? `<span class="oldgh-security__status oldgh-security__status--on">${octicon("check", { size: 12 })} Enabled</span>`
    : `<span class="oldgh-security__status oldgh-security__status--off">${octicon("dot", { size: 12 })} Not configured</span>`;
  return `
    <li class="oldgh-security__feature">
      <div class="oldgh-security__feature-icon">${octicon(f.icon, { size: 18 })}</div>
      <div class="oldgh-security__feature-main">
        <h3 class="oldgh-security__feature-title">
          ${escapeText(f.title)}
          ${statusChip}
        </h3>
        <p class="oldgh-security__feature-desc">${escapeText(f.description)}</p>
      </div>
      ${f.action ? `<a class="oldgh-btn oldgh-security__feature-action" href="${escapeAttr(f.action.href)}">${escapeText(f.action.label)}</a>` : ""}
    </li>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
