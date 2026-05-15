export function isLoggedIn(): boolean {
  if (/(?:^|;\s*)logged_in=yes(?:;|$)/.test(document.cookie)) return true;
  if (/(?:^|;\s*)dotcom_user=/.test(document.cookie)) return true;
  if (document.querySelector('meta[name="user-login"]')) return true;
  return false;
}

export function readCsrfToken(doc: Document = document): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? null;
}
