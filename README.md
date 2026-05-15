# OldGitHub

Restore the 2012–2013 GitHub layout as a Chrome extension. > Status: pre-alpha. Scaffolding only. See [`docs/PLAN.md`](docs/PLAN.md) for the full design and release phases.

## Develop

```sh
npm install
npm run dev      # watch build into dist/
```

Load `dist/` in Chrome via `chrome://extensions` → "Load unpacked".

```sh
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

## Plan

The full design lives in [`docs/PLAN.md`](docs/PLAN.md). High-level:

- Full UI rebuild on top of GitHub's session-authenticated internal endpoints (Turbo Stream partials, `_graphql`, JSON variants).
- 2013 visual reference locked to a Wayback snapshot date; icons via the legacy MIT `octicons` package; CSS sprites/gradients recreated clean-room.
- TypeScript, vanilla rendering (no framework), Vite + `@samrum/vite-plugin-web-extension`.
- Own router; Turbo neutralized at `document_start`.
- Modern post-2013 features (Actions, Projects, Discussions, Security, Insights) get re-designed in 2013 visual language.
- Codespaces, Copilot, mobile, Marketplace, Sponsors, Enterprise admin are explicitly out of scope.

## License

MIT. See [`LICENSE`](LICENSE).
