export type Theme = "light" | "dark" | "auto";

const MEDIA = "(prefers-color-scheme: dark)";

export async function applyTheme(): Promise<void> {
  setEffectiveTheme("light");
}

export function watchThemeChanges(): void {
  // 2013 GitHub was light-only; no theme switching
}

function resolve(_theme: Theme): "light" | "dark" {
  return "light";
}

function setEffectiveTheme(effective: "light" | "dark"): void {
  document.documentElement.setAttribute("data-oldgh-theme", effective);
}
