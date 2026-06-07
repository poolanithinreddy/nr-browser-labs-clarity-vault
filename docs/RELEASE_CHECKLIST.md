# Release Checklist

Use this before every public release or store submission.

---

## Pre-release

### Code
- [ ] All tests pass: `node tests/test-utils.js` → `25 passed, 0 failed`
- [ ] Bump `version` in `manifest.json` (semver: major.minor.patch)
- [ ] `manifest.json` JSON is valid (paste into a JSON linter or run `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`)
- [ ] All files referenced in `manifest.json` actually exist:
  - `background/service-worker.js`
  - `content/copy-listener.js`
  - `content/inject.css`
  - `options/index.html`
  - `popup/index.html`
  - `assets/favicon-96x96.png`
  - `assets/web-app-manifest-192x192.png`

### Security
- [ ] No API keys, tokens, or secrets anywhere in the source
- [ ] `grep -r "fetch\|XMLHttpRequest\|WebSocket\|sendBeacon" background/ common/ popup/ options/` → no results
- [ ] No `eval()` or `new Function()` calls
- [ ] Content Security Policy in `manifest.json` is strict: `script-src 'self'; object-src 'self'`

### Privacy
- [ ] options/index.html privacy section is accurate and up to date
- [ ] docs/PRIVACY.md is accurate and up to date
- [ ] No telemetry, analytics, or error-reporting SDK added

### UI/UX
- [ ] Load extension in Chrome and step through the full manual test checklist in `docs/TESTING.md`
- [ ] Test in Firefox (temporary add-on) if targeting Firefox
- [ ] Dark theme looks correct
- [ ] Light theme looks correct (`data-theme="light"` on `<html>`)
- [ ] Popup renders correctly at 420×580 px
- [ ] Options page renders correctly at 780px max-width
- [ ] Empty state (no clips) renders correctly in Recent, Vault, Summary tabs
- [ ] Analyze tab works on a real article

---

## Packaging

### Create zip
```bash
bash scripts/package.sh chrome
# Output: dist/clarity-vault-<version>-chrome.zip
```

For Firefox:
```bash
bash scripts/package.sh firefox
```

### Verify zip contents
```bash
unzip -l dist/clarity-vault-<version>-chrome.zip
```

Expected files — should include:
- `manifest.json`
- `background/service-worker.js`
- `background/xport.js`
- `content/copy-listener.js`
- `content/analyze.js`
- `content/inject.css`
- `popup/index.html`, `popup/styles.css`, `popup/app.js`
- `options/index.html`, `options/styles.css`, `options/app.js`
- `common/*.js`
- `models/tiny-classifier.js`
- `assets/*.png`, `assets/*.svg`, `assets/*.ico`
- `LICENSE`

Should NOT include:
- `.DS_Store` / `Thumbs.db`
- `node_modules/`
- `.git/`
- `docs/`
- `screenshots/*.png` (unless required by the store)
- `tests/`
- `.env`

---

## Screenshots
- [ ] 5 screenshots captured at 1280×800 or 640×400 (see `screenshots/README.md`)
- [ ] Screenshots show real content (not placeholder text)
- [ ] No sensitive personal data visible in screenshots

---

## Chrome Web Store submission
- [ ] Developer account set up at https://chrome.google.com/webstore/devconsole
- [ ] Store listing description is accurate (see `README.md` — store description section)
- [ ] Privacy practices form completed:
  - Data collection: None
  - Sync across devices: No
  - Uses remote code: No
- [ ] Single-purpose description is clear and honest
- [ ] Zip uploaded
- [ ] Screenshots uploaded (at least 1 required, recommend 3–5)

## Firefox AMO submission
- [ ] Signed with `web-ext sign` (requires AMO API key) OR submitted through https://addons.mozilla.org/developers/
- [ ] Source code attached if required (for obfuscation review — this project is plain source, no issue)
- [ ] Tested as temporary add-on in Firefox before submission

---

## Post-release
- [ ] Tag the release in git: `git tag v<version> && git push origin v<version>`
- [ ] Update `ROADMAP.md` to move completed items to a "Released" section
- [ ] Close any related GitHub issues
