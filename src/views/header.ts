import { octicon } from "@/icons";
import { getMe, type Me } from "@/adapters/me";
import { getUnreadCount } from "@/adapters/notifications";
import { AdapterFailure } from "@/adapters";

const POLL_INTERVAL_MS = 60_000;

export async function mountHeader(): Promise<void> {
  hideModernHeader();

  const root = document.createElement("div");
  root.className = "oldgh-header";
  root.dataset.oldgh = "header";
  document.body.prepend(root);

  let me: Me;
  try {
    me = await getMe();
  } catch (err) {
    if (err instanceof AdapterFailure) {
      console.debug("[oldgh] header adapter failure:", err.name, err.message);
      root.remove();
      restoreModernHeader();
      return;
    }
    throw err;
  }

  root.innerHTML = renderHeaderHtml(me);
  bindSearchForm(root);
  bindAvatarMenu(root);
  void startNotificationPolling(root);
}

function renderHeaderHtml(me: Me): string {
  const logo = octicon("mark-github", { size: 24, ariaLabel: "GitHub" });
  const bell = octicon("bell", { size: 16, ariaLabel: "Notifications" });
  const plus = octicon("plus", { size: 16 });
  const chevron = octicon("triangle-down", { className: "oldgh-chevron" });
  return `
    <a class="oldgh-header__logo" href="/" aria-label="GitHub">${logo}</a>
    <form class="oldgh-header__search" action="/search" method="get" role="search">
      <input
        class="oldgh-header__search-input"
        type="search"
        name="q"
        placeholder="Search GitHub"
        aria-label="Search GitHub"
        autocomplete="off"
      />
      <input type="hidden" name="ref" value="cmdform" />
    </form>
    <nav class="oldgh-header__nav" aria-label="Primary" data-oldgh-topnav>
      <a href="/pulls" data-topnav-key="pulls">Pull requests</a>
      <a href="/issues" data-topnav-key="issues">Issues</a>
      <a href="/marketplace" data-topnav-key="marketplace">Marketplace</a>
      <a href="/explore" data-topnav-key="explore">Explore</a>
    </nav>
    <div class="oldgh-header__actions">
      <a class="oldgh-header__bell" href="/notifications" aria-label="Notifications">
        ${bell}
        <span class="oldgh-header__bell-count" hidden></span>
      </a>
      <details class="oldgh-header__menu oldgh-header__menu--new">
        <summary aria-label="Create new" title="Create new&hellip;">${plus} ${chevron}</summary>
        <ul class="oldgh-header__menu-list" role="menu">
          <li role="none"><a role="menuitem" href="/new">New repository</a></li>
          <li role="none"><a role="menuitem" href="/new/import">Import repository</a></li>
          <li role="none"><a role="menuitem" href="https://gist.github.com">New gist</a></li>
          <li role="none"><a role="menuitem" href="/organizations/new">New organization</a></li>
        </ul>
      </details>
      <details class="oldgh-header__menu oldgh-header__menu--user">
        <summary aria-label="View profile and more" title="View profile and more">
          <img class="oldgh-header__avatar" src="${escapeAttr(me.avatarUrl)}" alt="" width="20" height="20" />
          ${chevron}
        </summary>
        <ul class="oldgh-header__menu-list" role="menu">
          <li class="oldgh-header__menu-label" role="presentation">
            Signed in as <strong>${escapeText(me.login)}</strong>
          </li>
          <li role="none"><a role="menuitem" href="${escapeAttr(me.profileUrl)}">Your profile</a></li>
          <li role="none"><a role="menuitem" href="${escapeAttr(me.profileUrl)}?tab=repositories">Your repositories</a></li>
          <li role="none"><a role="menuitem" href="/issues">Your issues</a></li>
          <li role="none"><a role="menuitem" href="/pulls">Your pull requests</a></li>
          <li role="none"><a role="menuitem" href="/stars">Your stars</a></li>
          <li role="none"><a role="menuitem" href="/settings/profile">Settings</a></li>
          <li role="separator" class="oldgh-header__menu-sep"></li>
          <li role="none">
            <form action="/logout" method="post" data-oldgh-logout>
              <button type="submit" role="menuitem" class="oldgh-header__menu-button">Sign out</button>
            </form>
          </li>
        </ul>
      </details>
    </div>
  `;
}

function bindSearchForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>("form.oldgh-header__search");
  if (!form) return;
  form.addEventListener("submit", () => {
    // let the browser submit normally; GH /search accepts q + ref
  });
}

function bindAvatarMenu(root: HTMLElement): void {
  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    root.querySelectorAll<HTMLDetailsElement>("details.oldgh-header__menu").forEach((d) => {
      if (!d.contains(target)) d.open = false;
    });
  });

  const logoutForm = root.querySelector<HTMLFormElement>('form[data-oldgh-logout]');
  if (logoutForm) {
    logoutForm.addEventListener("submit", (e) => {
      const token = document
        .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content;
      if (!token) return;
      let input = logoutForm.querySelector<HTMLInputElement>('input[name="authenticity_token"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "authenticity_token";
        logoutForm.append(input);
      }
      input.value = token;
      void e;
    });
  }
}

async function startNotificationPolling(root: HTMLElement): Promise<void> {
  const badge = root.querySelector<HTMLElement>(".oldgh-header__bell-count");
  if (!badge) return;

  const update = async (): Promise<void> => {
    try {
      const count = await getUnreadCount();
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = String(count);
      } else {
        badge.hidden = true;
        badge.textContent = "";
      }
    } catch (err) {
      const reason = err instanceof AdapterFailure ? err.name + ": " + err.message : String(err);
      console.debug("[oldgh] notifications poll skipped:", reason);
    }
  };

  await update();
  window.setInterval(() => {
    void update();
  }, POLL_INTERVAL_MS);
}

export function updateTopNavActive(pathname: string): void {
  const nav = document.querySelector<HTMLElement>("[data-oldgh-topnav]");
  if (!nav) return;
  let key: string | null = null;
  if (pathname === "/pulls" || pathname.startsWith("/pulls/")) key = "pulls";
  else if (pathname === "/issues" || pathname.startsWith("/issues/")) key = "issues";
  else if (pathname === "/marketplace" || pathname.startsWith("/marketplace/")) key = "marketplace";
  else if (pathname === "/explore" || pathname.startsWith("/explore/") || pathname === "/trending" || pathname.startsWith("/trending/")) key = "explore";
  for (const a of Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[data-topnav-key]"))) {
    if (key && a.dataset["topnavKey"] === key) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  }
}

function hideModernHeader(): void {
  document.documentElement.setAttribute("data-oldgh-hide-modern-header", "");
}

function restoreModernHeader(): void {
  document.documentElement.removeAttribute("data-oldgh-hide-modern-header");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
