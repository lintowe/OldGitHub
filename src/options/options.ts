type Theme = "light" | "dark" | "auto";

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
        void chrome.storage.sync.set({ theme: el.value as Theme });
      }
    });
  });
}

void load();
bind();
