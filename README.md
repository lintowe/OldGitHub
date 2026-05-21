# OldGitHub

Restore the 2012–2013 GitHub layout as a Chrome extension. Renders signed-in `github.com` pages in the classic 2013 interface in both light and dark themes. authentication is your existing `github.com` session cookie and all data comes from GitHub's own REST/GraphQL and HTML.

## What's themed

- **Top-level** — dashboard, notifications, search, your issues / pulls / stars / watching, explore, trending, marketplace, topics index + detail, collections, sponsors, account settings
- **Profile** — overview with pinned repos + contribution calendar + activity, followers, following, achievements, projects, packages, sponsoring, people, repositories, stars
- **Repo** — home (branch picker, clone box with HTTPS / SSH / GitHub CLI tabs + ZIP download, sorted file tree with last-commit info, README), tree browser, blob view with syntax highlighting (~32 languages) and Raw / Blame / History buttons, commits list with day grouping and pagination, single commit + diff, compare view, issues list and detail (with reactions and labels), pull request list and detail (conversation / files / commits / checks), wiki, actions runs + workflow detail, pulse, graphs (contributors / commit activity / code frequency / traffic / community / network), projects, security (overview + advisories), repo settings, repo discussions list and detail
- **Hovercards** — user and repo previews on links throughout the site
- **Header** — 2013 Octocat-era top bar with primary nav, search, notifications poll, create-new + avatar dropdowns

## What stays native (with the themed header on top)

A few pages are JS-only React forms that can't be scraped without their runtime (`/new`, `/import`, `/login`, `/signup`, `/account/...`, issue / discussion / release / PR create forms, fork dialog, etc.). For those the extension keeps the themed header at the top of the page and lets GitHub's native body render below, so submit flows still work normally.

The same pattern applies to **gist.github.com**: the themed top bar appears on every gist page (links rewrite to absolute github.com so navigation works), and the native gist body renders below with its own typography preserved.

## Architecture

- **TypeScript** sources, **Vite** + `@samrum/vite-plugin-web-extension`, **vanilla** rendering (template strings + DOM, no framework)
- **Own router** at content-script `document_start`: intercepts clicks, calls `history.pushState`, neutralizes Turbo
- **Adapter pattern** per endpoint: every scrape lives behind one function that throws `AdapterFailure` on parse mismatch. The dispatcher tears down to vanilla GitHub when an adapter fails, so a single shape change degrades one page rather than the whole extension
- **Body state machine** in `src/router/dispatch.ts` drives mount / unmount transitions across the per-page views, with cache keys for cursors and refs so pagination remounts cleanly
- **In-memory caches** on the repo and profile pages so the header and body don't double-fetch
- **`declarativeNetRequest`** blocks the modern GitHub CSS / app bundles only on themed pages, narrowed to known prefixes

## Develop

```sh
npm install
npm run dev      # watch build into dist/
```

Load `dist/` in Chrome via `chrome://extensions` → "Load unpacked".

```sh
npm run build      # production build (Chrome Web Store-ready)
npm run typecheck  # tsc --noEmit
npm run build:icons      # regenerate src/icons/generated.ts from octicons
npm run build:ext-icons  # regenerate public/icons/icon-{16,32,48,128}.png
```

The dev build adds `http://localhost:7878/*` to host_permissions and a background poller that auto-reloads the extension on rebuild. The production build strips both — the production manifest only requests `https://github.com/*` and `https://*.githubusercontent.com/*`.

## Stack

- `vite@5.4.21` + `@samrum/vite-plugin-web-extension@5.1.1`
- `typescript@5.4.5`
- `highlight.js@11.11.1` (BSD-3-Clause)
- `octicons@8.5.0` (MIT — legacy package, kept for 2013-era glyphs)
- `@types/chrome`

## License

MIT. See [`LICENSE`](LICENSE).
