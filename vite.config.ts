import { defineConfig } from "vite";
import webExtension from "@samrum/vite-plugin-web-extension";
import { resolve } from "node:path";
import { manifest } from "./src/manifest.config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    webExtension({
      manifest,
    }),
  ],
  build: {
    target: "chrome110",
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
  },
});
