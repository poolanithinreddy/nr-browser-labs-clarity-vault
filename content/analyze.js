// content/analyze.js — Classic content script (no imports/exports).
// Injected on demand via chrome.scripting.executeScript.
// Labels paragraphs with Opinion / Promotional / Potentially Toxic / Neutral chips.
// Re-entrant safe: window.__clarityVaultAnalyzeAttached guards double injection.

(function () {
  if (window.__clarityVaultAnalyzeAttached) return;
  window.__clarityVaultAnalyzeAttached = true;

  // ─── Rule sets ──────────────────────────────────────────────────────────────
  const RULES = {
    opinion: /\b(i think|we think|i believe|we believe|i feel|we feel|in my opinion|in our opinion|i suspect|i guess|seems like|seems to|appears to|likely|should|could|probably|arguably|i'd argue|possibly|perhaps)\b/i,
    promo:   /\b(sponsored|affiliate|promotion|promotional|deal|discount|buy now|limited time|offer expires|partner|advertisement|ad\b|shop now|click here|sign up now|free trial)\b/i,
    toxic:   /\b(hate|idiot|stupid|dumb|loser|trash|kill yourself|shut up|moron|nazi|racist|bigot|worthless)\b/i,
  };

  // Label display config
  const LABEL_CONFIG = {
    'Opinion':           { color: '#f59e0b' },
    'Promotional':       { color: '#10b981' },
    'Potentially Toxic': { color: '#ef4444' },
    'Neutral/Factual':   { color: '#6b7280' },
  };

  // ─── State ──────────────────────────────────────────────────────────────────
  const chips   = new WeakMap(); // element → chip DOM node
  const labeled = [];            // all labeled elements (for bulk removal)
  let hoverEl   = null;
  let prevHref  = location.href;
  let mutObs    = null;

  // ─── Local model (optional, lazy-loaded) ────────────────────────────────────
  async function loadLocalModel() {
    try {
      if (window.__cv_model) return window.__cv_model;
      const url = chrome.runtime.getURL('models/tiny-classifier.js');
      const mod = await import(url);
      window.__cv_model = await mod.loadModel();
      return window.__cv_model;
    } catch { return null; }
  }

  // ─── Classification ─────────────────────────────────────────────────────────
  function classifyRules(text) {
    const t = text.trim();
    if (!t) return { label: 'Neutral/Factual', reason: 'Empty text', conf: 0.0 };
    if (RULES.toxic.test(t))   return { label: 'Potentially Toxic', reason: 'Matched toxic keywords',       conf: 0.85 };
    if (RULES.promo.test(t))   return { label: 'Promotional',       reason: 'Matched promotional terms',    conf: 0.75 };
    if (RULES.opinion.test(t)) return { label: 'Opinion',           reason: 'Matched opinion phrases',      conf: 0.70 };
    return                            { label: 'Neutral/Factual',   reason: 'No strong signal detected',    conf: 0.50 };
  }

  async function classify(text) {
    const base  = classifyRules(text);
    const model = await loadLocalModel();
    if (!model) return base;
    try {
      const probs = await model.predict(text);
      let topLabel = base.label;
      let top      = base.conf;
      for (const [k, v] of Object.entries(probs || {})) {
        if (v > top) { top = v; topLabel = k; }
      }
      // Only prefer model when it is clearly more confident
      if (top >= Math.max(0.75, base.conf + 0.1) && topLabel !== base.label) {
        return { label: topLabel, reason: 'Model vote (weighted lexicon)', conf: top };
      }
      return base;
    } catch { return base; }
  }

  // ─── Chip rendering ──────────────────────────────────────────────────────────
  function createChip(label, reason, conf) {
    const chip = document.createElement('span');
    chip.className  = 'cv-chip';
    chip.dataset.l  = label;
    chip.textContent = label;
    chip.title = `${label} — ${reason} (${(conf * 100).toFixed(0)}% confidence)`;
    chip.addEventListener('mouseenter', () => showHover(chip, label, reason, conf));
    chip.addEventListener('mouseleave',  hideHover);
    return chip;
  }

  function showHover(anchor, label, reason, conf) {
    hideHover();
    const box  = anchor.getBoundingClientRect();
    hoverEl    = document.createElement('div');
    hoverEl.className = 'cv-hover';
    hoverEl.textContent = `${label} — ${reason} · ${(conf * 100).toFixed(0)}% confidence`;
    document.body.appendChild(hoverEl);
    // Position below anchor, clamped to viewport
    const x = Math.min(window.innerWidth  - hoverEl.offsetWidth  - 12, Math.max(12, box.left));
    const y = Math.min(window.innerHeight - hoverEl.offsetHeight - 12, box.bottom + 6);
    hoverEl.style.left = `${x + window.scrollX}px`;
    hoverEl.style.top  = `${y + window.scrollY}px`;
  }

  function hideHover() {
    if (hoverEl) { hoverEl.remove(); hoverEl = null; }
  }

  // ─── DOM eligibility ─────────────────────────────────────────────────────────
  function eligible(node) {
    if (!(node instanceof HTMLElement)) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (['SCRIPT','STYLE','NOSCRIPT','SVG','CANVAS',
         'NAV','ASIDE','FOOTER','HEADER','IMG','VIDEO',
         'INPUT','TEXTAREA','BUTTON','IFRAME','FORM'].includes(node.tagName)) return false;
    if (node.closest('.cv-chip, .cv-hover')) return false;
    return true;
  }

  function forEachTextBlock(cb) {
    document.querySelectorAll('p, article p, div, li, blockquote, section p').forEach(node => {
      if (!eligible(node)) return;
      const text = (node.innerText || '').trim();
      if (text.length < 40) return; // skip tiny fragments
      cb(node, text);
    });
  }

  // ─── Apply / clear labels ────────────────────────────────────────────────────
  async function applyLabels() {
    const tasks = [];
    forEachTextBlock((node, text) => {
      if (chips.has(node)) return; // already labeled
      tasks.push((async () => {
        const { label, reason, conf } = await classify(text);
        if (!eligible(node)) return; // re-check after async gap
        const chip = createChip(label, reason, conf);
        chips.set(node, chip);
        node.appendChild(chip);
        labeled.push(node);
      })());
    });
    await Promise.allSettled(tasks);
  }

  function clearLabels() {
    labeled.forEach(node => {
      const chip = chips.get(node);
      if (chip?.parentNode) chip.remove();
      node.classList.remove('cv-nonmatch');
      chips.delete(node);
    });
    labeled.length = 0;
    hideHover();
    document.documentElement.classList.remove('cv-dim');
  }

  // ─── SPA route detection ─────────────────────────────────────────────────────
  function startMutationObserver() {
    mutObs = new MutationObserver(() => {
      if (location.href !== prevHref) {
        prevHref = location.href;
        clearLabels();
        setTimeout(applyLabels, 400);
        return;
      }
      // Lazily label newly added blocks without re-running the full set
      applyLabels();
    });
    mutObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ─── Incoming messages ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === 'cce:setVisibility') {
      const show = msg.payload?.show || {};
      labeled.forEach(node => {
        const chip = chips.get(node);
        if (!chip) return;
        const label = chip.dataset.l;
        node.classList.toggle('cv-nonmatch', show[label] === false);
      });
      if (msg.payload?.overlay) document.documentElement.classList.add('cv-dim');
      else                       document.documentElement.classList.remove('cv-dim');
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'cce:clearLabels') {
      clearLabels();
      sendResponse({ ok: true });
      return true;
    }
  });

  // ─── Bootstrap ───────────────────────────────────────────────────────────────
  applyLabels();
  startMutationObserver();
  window.addEventListener('beforeunload', () => mutObs?.disconnect());
})();
