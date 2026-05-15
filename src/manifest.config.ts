import pkg from "../package.json" with { type: "json" };

export const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: "OldGitHub",
  version: pkg.version,
  description: "Restore the 2012-2013 GitHub layout.",
  minimum_chrome_version: "110",

  action: {
    default_title: "OldGitHub",
  },

  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["https://github.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_start",
      all_frames: false,
    },
  ],

  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },

  permissions: ["storage", "scripting", "declarativeNetRequest"],
  host_permissions: [
    "https://github.com/*",
    "https://*.githubusercontent.com/*",
  ],

  web_accessible_resources: [
    {
      resources: ["styles/2013.css", "assets/*"],
      matches: ["https://github.com/*"],
    },
  ],
};
