import { AdapterFailure, type AdapterContext } from "./index";

export async function getUnreadCount(_ctx: AdapterContext = { csrfToken: null }): Promise<number> {
  let resp: Response;
  try {
    resp = await fetch("https://github.com/notifications/beacon/count", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    throw new AdapterFailure("getUnreadCount", "network error", { cause: err });
  }
  if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
    return 0;
  }
  if (!resp.ok) {
    throw new AdapterFailure("getUnreadCount", `notifications/beacon/count responded ${resp.status}`);
  }
  let json: unknown;
  try {
    json = (await resp.json()) as unknown;
  } catch (err) {
    throw new AdapterFailure("getUnreadCount", "invalid JSON", { cause: err });
  }
  if (!json || typeof json !== "object") {
    throw new AdapterFailure("getUnreadCount", "unexpected notifications payload");
  }
  const count = (json as { count?: unknown }).count;
  if (typeof count !== "number") {
    throw new AdapterFailure("getUnreadCount", "missing 'count' field");
  }
  return count;
}
