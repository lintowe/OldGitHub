import { AdapterFailure } from "@/adapters";
import { renderFallback } from "@/views/fallback";

type Route = { kind: "out-of-scope" } | { kind: "todo"; name: string };

export async function dispatchRoute(loc: Location | URL): Promise<void> {
  const route = resolveRoute(loc);
  try {
    switch (route.kind) {
      case "out-of-scope":
        renderFallback("out-of-scope");
        return;
      case "todo":
        renderFallback(`todo:${route.name}`);
        return;
    }
  } catch (err) {
    if (err instanceof AdapterFailure) {
      renderFallback(`adapter-failure:${err.name}`);
      return;
    }
    throw err;
  }
}

const OUT_OF_SCOPE_PREFIXES = [
  "/codespaces",
  "/marketplace",
  "/sponsors",
  "/enterprises",
];

function resolveRoute(loc: Location | URL): Route {
  const pathname = "pathname" in loc ? loc.pathname : "/";
  for (const prefix of OUT_OF_SCOPE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return { kind: "out-of-scope" };
    }
  }
  return { kind: "todo", name: pathname };
}
