# Privacy Model

Clarity Vault is designed as a 100% local-first extension. This document explains exactly what is stored, where, and what is never collected.

---

## What is stored

| Data | Where | Why |
|---|---|---|
| Clip text (up to 8000 chars) | `chrome.storage.local` | Core functionality — to let you search and re-read captured content |
| Clip metadata (URL, domain, title, timestamp, tags) | `chrome.storage.local` | To show you where a clip came from and allow filtering |
| Settings (theme, maxClips, ignoreList, etc.) | `chrome.storage.local` | To persist your preferences |
| UI preferences (compact mode, text-preview toggle) | `chrome.storage.local` | To persist popup layout choices |

All data lives **exclusively in `chrome.storage.local`** — a sandboxed browser storage area private to this extension on this device.

---

## What is never collected

- No user account or identity
- No email address
- No analytics events or usage metrics
- No crash reports sent to any server
- No clipboard content sent to any server
- No page content sent to any server
- No cross-device sync
- No third-party SDKs

---

## Network activity

**None.**

The extension makes zero outbound network requests. There are no:
- API calls
- Telemetry endpoints
- CDN fetches at runtime
- External font or asset loads

All assets (scripts, styles, icons, classifier) are bundled inside the extension package.

---

## Permissions explained

### `storage`
Used to read and write `chrome.storage.local`. Scoped only to this extension's data.

### `activeTab`
Grants temporary access to the currently active tab when the user clicks "Analyze this page". Access is limited to that single tab and that single action.

### `scripting`
Required to inject `content/analyze.js` (the page analyzer) and `content/copy-listener.js` (the copy capture script) into tabs. Used only when the user explicitly enables a feature.

### `contextMenus`
Adds a "Save selection to Clarity Vault" option to the browser right-click menu. Used to capture text when the normal copy event is blocked by a site.

### `host_permissions: <all_urls>`
Declared in the manifest so the bundled copy listener can run on supported pages. The listener checks the local Auto-capture setting before saving anything, and remains inert when Auto-capture is off.

---

## AI analysis (local-only)

The **Summarize** feature uses a local TextRank algorithm (`common/summarize.js`) running entirely in your browser. No text is sent to any AI API.

The **Analyze page** feature uses rule-based keyword matching and an optional weighted lexicon classifier (`models/tiny-classifier.js`) that is bundled with the extension. No text is sent to any external model or API.

---

## How to delete your data

### Delete all clips
- In the popup Settings tab: click **Delete all clips**.
- In the options page (Data Management section): click **Delete all clips**.

### Delete everything (including settings)
- Go to `chrome://extensions` → Clarity Vault → "Remove extension". All `chrome.storage.local` data for this extension is deleted automatically.

### Export before deleting
- Popup → Vault tab → **Export JSON** or **Export MD** to download a local backup.
- Options page → Data Management → **JSON** or **Markdown** buttons.

---

## Ignore list

You can add domains to the ignore list (Settings → "Domain ignore list"). Clips from those domains will never be saved, regardless of whether Auto-capture is enabled.

---

## Source code

This extension is open source under the MIT License. You can verify these privacy claims by reading the source code directly.
