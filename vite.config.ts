import { defineConfig } from "vite";
import webExtension from "@samrum/vite-plugin-web-extension";
import { resolve } from "node:path";
import { buildManifest } from "./src/manifest.config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    webExtension({
      manifest: buildManifest(mode === "development" ? "development" : "production"),
    }),
  ],
  build: {
    target: "chrome110",
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
  },
}));
