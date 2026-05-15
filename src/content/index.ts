import { killTurbo, mountRouter } from "@/router";
import { isLoggedIn } from "@/auth/session";

async function boot(): Promise<void> {
  if (!(await isLoggedIn())) {
    return;
  }
  killTurbo();
  injectThemeStylesheet();
  mountRouter();
}

function injectThemeStylesheet(): void {
  const href = chrome.runtime.getURL("styles/2013.css");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oldgh = "theme";
  document.documentElement.appendChild(link);
}

void boot();
