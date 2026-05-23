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
  // Insert before the footer so the page reads header → content → footer.
  // adoptBodyRoot fires once per navigation, so a stale append-to-body would
  // otherwise push every new body root below the footer mounted at boot.
  const footer = document.querySelector(".oldgh-footer");
  if (footer && footer.parentNode === document.body) {
    document.body.insertBefore(root, footer);
  } else {
    document.body.append(root);
  }
}

export function removeAllBodyRoots(): void {
  document.querySelectorAll(`.${BODY_ROOT_CLASS}`).forEach((el) => el.remove());
}

export function hasMountedBody(): boolean {
  return !!document.querySelector(`.${BODY_ROOT_CLASS}`);
}
