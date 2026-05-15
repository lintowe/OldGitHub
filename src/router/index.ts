import { dispatchRoute } from "@/router/dispatch";
import { isCovered } from "@/router/resolve";

export function killTurbo(): void {
  const meta = document.createElement("meta");
  meta.name = "turbo-visit-control";
  meta.content = "reload";
  document.documentElement.appendChild(meta);

  const stop = (e: Event): void => {
    e.stopImmediatePropagation();
  };
  for (const evt of [
    "turbo:click",
    "turbo:before-visit",
    "turbo:visit",
    "turbo:before-fetch-request",
    "turbo:before-render",
    "turbo:render",
    "turbo:load",
  ]) {
    document.addEventListener(evt, stop, true);
  }
}

export function mountRouter(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOnce, { once: true });
  } else {
    initOnce();
  }
}

function initOnce(): void {
  interceptClicks();
  window.addEventListener("popstate", () => {
    void dispatchRoute(window.location);
  });
  void dispatchRoute(window.location);
}

function interceptClicks(): void {
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (anchor.target && anchor.target !== "_self") return;

      if (!isCovered(url.pathname)) {
        // not a fully-rebuilt route — let the browser do a full nav so modern
        // GH can render its own body; our content script will re-mount the
        // header on the new page load.
        return;
      }

      e.preventDefault();
      history.pushState({}, "", url.toString());
      void dispatchRoute(url);
    },
    true,
  );
}
