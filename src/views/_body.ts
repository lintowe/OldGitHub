const BODY_ROOT_CLASS = "oldgh-body-root";

export function adoptBodyRoot(root: HTMLElement, afterSelector?: string): void {
  root.classList.add(BODY_ROOT_CLASS);
  removeAllBodyRoots();
  if (afterSelector) {
    const after = document.querySelector(afterSelector);
    if (after && after.parentNode) {
      after.after(root);
      return;
    }
  }
  document.body.append(root);
}

export function removeAllBodyRoots(): void {
  document.querySelectorAll(`.${BODY_ROOT_CLASS}`).forEach((el) => el.remove());
}

export function hasMountedBody(): boolean {
  return !!document.querySelector(`.${BODY_ROOT_CLASS}`);
}
