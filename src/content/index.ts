import { killTurbo, mountRouter } from "@/router";
import { isLoggedIn } from "@/auth/session";
import { applyTheme, watchThemeChanges } from "@/theme";
import { mountHeader } from "@/views/header";

async function boot(): Promise<void> {
  const loggedIn = isLoggedIn();
  console.debug("[oldgh] boot", {
    url: window.location.href,
    loggedIn,
    cookieKeys: document.cookie ? document.cookie.split(";").map((c) => c.trim().split("=")[0]).join(",") : "(empty)",
  });
  if (!loggedIn) {
    return;
  }
  killTurbo();
  document.documentElement.setAttribute("data-oldgh", "active");
  injectThemeStylesheet();
  await applyTheme();
  watchThemeChanges();

  const mount = async (): Promise<void> => {
    console.debug("[oldgh] mounting header + router");
    await mountHeader();
    mountRouter();
  };

  if (document.body) {
    await mount();
  } else {
    document.addEventListener("DOMContentLoaded", () => void mount(), { once: true });
  }
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
