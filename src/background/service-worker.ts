import { isFullyCoveredUrl } from "@/router/resolve";

const ResourceType = chrome.declarativeNetRequest.ResourceType;
const RuleActionType = chrome.declarativeNetRequest.RuleActionType;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.storage.sync.set({ theme: "auto" });
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

type RuleSpec = {
  urlFilter: string;
  resourceType: chrome.declarativeNetRequest.ResourceType;
};

const BLOCK_SPECS: readonly RuleSpec[] = [
  { urlFilter: "||github.githubassets.com/assets/", resourceType: ResourceType.STYLESHEET },
  { urlFilter: "||github.githubassets.com/assets/react-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/wp-runtime-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/app_assets_modules_", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/environment-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/behaviors-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/vendors-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/chunk-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/notifications-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/webpack_", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/primer-", resourceType: ResourceType.SCRIPT },
  { urlFilter: "||github.githubassets.com/assets/element-", resourceType: ResourceType.SCRIPT },
];

const RULES_PER_TAB = BLOCK_SPECS.length;
const RULE_ID_BASE = 1000;
const MAX_RULE_ID = 1_000_000_000;

function ruleIdsFor(tabId: number): number[] {
  const base = RULE_ID_BASE + tabId * RULES_PER_TAB;
  if (base + RULES_PER_TAB >= MAX_RULE_ID) return [];
  return Array.from({ length: RULES_PER_TAB }, (_, i) => base + i);
}

async function enableForTab(tabId: number): Promise<void> {
  const ids = ruleIdsFor(tabId);
  if (ids.length === 0) return;
  const addRules: chrome.declarativeNetRequest.Rule[] = BLOCK_SPECS.map((spec, i) => ({
    id: ids[i]!,
    priority: 1,
    action: { type: RuleActionType.BLOCK },
    condition: {
      urlFilter: spec.urlFilter,
      resourceTypes: [spec.resourceType],
      tabIds: [tabId],
      initiatorDomains: ["github.com"],
    },
  }));
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: ids,
      addRules,
    });
  } catch (err) {
    console.debug("[oldgh] enableForTab failed:", err);
  }
}

async function disableForTab(tabId: number): Promise<void> {
  const ids = ruleIdsFor(tabId);
  if (ids.length === 0) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch (err) {
    console.debug("[oldgh] disableForTab failed:", err);
  }
}

async function reconcile(tabId: number, url: string | undefined): Promise<void> {
  if (!url) {
    await disableForTab(tabId);
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    await disableForTab(tabId);
    return;
  }
  if (parsed.hostname !== "github.com") {
    await disableForTab(tabId);
    return;
  }
  const search = parsed.search.startsWith("?") ? parsed.search.slice(1) : parsed.search;
  if (isFullyCoveredUrl(parsed.pathname, search)) {
    await enableForTab(tabId);
  } else {
    await disableForTab(tabId);
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url) {
    void reconcile(tabId, info.url);
  } else if (info.status === "loading" && tab.url) {
    void reconcile(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void disableForTab(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg as { type?: unknown; pathname?: unknown; search?: unknown };
  if (m.type !== "oldgh:route-change") return;
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return;
  if (typeof m.pathname !== "string") return;
  const search = typeof m.search === "string" ? m.search : "";
  if (isFullyCoveredUrl(m.pathname, search)) {
    void enableForTab(tabId);
  } else {
    void disableForTab(tabId);
  }
});
