import { killTurbo, mountRouter } from "@/router";
import { isLoggedIn } from "@/auth/session";
import { applyTheme, watchThemeChanges } from "@/theme";
import { mountHeader } from "@/views/header";

async function boot(): Promise<void> {
  if (!isLoggedIn()) {
    return;
  }
  killTurbo();
  document.documentElement.setAttribute("data-oldgh", "active");
  injectThemeStylesheet();
  await applyTheme();
  watchThemeChanges();

  const mount = async (): Promise<void> => {
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
