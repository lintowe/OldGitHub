import { killTurbo, mountRouter } from "@/router";
import { isLoggedIn } from "@/auth/session";
import { applyTheme, watchThemeChanges } from "@/theme";
import { mountHeader } from "@/views/header";
import { mountHovercards } from "@/views/hovercards";

function eagerStyle(): void {
  document.documentElement.setAttribute("data-oldgh", "active");
  document.documentElement.setAttribute("data-oldgh-mounted", "pending");
  // Read the cached theme from localStorage (sync) to avoid a light→dark flash
  // before chrome.storage.sync resolves. applyTheme() reconciles to the true
  // stored value shortly after.
  const cached = readCachedTheme();
  const initial = resolveInitial(cached);
  document.documentElement.setAttribute("data-oldgh-theme", initial);
  forceGitHubColorModeNeutral();
  injectThemeStylesheet();
}

function readCachedTheme(): string | null {
  try {
    return localStorage.getItem("oldgh:theme-cache");
  } catch {
    return null;
  }
}

function resolveInitial(cached: string | null): "light" | "dark" {
  if (cached === "light" || cached === "dark") return cached;
  // "auto" or no cache: trust prefers-color-scheme for the first paint
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // matchMedia unavailable
  }
  return "light";
}

async function boot(): Promise<void> {
  eagerStyle();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void run(), { once: true });
  } else {
    await run();
  }
}

async function run(): Promise<void> {
  const loggedIn = isLoggedIn();
  console.debug("[oldgh] boot", {
    url: window.location.href,
    loggedIn,
    hasUserLoginMeta: !!document.querySelector('meta[name="user-login"]'),
  });
  if (!loggedIn) {
    document.documentElement.removeAttribute("data-oldgh");
    document.documentElement.removeAttribute("data-oldgh-mounted");
    return;
  }
  killTurbo();
  await applyTheme();
  watchThemeChanges();
  console.debug("[oldgh] mounting header + router");
  await mountHeader();
  mountHovercards();
  mountRouter();
}

function forceGitHubColorModeNeutral(): void {
  // We render everything ourselves, but a few scraped fragments (achievements,
  // wiki, scraped sections) still pick up GitHub's color-mode tokens. Pin them
  // to "light" so scraped HTML always uses light tokens; our own dark theme is
  // independent and reads data-oldgh-theme instead.
  const html = document.documentElement;
  html.setAttribute("data-color-mode", "light");
  html.setAttribute("data-light-theme", "light");
  html.setAttribute("data-dark-theme", "light");
  const obs = new MutationObserver(() => {
    if (html.getAttribute("data-color-mode") !== "light") {
      html.setAttribute("data-color-mode", "light");
      html.setAttribute("data-light-theme", "light");
      html.setAttribute("data-dark-theme", "light");
    }
  });
  obs.observe(html, { attributes: true, attributeFilter: ["data-color-mode", "data-light-theme", "data-dark-theme"] });
}

function injectThemeStylesheet(): void {
  const href = chrome.runtime.getURL("styles/2013.css");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oldghStylesheet = "theme";
  document.documentElement.appendChild(link);
}

void boot();
