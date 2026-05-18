// Simple session-level rate-limit tracker. When an unauth API request comes
// back 403/429, set a "blocked until" timestamp; adapters can call
// isApiRateLimited() to skip the API and go straight to a scrape fallback
// instead of hammering the rate-limit endpoint over and over.

let blockedUntil = 0;

const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;

export function noteApiRateLimited(): void {
  blockedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
}

export function isApiRateLimited(): boolean {
  return Date.now() < blockedUntil;
}

export function clearRateLimit(): void {
  blockedUntil = 0;
}

export async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, init);
  if (resp.status === 403 || resp.status === 429) {
    const remaining = resp.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || resp.status === 429) {
      noteApiRateLimited();
    }
  }
  return resp;
}
