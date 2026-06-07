# Roadmap

This is an honest list of planned improvements — nothing is committed or promised on a timeline.

---

## Near-term

**v1.1 — Polish**
- [ ] Keyboard shortcut to open the popup (`Ctrl+Shift+V` / `Cmd+Shift+V`)
- [ ] Clip editing: allow manual edits to saved clip text
- [ ] Better tag editor: add/remove tags from the clip detail view
- [ ] "Copy as Markdown" option alongside existing copy actions
- [ ] Clip type badges in the vault (code / article / price)
- [ ] Infinite scroll or "load more" in the vault instead of the current slice

**v1.2 — Capture improvements**
- [ ] Image capture: save `<img>` alt-text or data URI for copied image elements
- [ ] Table detection: pretty-print copied tables
- [ ] Code block detection: preserve monospace formatting for code clips
- [ ] Per-site auto-capture toggle (allow/deny specific origins without using the ignore list)

---

## Medium-term

**v2.0 — Improved search**
- [ ] Full-text search with token matching (not just substring)
- [ ] Search ranking by relevance (TextRank scores)
- [ ] Search highlighting in results
- [ ] Filter by clip type (code / article / price / study)
- [ ] Date range filter

**v2.1 — Analyze improvements**
- [ ] Toggle individual label types from the Analyze tab (show/hide Opinion only, etc.)
- [ ] Overlay dim mode: fade non-matching paragraphs
- [ ] Export labeled data as JSON (for review or further analysis)
- [ ] Improved classifier: train a real quantized TFLite or ONNX model and replace the lexicon classifier
  - Target: < 5 MB model, bundled, no remote fetch
- [ ] Support for shadow DOM and iframes (best-effort)

---

## Long-term / exploratory

**Local summarization quality**
- [ ] Explore running a tiny WASM-based language model (e.g. Phi-2 distilled) for generative summaries
  - Hard constraint: must remain 100% local, no API keys
  - Size budget: < 50 MB total

**Sessions / workspaces**
- [ ] Group clips into named sessions ("Research session 2025-06-01", "Meeting notes")
- [ ] Session export as a single document

**Firefox full compatibility**
- [ ] Resolve `persistAcrossSessions` limitation for the copy-listener content script
- [ ] AMO (addons.mozilla.org) submission once stable

**Sync (opt-in, self-hosted)**
- [ ] Optional sync to a user-controlled endpoint (local server or Syncthing)
- [ ] Never use any hosted cloud service

---

## Known limitations (honest)

- `persistAcrossSessions: true` is not supported in Firefox — the copy listener content script must be re-registered on each browser session in Firefox.
- The page analyzer does not handle shadow DOM or cross-origin iframes.
- The TextRank summarizer is extractive — it selects existing sentences; it does not generate new text.
- The lexicon classifier is rule-based and will produce false positives/negatives on unusual text patterns.
- `chrome.storage.local` has a default 10 MB quota (5 MB on some Firefox versions). With large clips and the default 500-clip cap, this is rarely hit in practice, but the extension does not warn when approaching the limit.
