# OldGitHub

Restore the 2012–2013 GitHub layout as a Chrome extension. > Status: alpha. Repo-browsing surface is complete (header, repo header, file tree, blob with syntax highlighting, commits list, single commit + diff, compare). Issues, PRs, profile, dashboard, and other auth-gated views are pending. See [`docs/PLAN.md`](docs/PLAN.md) for the full design and release phases.

## What's working

- **Global header** — 2013 Octocat logo, search, primary nav, bell with 60s unread-count poll, create-new + avatar dropdowns
- **Repo header** — title bar with Watch/Star/Fork buttons (links for now), full tab nav (Code / Issues / Pull requests / Actions / Projects / Wiki / Security / Insights / Settings) with active state derived from the URL
- **Repo home (`/:o/:r`)** — branch picker, commits link, clone box (HTTPS / SSH / GitHub CLI tabs + clipboard copy + ZIP download), file tree sorted folders-first with per-row last-commit message and relative age (lazy hydrated), README rendered
- **Tree browsing (`/:o/:r/tree/:ref/:path`)** — breadcrumb + same tree table; commit-info keys remap to the requested basePath
- **Blob view (`/:o/:r/blob/:ref/:path`)** — line-numbered source with `#L<n>` targets, byte size + line count + language pill, Raw / Blame / History buttons, lazy per-language syntax highlighting via `highlight.js` (~32 grammars, one chunk per language). Binary and truncated files handled
- **Commits list (`/:o/:r/commits/:ref[/path]`)** — day-grouped sections with avatar + linked message + author + relative time + short SHA + "Browse files" jump, cursor-based Older/Newer pagination
- **Single commit (`/:o/:r/commit/:sha`)** — full commit message body, authors / committer line, parent SHAs, aggregate stats, per-file diff sections with status badges, unified diff table with hunk headers and add/remove highlighting
- **Compare (`/:o/:r/compare/A...B`)** — base / head ref pills + same diff renderer

## Architecture

- **TypeScript** sources, **Vite** + `@samrum/vite-plugin-web-extension`, **vanilla** rendering (template strings + DOM, no framework)
- **Own router** at content-script `document_start`: intercepts clicks, calls `history.pushState`, neutralizes Turbo
- **Adapter pattern** per endpoint: every scrape lives behind one function that throws `AdapterFailure` on parse mismatch. The dispatcher tears down to vanilla GitHub when an adapter fails, so a single shape change degrades one page rather than the whole extension
- **Body state machine** in `src/router/dispatch.ts` drives mount / unmount transitions across the per-page views, with cache keys for cursors and refs so pagination remounts cleanly
- **30 s in-memory cache** on the repo page HTML so `getRepoSummary` (used by the header) and `getRepoOverview` (used by the body) don't double-fetch
- **`declarativeNetRequest`** blocks the modern GitHub CSS / app bundles only, narrowed to known prefixes

## What's not working yet

- **Issues / PRs** — modern GH lazy-loads these via Relay `preloadedQueries` with auth-gated `IssueIndexPageQuery`; the shape needs to be inspected against a real signed-in session
- **Profile (`/:user`)** — bio / followers / pinned / contribution calendar are all lazy turbo-frame loads on the modern page; needs the same auth-side inspection
- **Dashboard (`/`)** — same
- **Branches / Tags / Releases** — anonymous responses are too thin
- **Wiki, Actions, Projects, Security, Insights, Settings** — each is its own shape; not started
- **Watch / Star / Fork** action buttons currently link to the relevant GH page rather than toggling state; cookie + CSRF POST wiring pending
- **Diff syntax highlighting** in commit / compare views — highlighting wraps line-by-line which needs special handling for `+` / `-` prefixes
- **Dashboard / profile** — full re-skin pending

## Develop

```sh
npm install
npm run dev      # watch build into dist/
```

Load `dist/` in Chrome via `chrome://extensions` → "Load unpacked".

```sh
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run build:icons  # regenerate src/icons/generated.ts from octicons
```

## Stack

- `vite@5.4.21` + `@samrum/vite-plugin-web-extension@5.1.1`
- `typescript@5.4.5`
- `highlight.js@11.11.1` (BSD-3-Clause)
- `octicons@8.5.0` (MIT — legacy package, kept for 2013-era glyphs)
- `@types/chrome`

## License

MIT. See [`LICENSE`](LICENSE).
