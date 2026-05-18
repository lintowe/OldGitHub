type Theme = "light" | "dark" | "auto";

let statusTimer: number | null = null;

async function load(): Promise<void> {
  const { theme = "auto" } = (await chrome.storage.sync.get("theme")) as { theme?: Theme };
  const input = document.querySelector<HTMLInputElement>(
    `input[name="theme"][value="${theme}"]`,
  );
  if (input) input.checked = true;
}

function bind(): void {
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) {
        void chrome.storage.sync.set({ theme: el.value as Theme }).then(() => flashSaved());
      }
    });
  });
}

function flashSaved(): void {
  const hint = document.querySelector<HTMLElement>("[data-status]");
  if (!hint) return;
  hint.textContent = "Saved. Reload any open GitHub tab to see the change.";
  hint.hidden = false;
  if (statusTimer != null) window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    hint.hidden = true;
  }, 2400);
}

void load();
bind();
