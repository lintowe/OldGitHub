import { AdapterFailure, type AdapterContext } from "./index";

export async function getUnreadCount(_ctx: AdapterContext = { csrfToken: null }): Promise<number> {
  const resp = await fetch("https://github.com/notifications/beacon/count", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (resp.status === 401 || resp.status === 403) {
    return 0;
  }
  if (!resp.ok) {
    throw new AdapterFailure("getUnreadCount", `notifications/beacon/count responded ${resp.status}`);
  }
  const json = (await resp.json()) as unknown;
  if (!json || typeof json !== "object") {
    throw new AdapterFailure("getUnreadCount", "unexpected notifications payload");
  }
  const count = (json as { count?: unknown }).count;
  if (typeof count !== "number") {
    throw new AdapterFailure("getUnreadCount", "missing 'count' field");
  }
  return count;
}
