export async function isLoggedIn(): Promise<boolean> {
  const cookie = await chrome.cookies.get({
    url: "https://github.com",
    name: "user_session",
  });
  return cookie !== null && cookie.value.length > 0;
}

export function readCsrfToken(doc: Document = document): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  return meta?.content ?? null;
}
