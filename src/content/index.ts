import { killTurbo, mountRouter } from "@/router";
import { isLoggedIn } from "@/auth/session";
import { applyTheme, watchThemeChanges } from "@/theme";
import { mountHeader } from "@/views/header";
import { mountHovercards } from "@/views/hovercards";

async function boot(): Promise<void> {
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
    return;
  }
  killTurbo();
  document.documentElement.setAttribute("data-oldgh", "active");
  forceLightColorMode();
  injectThemeStylesheet();
  await applyTheme();
  watchThemeChanges();
  console.debug("[oldgh] mounting header + router");
  await mountHeader();
  mountHovercards();
  mountRouter();
}

function forceLightColorMode(): void {
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
