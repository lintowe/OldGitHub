# OldGitHub — Privacy Policy

_Last updated: 2026-05-21_

OldGitHub is a browser extension that re-renders `github.com` in its 2013-era visual style. The source code is published in this repository and the Chrome Web Store build is produced directly from it.

## Data handled by the extension

- **GitHub session cookie** — sent automatically by the browser when the extension fetches pages from `github.com` and `*.githubusercontent.com` to render the themed views. The cookie is never read directly by the extension code, copied, or transmitted elsewhere.
- **`chrome.storage.sync`** — stores the user's chosen theme (`light`, `dark`, or `auto`). This setting lives in the user's browser/Google profile.

The extension's production manifest restricts host access to:

- `https://github.com/*`
- `https://gist.github.com/*`
- `https://*.githubusercontent.com/*`

All network traffic stays within these hosts and is the same traffic a normal browser session would generate while using GitHub.

## Changes to this policy

If the data-handling behavior changes, this file will be updated and the change will land in a tagged commit so the diff is auditable.

## Contact

Bugs, security issues, or privacy questions: file a public issue on the repository.
