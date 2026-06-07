# Architecture

Clarity Vault is a plain Manifest V3 browser extension with no build step, no bundler, and no external dependencies.

## Core design principles

- **Local-first**: all data lives in `chrome.storage.local`. Nothing ever touches the network.
- **No build pipeline**: vanilla ES modules for background/options, classic scripts for content (MV3 content scripts cannot be modules).
- **Minimal permissions**: only `storage`, `activeTab`, `scripting`, and `contextMenus` are declared upfront. The `<all_urls>` host permission is declared but only activated at runtime when the user explicitly enables a feature.

---

## Process model

| Process | Entry point | Script type | Notes |
|---|---|---|---|
| **Service worker** | `background/service-worker.js` | ES module | Handles all message routing, storage, and scripting API calls |
| **Popup** | `popup/app.js` | ES module | Rendered on demand; communicates via `chrome.runtime.sendMessage` |
| **Options page** | `options/app.js` | ES module | Full settings page; communicates the same way |
| **Copy listener** | `content/copy-listener.js` | Classic script | Injected by scripting API; listens for `copy` events |
| **Analyzer** | `content/analyze.js` | Classic script | Injected on demand; labels page paragraphs |

---

## Data flow

```
User copies text
      │
      ▼
content/copy-listener.js
  sendMessage("saveClip")
      │
      ▼
background/service-worker.js
  cleanTextForSource()           ← common/clean.js
  cleanUrlTracking()             ← common/url.js
  addClip()                      ← common/storage.js
      │
      ▼
chrome.storage.local
  { clips: Clip[], settings: Settings }
      │
      ▼
popup/app.js (getClips)
  summarize()                    ← common/summarize.js
  Render Recent / Vault / Summary tabs
```

```
User clicks "Analyze this page"
      │
      ▼
popup/app.js
  sendMessage("analyzePage")
      │
      ▼
background/service-worker.js
  ensureAnalyzePermission()
  scripting.insertCSS(inject.css)
  scripting.executeScript(analyze.js)
      │
      ▼
content/analyze.js (in-page)
  classifyRules()  ←  rule-based heuristics
  loadLocalModel() ←  models/tiny-classifier.js (lazy)
  createChip()     ←  injects .cv-chip spans into DOM
```

---

## Module map

```
extension/
├── manifest.json
├── background/
│   ├── service-worker.js   ← central dispatcher
│   └── xport.js            ← JSON/Markdown export formatters
├── content/
│   ├── copy-listener.js    ← copy event capture (classic script)
│   ├── analyze.js          ← page labeler (classic script)
│   └── inject.css          ← chip + hover styles
├── popup/
│   ├── index.html
│   ├── styles.css
│   └── app.js              ← 5-tab popup UI (ES module)
├── options/
│   ├── index.html
│   ├── styles.css
│   └── app.js              ← full settings page (ES module)
├── common/
│   ├── api.js              ← chrome/browser API normalizer
│   ├── storage.js          ← Clip + Settings CRUD
│   ├── clean.js            ← text normalization, type detection, tagging
│   ├── url.js              ← tracking param removal
│   └── summarize.js        ← TextRank summarizer
├── models/
│   └── tiny-classifier.js  ← optional local classifier (lazy-loaded)
├── assets/                 ← extension icons
├── tests/
│   └── test-utils.js       ← Node-runnable smoke tests
├── screenshots/            ← store screenshots (add before publishing)
└── docs/                   ← this directory
```

---

## Storage schema

```ts
// chrome.storage.local keys:
{
  clips: Clip[];           // array, sorted newest-first
  settings: Settings;      // single object
  cv_ui_prefs: UIPrefs;   // popup compact/tile prefs
}

type Clip = {
  id:          string;
  text:        string;        // cleaned, capped at 8000 chars
  preview:     string;        // first 600 chars
  rawHtml?:    string;
  sourceUrl:   string;
  sourceTitle: string;
  domain:      string;
  type:        'text'|'code'|'article'|'price'|'study'|'other';
  tags:        string[];
  createdAt:   number;        // ms since epoch
  favorite:    boolean;
  truncated?:  boolean;
};

type Settings = {
  maxClips:            number;   // LRU cap, default 500
  theme:               'system'|'light'|'dark';
  autoSummarize:       boolean;
  autoCleanUrls:       boolean;
  ignoreList:          string[]; // domains to skip
  cceEnabled:          boolean;
  blockedLabels:       string[];
  autoCaptureEnabled:  boolean;
};
```

---

## Cross-browser notes

| Feature | Chrome/Chromium | Firefox |
|---|---|---|
| MV3 service worker | ✅ Full support | ✅ Firefox 109+ (type:module) |
| `chrome.scripting` | ✅ | ✅ (FF 102+) |
| `chrome.permissions.request` | ✅ | ✅ (must be user gesture) |
| Dynamic `import()` in content scripts | ✅ | ✅ (for web-accessible resources) |
| `chrome.scripting.registerContentScripts` | ✅ | ⚠ Partial; may require fallback |
| `persistAcrossSessions` (content scripts) | ✅ | ⚠ Not supported; scripts re-register on each session |

The `common/api.js` module normalizes `chrome.*` callbacks to Promises and re-exports a unified `api` object that works with both the `chrome` and `browser` global.
