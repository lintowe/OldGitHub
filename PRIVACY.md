# OldGitHub — Privacy Policy

_Last updated: 2026-05-21_

OldGitHub is a browser extension that re-renders `github.com` in the 2013-era visual style. It is **fully open source**; the entire code base is published in this repository and the version published to the Chrome Web Store is built directly from it.

## What we collect

**Nothing.** OldGitHub has no error-reporting service, no usage metrics, no remote configuration, no third-party SDKs, and no developer-controlled backend. There is no operator-side data collection of any kind.

## What we access

OldGitHub runs as a content script on `github.com` and a service worker. To do its job it accesses:

- **Your GitHub session cookie**, only when the cookie is sent automatically by the browser to `github.com` / `*.githubusercontent.com` as part of normal page fetches. The cookie is never read directly by the extension, never copied, never sent anywhere else.
- **Local browser storage (`chrome.storage.sync`)** to remember your chosen theme (`light`, `dark`, or `auto`). This data lives in your browser/Google profile and is never transmitted by the extension.

The host permissions in the production manifest are limited to:

- `https://github.com/*`
- `https://*.githubusercontent.com/*`

These are the only hosts the extension can contact, and the only traffic it generates is the same traffic that the GitHub website itself would generate when you browse.

## Where data goes

It doesn't. All requests stay inside the GitHub network (api.github.com, raw.githubusercontent.com, etc.) and use your existing session cookie. There is no `oldgithub.example.com`, no proxy server, no log aggregator, no third-party endpoint.

## Cookies, tracking, advertising

OldGitHub does not set cookies, does not use ad networks, does not fingerprint, does not track across sessions, and does not share any data with advertisers or analytics providers (there are none).

## Children's privacy

OldGitHub is not directed at children under 13. Because it collects nothing, there is no children's data to protect, but the extension is intended for the general developer audience that already uses GitHub.

## Changes to this policy

If the data-handling behavior ever changes (it currently is "none"), this file will be updated and the change will land in a tagged commit so the diff is auditable.

## Contact

Privacy concerns, bugs, or security issues: file a public issue on the repository, or email the address listed in the repository owner's GitHub profile.
