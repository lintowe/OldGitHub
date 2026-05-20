import { octicon } from "@/icons";
import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-repo-settings";

type SidebarItem = {
  key: string;
  label: string;
  icon: string;
  path: string;
};

type SidebarGroup = {
  label: string | null;
  items: SidebarItem[];
};

function buildSidebar(owner: string, repo: string): SidebarGroup[] {
  const base = `/${owner}/${repo}/settings`;
  return [
    {
      label: null,
      items: [
        { key: "general", label: "General", icon: "gear", path: base },
      ],
    },
    {
      label: "Access",
      items: [
        { key: "access", label: "Collaborators", icon: "people", path: `${base}/access` },
      ],
    },
    {
      label: "Code and automation",
      items: [
        { key: "branches", label: "Branches", icon: "git-branch", path: `${base}/branches` },
        { key: "tags", label: "Tags", icon: "tag", path: `${base}/tag_protection` },
        { key: "rules", label: "Rules", icon: "law", path: `${base}/rules` },
        { key: "actions", label: "Actions", icon: "play", path: `${base}/actions` },
        { key: "webhooks", label: "Webhooks", icon: "broadcast", path: `${base}/hooks` },
        { key: "environments", label: "Environments", icon: "server", path: `${base}/environments` },
        { key: "pages", label: "Pages", icon: "book", path: `${base}/pages` },
      ],
    },
    {
      label: "Security",
      items: [
        { key: "security_analysis", label: "Code security", icon: "shield-check", path: `${base}/security_analysis` },
        { key: "keys", label: "Deploy keys", icon: "key", path: `${base}/keys` },
        { key: "secrets", label: "Secrets and variables", icon: "lock", path: `${base}/secrets/actions` },
      ],
    },
    {
      label: "Integrations",
      items: [
        { key: "installations", label: "GitHub Apps", icon: "package", path: `${base}/installations` },
        { key: "notifications", label: "Email notifications", icon: "mail", path: `${base}/notifications` },
        { key: "autolink", label: "Autolink references", icon: "link", path: `${base}/key_links` },
      ],
    },
  ];
}

function activeKeyFor(subPath: string): string {
  // subPath is "/settings", "/settings/branches", "/settings/secrets/actions" etc.
  const after = subPath.replace(/^\/settings/, "").replace(/^\//, "");
  if (!after) return "general";
  const first = after.split("/")[0] || "";
  switch (first) {
    case "access": case "collaboration": return "access";
    case "branches": return "branches";
    case "tag_protection": case "tags": return "tags";
    case "rules": case "rule": return "rules";
    case "actions": return "actions";
    case "hooks": return "webhooks";
    case "environments": return "environments";
    case "pages": return "pages";
    case "security_analysis": return "security_analysis";
    case "keys": return "keys";
    case "secrets": case "variables": return "secrets";
    case "installations": case "apps": return "installations";
    case "notifications": return "notifications";
    case "key_links": case "autolink": return "autolink";
    default: return "general";
  }
}

export async function mountRepoSettings(owner: string, repo: string, subPath: string): Promise<void> {
  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  const activeKey = activeKeyFor(subPath);
  root.innerHTML = renderShell(owner, repo, activeKey);
  adoptBodyRoot(root, ".oldgh-repo-header");

  const main = root.querySelector<HTMLElement>(".oldgh-settings__main");
  if (!main) return;

  try {
    const html = await fetchSettingsPage(owner, repo, subPath);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const native = extractMainContent(doc);
    if (!native) {
      main.innerHTML = `<div class="oldgh-settings__empty">Couldn't find settings content.</div>`;
      return;
    }
    cleanScrapedContent(native);
    main.innerHTML = `<div class="oldgh-settings__native">${native.innerHTML}</div>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    main.innerHTML = `<div class="oldgh-settings__empty">Couldn't load settings: ${escapeText(msg)}</div>`;
  }
}

export function unmountRepoSettings(): void {
  removeAllBodyRoots();
}

async function fetchSettingsPage(owner: string, repo: string, subPath: string): Promise<string> {
  const url = `https://github.com/${owner}/${repo}${subPath}`;
  const resp = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } });
  if (!resp.ok) {
    throw new Error(`${url} responded ${resp.status}`);
  }
  return resp.text();
}

function extractMainContent(doc: Document): Element | null {
  const selectors = [
    "main #repo-content-turbo-frame",
    "main .Layout-main",
    "main .application-main",
    "main",
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.innerHTML.trim().length > 100) return el;
  }
  return null;
}

function cleanScrapedContent(el: Element): void {
  const remove = [
    "header.AppHeader",
    ".AppHeader-globalBar",
    "header[role='banner']",
    "footer",
    "#repository-container-header",
    ".pagehead",
    ".UnderlineNav.js-repo-nav",
    ".js-pjax-loader-bar",
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "nav-list",
    // native sidebars / nav we replace with our own
    ".js-repo-settings-sidebar",
    ".SideNav",
    ".Layout-sidebar",
    "nav[aria-label='Settings sidebar']",
    "nav[aria-label='Repo settings sidebar']",
    "nav[aria-label*='settings' i]",
    "nav[item_classes*='repo-menu-item']",
  ];
  for (const sel of remove) {
    el.querySelectorAll(sel).forEach((n) => n.remove());
  }
  // strip 'Uh oh!' hydration error blocks
  for (const node of Array.from(el.querySelectorAll<HTMLElement>("div, section"))) {
    const text = (node.textContent || "").trim();
    if (text.startsWith("Uh oh!") && text.includes("error") && node.children.length < 10) {
      node.remove();
    }
  }
  for (const node of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  }
}

function renderShell(owner: string, repo: string, activeKey: string): string {
  const groups = buildSidebar(owner, repo);
  return `
    <div class="oldgh-page oldgh-settings">
      <header class="oldgh-settings__header">
        <h1>${octicon("gear", { size: 22 })} Settings <span class="oldgh-settings__head-repo">/ ${escapeText(owner)}/${escapeText(repo)}</span></h1>
      </header>
      <div class="oldgh-settings__layout">
        <aside class="oldgh-settings__sidebar">
          ${groups.map((g) => `
            ${g.label ? `<h3 class="oldgh-settings__sidebar-group">${escapeText(g.label)}</h3>` : ""}
            <ul class="oldgh-settings__sidebar-list">
              ${g.items.map((it) => `
                <li class="${activeKey === it.key ? "is-active" : ""}">
                  <a href="${escapeAttr(it.path)}">${octicon(it.icon, { size: 14 })}<span>${escapeText(it.label)}</span></a>
                </li>
              `).join("")}
            </ul>
          `).join("")}
        </aside>
        <main class="oldgh-settings__main">
          <div class="oldgh-settings__loading">Loading settings&hellip;</div>
        </main>
      </div>
    </div>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
