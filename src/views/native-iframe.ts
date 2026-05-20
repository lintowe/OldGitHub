import { adoptBodyRoot, removeAllBodyRoots } from "./_body";

const ROOT_CLASS = "oldgh-native-iframe";

export async function mountNativeIframe(pathname: string, search: string, title: string): Promise<void> {
  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  const url = `https://github.com${pathname}${search ? "?" + search : ""}`;
  root.innerHTML = `
    <div class="oldgh-page oldgh-native-iframe__page">
      <header class="oldgh-native-iframe__header">
        <h1>${escapeText(title)}</h1>
        <a class="oldgh-native-iframe__open" href="${escapeAttr(url)}" target="_blank" rel="noopener">Open in new tab ↗</a>
      </header>
      <div class="oldgh-native-iframe__frame-wrap">
        <iframe
          class="oldgh-native-iframe__frame"
          src="${escapeAttr(url)}"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    </div>
  `;
  adoptBodyRoot(root);
}

export function unmountNativeIframe(): void {
  removeAllBodyRoots();
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
