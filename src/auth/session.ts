export function isLoggedIn(): boolean {
  return /(?:^|;\s*)logged_in=yes(?:;|$)/.test(document.cookie);
}

export function readCsrfToken(doc: Document = document): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? null;
}
