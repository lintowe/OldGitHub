// tiny HTTP server that the extension's service worker polls.
// the SW reloads itself whenever the build-id changes.
// the actual file change is detected by watching dist/manifest.json mtime
// (vite --watch rewrites the manifest on every rebuild).

import { createServer } from "node:http";
import { stat, watch, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";

const PORT = 7878;
const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, "dist");
const PUBLIC_DIR = resolve(ROOT, "public");
const STAMP_FILE = resolve(DIST_DIR, "manifest.json");

let buildId = String(Date.now());

async function refreshStamp() {
  if (!existsSync(STAMP_FILE)) return;
  try {
    const s = await stat(STAMP_FILE);
    const next = String(Math.floor(s.mtimeMs));
    if (next !== buildId) {
      buildId = next;
      console.log(`[dev-reload] new build-id ${buildId}`);
    }
  } catch (e) {
    console.warn(`[dev-reload] stat failed: ${e.message}`);
  }
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/build-id") {
    res.setHeader("Content-Type", "text/plain");
    res.end(buildId);
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[dev-reload] listening on http://localhost:${PORT}/build-id`);
});

// watch the dist directory for changes
async function watchLoop() {
  await refreshStamp();
  while (true) {
    try {
      if (!existsSync(DIST_DIR)) {
        await sleep(500);
        continue;
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30_000);
      try {
        const watcher = watch(DIST_DIR, { recursive: false, signal: ac.signal });
        for await (const ev of watcher) {
          if (ev.filename && /manifest\.json$/.test(ev.filename)) {
            // small debounce
            await sleep(150);
            await refreshStamp();
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") throw e;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      console.warn(`[dev-reload] watcher error: ${e.message}`);
      await sleep(1000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function publicWatcher() {
  if (!existsSync(PUBLIC_DIR)) return;
  while (true) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 60_000);
      try {
        const watcher = watch(PUBLIC_DIR, { recursive: true, signal: ac.signal });
        for await (const ev of watcher) {
          if (!ev.filename) continue;
          const src = resolve(PUBLIC_DIR, ev.filename);
          if (!existsSync(src)) continue;
          const rel = relative(PUBLIC_DIR, src);
          const dest = resolve(DIST_DIR, rel);
          try {
            await mkdir(dirname(dest), { recursive: true });
            await copyFile(src, dest);
            console.log(`[dev-reload] copied public/${rel} -> dist/${rel}`);
            // bump build id so SW reloads
            buildId = String(Date.now());
            console.log(`[dev-reload] new build-id ${buildId}`);
          } catch (err) {
            console.warn(`[dev-reload] copy failed: ${err.message}`);
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") throw e;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      console.warn(`[dev-reload] public watcher error: ${e.message}`);
      await sleep(1000);
    }
  }
}

watchLoop();
publicWatcher();
