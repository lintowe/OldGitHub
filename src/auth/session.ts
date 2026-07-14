export function isLoggedIn(): boolean {
  if (/(?:^|;\s*)logged_in=yes(?:;|$)/.test(document.cookie)) return true;
  if (/(?:^|;\s*)dotcom_user=/.test(document.cookie)) return true;
  if (document.querySelector<HTMLMetaElement>('meta[name="user-login"]')?.content.trim()) return true;
  return false;
}

export function currentUserLogin(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="user-login"]');
  const fromMeta = meta?.content?.trim();
  if (fromMeta) return fromMeta;
  const m = /(?:^|;\s*)dotcom_user=([^;]+)/.exec(document.cookie);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

export function readCsrfToken(doc: Document = document): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? null;
}
