# Testing Guide

Clarity Vault has no automated browser tests (there is no bundler or test runner configured for the extension UI). Testing is done manually by loading the extension as unpacked in Chrome and running through the checklist below.

The utility modules (`clean.js`, `url.js`, `summarize.js`) have Node-runnable smoke tests.

---

## Running utility tests

```bash
node tests/test-utils.js
```

Expected output: `25 passed, 0 failed`.

These tests cover:
- Text cleaning (smart quotes, whitespace, bullets)
- `detectType` classification (code, price, study, article, text)
- `autoTags` tag generation
- URL tracking parameter removal (utm_*, fbclid, gclid, msclkid, etc.)
- TextRank summarizer (short text, long text, null input)

---

## Load the extension for manual testing

### Chrome / Edge
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/` folder (the one containing `manifest.json`).
5. The Clarity Vault icon appears in the toolbar.

### Firefox (temporary)
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extension/manifest.json`.
4. The extension loads until Firefox is closed.

---

## Manual test checklist

### Copy capture

- [ ] Open any article (e.g. a news site).
- [ ] Select and copy a paragraph.
- [ ] Open the popup → Recent tab.
- [ ] Verify the clip appears with correct domain, timestamp, and text preview.
- [ ] Verify duplicate clips are not created within ~5 seconds.

### Context menu save

- [ ] Right-click a selected text on any page.
- [ ] Click "Save selection to Clarity Vault".
- [ ] Open the popup → Recent tab.
- [ ] Verify the selection was saved with the correct source URL.
- [ ] Test on a site that blocks the `copy` event (e.g. some paywalled sites).

### Recent tab

- [ ] Multiple clips are visible after capturing from a few pages.
- [ ] Compact mode toggle switches between list and 2-column tile view.
- [ ] Text preview toggle shows/hides clip text in compact view.
- [ ] "Today" badge appears for clips captured today.
- [ ] Clicking a clip navigates to the Summary tab and loads that clip.

### Vault tab

- [ ] All clips are listed.
- [ ] Domain filter shows only clips from the selected domain.
- [ ] Tag filter shows only clips with that tag.
- [ ] Starred filter shows only starred clips.
- [ ] Quick-search filters results across all fields (text, title, domain, tags).
- [ ] Star button toggles star state persistently.
- [ ] Delete button removes the clip.
- [ ] Copy button writes the clip text to the clipboard.
- [ ] Open button opens the source URL.
- [ ] Export JSON downloads a valid JSON file with `{ version, exportedAt, clips[] }`.
- [ ] Export Markdown downloads a readable Markdown file.
- [ ] Import JSON merges clips from a previously exported file without duplicates.
- [ ] "Delete all" clears all clips after confirmation.

### Summary tab

- [ ] When no clip is selected: empty state message is shown.
- [ ] After clicking a clip from Recent/Vault: clip loads in Summary.
- [ ] Short clips (< 400 chars): full text is shown, no truncation.
- [ ] Long clips: local TextRank summary appears in the top box.
- [ ] "Copy summary" copies the summary to clipboard.
- [ ] "Copy original" copies the full original text.
- [ ] "Original text" disclosure section shows/hides the full original.
- [ ] Summary tab header shows "Local Summary" and "Extractive · On-device" badge.

### Analyze tab

- [ ] Click "Analyze this page" on a real article.
- [ ] Permission prompt may appear (allow it).
- [ ] Chip labels (Opinion, Promotional, Potentially Toxic, Neutral/Factual) appear on paragraphs.
- [ ] Hovering a chip shows a tooltip with label, reason, and confidence percentage.
- [ ] "Clear labels" removes all chips from the page.
- [ ] Re-running Analyze does not create duplicate chips.
- [ ] On a `chrome://` or `about:` URL: analyze fails gracefully with an error message.
- [ ] Status message updates correctly for success, denied, and failure states.

### Settings tab (popup)

- [ ] Theme selector changes the popup theme immediately (System / Light / Dark).
- [ ] Auto-capture toggle triggers a permission prompt when enabling.
- [ ] Toggling Auto-capture off unregisters the content script.
- [ ] Max clips field accepts 50–2000 and saves.
- [ ] Auto-summarize and URL cleaning toggles persist.
- [ ] Ignore list saves and prevents clips from listed domains.
- [ ] "Delete all clips" works with confirmation.
- [ ] "Open full settings page →" opens the options page.

### Options page

- [ ] Opens automatically on first install.
- [ ] All settings match the popup settings (they share the same storage).
- [ ] Changing a setting in options is reflected in the popup and vice versa.
- [ ] Export JSON / Markdown download files correctly.
- [ ] Import JSON works and shows status feedback.
- [ ] "Delete all clips" works with confirmation.
- [ ] Diagnostics section shows correct clip count, storage %, and latency.
- [ ] Theme changes apply to the options page itself.
- [ ] Firefox extension version is shown correctly.

### Ignore list

- [ ] Add `example.com` to ignore list.
- [ ] Copy text from `example.com`.
- [ ] Verify no new clip appears in Recent.

### Privacy / network check

- [ ] Open DevTools → Network tab → reload popup: zero requests logged.
- [ ] Capture a clip: zero network requests logged.
- [ ] Run Analyze: zero network requests logged.
- [ ] No `fetch`, `XMLHttpRequest`, or WebSocket calls visible at any point.

### Edge cases

- [ ] Empty vault: empty state renders correctly in Recent and Vault tabs.
- [ ] Copying an empty selection: no clip saved.
- [ ] Copying a 2-char string: no clip saved (minimum length guard).
- [ ] Import of invalid JSON: user-facing error message shown.
- [ ] Clip at storage limit (maxClips): oldest clip is removed (LRU cap).

---

## What is not tested

- Visual regression (no snapshot tests).
- Cross-browser pixel-perfect rendering (check manually in Firefox if targeting it).
- Extension store submission process.
