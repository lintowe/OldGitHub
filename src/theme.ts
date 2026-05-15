export type Theme = "light" | "dark" | "auto";

const MEDIA = "(prefers-color-scheme: dark)";

export async function applyTheme(): Promise<void> {
  const { theme = "auto" } = (await chrome.storage.sync.get("theme")) as { theme?: Theme };
  setEffectiveTheme(resolve(theme));
}

export function watchThemeChanges(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes["theme"]) return;
    const next = (changes["theme"].newValue ?? "auto") as Theme;
    setEffectiveTheme(resolve(next));
  });

  matchMedia(MEDIA).addEventListener("change", () => {
    void applyTheme();
  });
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "auto") {
    return matchMedia(MEDIA).matches ? "dark" : "light";
  }
  return theme;
}

function setEffectiveTheme(effective: "light" | "dark"): void {
  document.documentElement.setAttribute("data-oldgh-theme", effective);
}
