export function renderFallback(reason: string): void {
  // intentionally leave the original GitHub DOM untouched
  // remove our injected theme stylesheet so vanilla GH renders normally
  document
    .querySelectorAll<HTMLLinkElement>('link[data-oldgh="theme"]')
    .forEach((el) => el.remove());

  console.debug("[oldgh] fallback:", reason);
}
