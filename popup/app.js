// popup/app.js — ES module. Runs in the extension popup context.
import { summarize } from '../common/summarize.js';

const el  = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const TABS = ['recent', 'vault', 'summary', 'analyze', 'settings'];

let state = {
  clips:      [],
  filtered:   [],
  selectedId: null,
  settings:   null,
  filters:    { q: '', domain: 'all', tag: 'all', starred: false },
};
let uiPrefs = { compact: false, showText: true };

// AI-hosted domains shown with a robot indicator
const AI_DOMAINS = new Set([
  'gemini.google.com', 'chat.openai.com', 'claude.ai',
  'copilot.microsoft.com', 'bard.google.com', 'perplexity.ai',
]);
const NEWS_DOMAINS = new Set(['nbcnews.com', 'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com']);

// ─── Init ────────────────────────────────────────────────────────────────────

init();

async function init() {
  applyStoredTheme();
  wireTabs();
  wireSearch();

  try { uiPrefs = await loadUiPrefs(); } catch { /* use defaults */ }
  try {
    const res = await send('getSettings');
    state.settings = res?.settings || null;
    applyTheme(state.settings?.theme || 'system');
  } catch { /* background not ready yet */ }

  await refresh();
  renderAll();

  // Auto-select newest clip and pre-render summary
  if (state.clips.length > 0) {
    state.selectedId = state.clips[0].id;
    renderSummary();
  }

  // Live updates when storage changes (e.g. copy captured in background)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes?.clips) return;
      state.clips    = changes.clips.newValue || [];
      state.filtered = filterClips();
      renderRecent();
      renderVault();
      const activeTab = el('.tabs button.active')?.dataset?.tab;
      if (activeTab === 'summary') {
        if (!state.selectedId && state.clips.length > 0) state.selectedId = state.clips[0].id;
        renderSummary();
      }
    });
  } catch { /* Firefox may not support */ }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function refresh() {
  try { state.clips = (await send('getClips'))?.clips || []; } catch { state.clips = []; }
  state.filtered = filterClips();
}

function filterClips() {
  const q   = state.filters.q.toLowerCase();
  const dom = state.filters.domain;
  const tag = state.filters.tag;
  const starred = state.filters.starred;
  return state.clips.filter(c => {
    if (q && !(`${c.text} ${c.sourceTitle} ${c.domain} ${(c.tags||[]).join(' ')}`).toLowerCase().includes(q)) return false;
    if (dom !== 'all' && c.domain !== dom) return false;
    if (tag !== 'all' && !(c.tags||[]).includes(tag)) return false;
    if (starred && !c.favorite) return false;
    return true;
  });
}

// ─── Routing / tabs ──────────────────────────────────────────────────────────

function wireTabs() {
  els('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      els('.tabs button').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const tab = btn.dataset.tab;
      TABS.forEach(t => el(`#tab-${t}`).classList.toggle('active', t === tab));

      switch (tab) {
        case 'recent':   renderRecent();   break;
        case 'vault':    renderVault();    break;
        case 'summary':
          if (!state.selectedId && state.clips.length > 0) state.selectedId = state.clips[0].id;
          renderSummary();
          break;
        case 'analyze':  renderAnalyze();  break;
        case 'settings': renderSettings(); break;
      }
    });
  });
}

function wireSearch() {
  el('#quickSearch')?.addEventListener('input', (e) => {
    state.filters.q = e.target.value.trim();
    state.filtered  = filterClips();
    renderVault();
    renderRecent();
  });
}

// ─── Recent tab ───────────────────────────────────────────────────────────────

function renderRecent() {
  const root = el('#tab-recent');
  if (!state.filtered.length) {
    root.innerHTML = `<div class="empty">
      <strong>Nothing copied yet</strong>
      Copy text on any web page and it will appear here.
    </div>`;
    return;
  }

  const todayStr = new Date().toDateString();
  const today    = state.filtered.filter(c => new Date(c.createdAt).toDateString() === todayStr);
  const older    = state.filtered.filter(c => new Date(c.createdAt).toDateString() !== todayStr);
  const display  = [...today, ...older];

  const todayBadge = today.length
    ? `<div class="today-badge">Today &mdash; ${today.length} clip${today.length > 1 ? 's' : ''}</div>`
    : '';

  const controlsHtml = `
    <div class="recent-controls">
      <label><input type="checkbox" id="uiCompact"   ${uiPrefs.compact   ? 'checked' : ''}/> Compact</label>
      <label><input type="checkbox" id="uiShowText"  ${uiPrefs.showText  ? 'checked' : ''}/> Text preview</label>
    </div>`;

  if (uiPrefs.compact) {
    const tiles = display.slice(0, 20).map(tileHtml).join('');
    root.innerHTML = `${controlsHtml}${todayBadge}<div class="tile-grid">${tiles}</div>`;
    root.classList.toggle('compact-hide-text', !uiPrefs.showText);
  } else {
    root.classList.remove('compact-hide-text');
    root.innerHTML = `${controlsHtml}${todayBadge}<div class="list">${display.slice(0, 15).map(itemHtml).join('')}</div>`;
  }

  wireItemEvents(root);
  wireRecentControls();
}

// ─── Vault tab ────────────────────────────────────────────────────────────────

function renderVault() {
  const root    = el('#tab-vault');
  const domains = [...new Set(state.clips.map(c => c.domain))].sort();
  const tags    = [...new Set(state.clips.flatMap(c => c.tags || []))].sort();

  root.innerHTML = `
    <div class="controls" style="margin-bottom:10px">
      <select id="domainFilter" class="select">
        <option value="all">All domains</option>
        ${domains.map(d => `<option ${state.filters.domain===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}
      </select>
      <select id="tagFilter" class="select">
        <option value="all">All tags</option>
        ${tags.map(t => `<option ${state.filters.tag===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <label><input type="checkbox" id="starredFilter" ${state.filters.starred?'checked':''}/> Starred</label>
    </div>
    <div class="controls" style="margin-bottom:10px">
      <button class="btn" id="exportJson">Export JSON</button>
      <button class="btn" id="exportMd">Export MD</button>
      <label class="btn" style="cursor:pointer">
        Import JSON <input type="file" id="importJson" accept="application/json" hidden />
      </label>
      <button class="btn danger" id="vaultClearAll">Delete all</button>
    </div>
    <div class="grid">${state.filtered.map(itemHtml).join('')}</div>
  `;

  el('#domainFilter').addEventListener('change', e => { state.filters.domain = e.target.value; applyVaultFilters(); });
  el('#tagFilter').addEventListener('change',    e => { state.filters.tag    = e.target.value; applyVaultFilters(); });
  el('#starredFilter').addEventListener('change', e => { state.filters.starred = e.target.checked; applyVaultFilters(); });
  el('#exportJson').addEventListener('click', () => doExport('json'));
  el('#exportMd').addEventListener('click',   () => doExport('md'));
  el('#importJson').addEventListener('change', onImport);
  el('#vaultClearAll').addEventListener('click', async () => {
    if (!confirm('Delete all clips? This cannot be undone.')) return;
    await send('clearClips');
    await refresh();
    renderRecent();
    renderVault();
    renderSummary();
  });

  wireItemEvents(root);
}

function applyVaultFilters() {
  state.filtered = filterClips();
  renderVault();
}

// ─── Summary tab ─────────────────────────────────────────────────────────────
// NOTE: #summary-empty and #summary-content are STATIC in the HTML.
// renderSummary() shows/hides them — it never replaces the section innerHTML.

function renderSummary() {
  const emptyEl   = el('#summary-empty');
  const contentEl = el('#summary-content');
  const clip = state.clips.find(c => c.id === state.selectedId) || state.clips[0] || null;

  if (!clip) {
    emptyEl?.classList.remove('hidden');
    contentEl?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  contentEl?.classList.remove('hidden');

  const sumBox  = el('#summaryText');
  const origBox = el('#summaryOriginal');

  // Use the proper TextRank summarizer from common/summarize.js
  const sum = summarize(clip.text || '', { maxSentences: 4 });
  if (sumBox)  sumBox.textContent  = sum || clip.text || '(No content to summarize.)';
  if (origBox) origBox.textContent = clip.text || '';

  const btnClean = el('#copyClean');
  const btnOrig  = el('#copyOriginal');
  if (btnClean) btnClean.onclick = () => navigator.clipboard.writeText(sum || clip.text || '').catch(() => {});
  if (btnOrig)  btnOrig.onclick  = () => navigator.clipboard.writeText(clip.text || '').catch(() => {});
}

// ─── Analyze tab ──────────────────────────────────────────────────────────────

function renderAnalyze() {
  const root = el('#tab-analyze');
  root.innerHTML = `
    <div class="card analyze-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <strong style="font-size:13px">Page Analyzer</strong>
        <span class="badge-local">Local &middot; Private</span>
      </div>
      <p class="analyze-desc">
        Labels paragraphs on the current page as Opinion, Promotional, Potentially Toxic,
        or Neutral/Factual. Classification runs entirely on your device — nothing is sent anywhere.
      </p>
      <div class="analyze-legend">
        <span class="legend-item"><span class="legend-dot opinion"></span>Opinion</span>
        <span class="legend-item"><span class="legend-dot promo"></span>Promotional</span>
        <span class="legend-item"><span class="legend-dot toxic"></span>Potentially Toxic</span>
        <span class="legend-item"><span class="legend-dot neutral"></span>Neutral/Factual</span>
      </div>
      <div class="analyze-btns">
        <button class="btn primary" id="analyzeBtn">Analyze this page</button>
        <button class="btn"         id="clearAnalyzeBtn">Clear labels</button>
      </div>
      <div class="analyze-status" id="analyzeStatus"></div>
      <p class="analyze-desc" style="margin-top:4px">
        Hover a chip on the page to see the reason and confidence score.
      </p>
    </div>`;

  el('#analyzeBtn').addEventListener('click', async () => {
    const status = el('#analyzeStatus');
    const btn    = el('#analyzeBtn');
    btn.disabled = true;
    status.textContent = '';
    status.className   = 'analyze-status';
    status.textContent = 'Analyzing page locally…';

    chrome.runtime.sendMessage({ type: 'analyzePage' }, (res) => {
      btn.disabled = false;
      if (chrome.runtime.lastError || !res?.ok) {
        status.className   = 'analyze-status err';
        status.textContent = res?.denied
          ? 'Permission required. Allow access to this site, then try again.'
          : 'Could not analyze. Try reloading the page first.';
      } else {
        status.className   = 'analyze-status ok';
        status.textContent = 'Done. Hover a chip to see the classification reason.';
      }
    });
  });

  el('#clearAnalyzeBtn').addEventListener('click', () => {
    const status = el('#analyzeStatus');
    chrome.runtime.sendMessage({ type: 'clearLabels' }, (res) => {
      status.className   = 'analyze-status';
      status.textContent = res?.ok
        ? 'Labels cleared.'
        : 'No labels found on the current page.';
    });
  });
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function renderSettings() {
  const S = state.settings || {
    theme: 'system', autoCaptureEnabled: false, maxClips: 500,
    autoSummarize: true, autoCleanUrls: true, ignoreList: [],
  };
  const root = el('#tab-settings');
  root.innerHTML = `
    <div class="settings-group">
      <div class="settings-group-title">Appearance</div>
      <div class="setting-row">
        <span class="setting-label">Theme</span>
        <select id="st-theme" class="select">
          <option value="system" ${S.theme==='system'?'selected':''}>System</option>
          <option value="light"  ${S.theme==='light' ?'selected':''}>Light</option>
          <option value="dark"   ${S.theme==='dark'  ?'selected':''}>Dark</option>
        </select>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Capture</div>
      <div class="setting-row">
        <div class="setting-label-col">
          <span class="setting-label">Auto-capture copies</span>
          <span class="setting-desc">Requires permission to access all sites</span>
        </div>
        <input id="st-autoCapture" type="checkbox" ${S.autoCaptureEnabled?'checked':''}/>
      </div>
      <div class="setting-row">
        <span class="setting-label">Max clips stored</span>
        <input id="st-maxClips" type="number" class="num-input" min="50" max="2000" step="50" value="${S.maxClips}"/>
      </div>
      <div class="setting-row">
        <span class="setting-label">Auto-summarize long clips</span>
        <input id="st-autoSummarize" type="checkbox" ${S.autoSummarize?'checked':''}/>
      </div>
      <div class="setting-row">
        <span class="setting-label">Strip tracking params from URLs</span>
        <input id="st-autoCleanUrls" type="checkbox" ${S.autoCleanUrls?'checked':''}/>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Ignore list</div>
      <div class="setting-row setting-row--col" style="flex-direction:column;align-items:flex-start">
        <span class="setting-desc">One domain per line. Clips from these sites are never saved.</span>
        <textarea id="st-ignoreList" class="ignore-list" rows="3" placeholder="example.com&#10;ads.example.org">${(S.ignoreList||[]).join('\n')}</textarea>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Data</div>
      <div class="setting-row">
        <span class="setting-label">Delete all clips</span>
        <button class="btn danger" id="st-clearAll">Delete all</button>
      </div>
    </div>

    <div class="privacy-note">
      All data is stored in <code>chrome.storage.local</code> on this device only.
      Nothing is sent to any server. Export or delete anytime.
    </div>
    <p style="margin-top:8px;font-size:11px;text-align:center">
      <a href="#" id="openOptions" style="color:var(--accent)">Open full settings page &rarr;</a>
    </p>`;

  el('#st-theme').addEventListener('change', async e => {
    const s = await applySettings({ theme: e.target.value });
    applyTheme(s?.settings?.theme || e.target.value);
  });
  el('#st-autoCapture').addEventListener('change', async e => {
    const res = await applySettings({ autoCaptureEnabled: e.target.checked });
    if (!res?.settings?.autoCaptureEnabled) e.target.checked = false;
  });
  el('#st-maxClips').addEventListener('change', e => {
    const v = clamp(parseInt(e.target.value) || 500, 50, 2000);
    e.target.value = v;
    applySettings({ maxClips: v });
  });
  el('#st-autoSummarize').addEventListener('change', e => applySettings({ autoSummarize: e.target.checked }));
  el('#st-autoCleanUrls').addEventListener('change', e => applySettings({ autoCleanUrls: e.target.checked }));
  el('#st-ignoreList').addEventListener('blur', e => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    applySettings({ ignoreList: list });
  });
  el('#st-clearAll').addEventListener('click', async () => {
    if (!confirm('Delete all clips? This cannot be undone.')) return;
    await send('clearClips');
    await refresh();
    renderRecent();
    renderVault();
    renderSummary();
  });
  el('#openOptions')?.addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage?.();
  });
}

function renderAll() {
  renderRecent();
  renderVault();
  renderSummary();
  renderAnalyze();
  renderSettings();
}

// ─── Item HTML ────────────────────────────────────────────────────────────────

function itemHtml(c) {
  const preview    = escapeHtml((c.preview || c.text || '').slice(0, 260));
  const rel        = timeAgo(c.createdAt);
  const tagsHtml   = (c.tags||[]).map(t => `<span class="pill">#${escapeHtml(t)}</span>`).join('');
  const isAi       = AI_DOMAINS.has(c.domain||'');
  const isNews     = NEWS_DOMAINS.has(c.domain||'');
  const trustCls   = isAi ? 'ai' : (isNews ? 'news' : '');
  const trustLabel = isAi ? '🤖 ai' : (isNews ? '✅ news' : '🌐 web');
  const domLabel   = isAi ? `🤖 ${escapeHtml(c.domain||'')}` : escapeHtml(c.domain || 'unknown');
  return `
    <div class="item" data-id="${c.id}">
      <div class="meta">
        <div class="meta-left">
          <span class="domain">${domLabel}</span>
          <span class="pill ${trustCls}">${trustLabel}</span>
        </div>
        <span class="timestamp">${rel}</span>
      </div>
      ${preview ? `<div class="text-preview">${preview}</div>` : ''}
      ${tagsHtml ? `<div class="pills">${tagsHtml}</div>` : ''}
      <div class="actions">
        <button class="btn icon act-copy" title="Copy to clipboard">📋</button>
        <button class="btn icon act-open" title="Open source">↗</button>
        <button class="btn icon act-star" title="${c.favorite?'Unstar':'Star'}">${c.favorite?'⭐':'☆'}</button>
        <button class="btn icon act-del"  title="Delete">✕</button>
      </div>
    </div>`;
}

function tileHtml(c) {
  const isAi      = AI_DOMAINS.has(c.domain||'');
  const isNews    = NEWS_DOMAINS.has(c.domain||'');
  const trustIcon = isAi ? '🤖' : (isNews ? '✅' : '🌐');
  const text      = escapeHtml((c.preview || c.text || '').slice(0, uiPrefs.showText ? 180 : 0));
  return `
    <div class="tile" data-id="${c.id}">
      <div class="meta">
        <span>${trustIcon} ${escapeHtml((c.domain||'unknown'))}</span>
        <span>${timeAgo(c.createdAt)}</span>
      </div>
      <div class="text">${text}</div>
      <div class="actions">
        <button class="btn icon act-copy" title="Copy">📋</button>
        <button class="btn icon act-open" title="Open">↗</button>
        <button class="btn icon act-star" title="${c.favorite?'Unstar':'Star'}">${c.favorite?'⭐':'☆'}</button>
        <button class="btn icon act-del"  title="Delete">✕</button>
      </div>
    </div>`;
}

// ─── Item events ──────────────────────────────────────────────────────────────

function wireItemEvents(root) {
  root.querySelectorAll('.act-copy').forEach(b => b.addEventListener('click', onCopyItem));
  root.querySelectorAll('.act-open').forEach(b => b.addEventListener('click', onOpenItem));
  root.querySelectorAll('.act-star').forEach(b => b.addEventListener('click', onStarItem));
  root.querySelectorAll('.act-del').forEach(b =>  b.addEventListener('click', onDelItem));
  root.querySelectorAll('.item, .tile').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.actions')) return;
      state.selectedId = card.dataset.id;
      el('[data-tab="summary"]').click();
    });
  });
}

function getCardId(target) { return target.closest('.item, .tile')?.dataset?.id; }

async function onCopyItem(e) {
  e.stopPropagation();
  const clip = state.clips.find(c => c.id === getCardId(e.target));
  if (clip) await navigator.clipboard.writeText(clip.text || '').catch(() => {});
}
async function onOpenItem(e) {
  e.stopPropagation();
  const clip = state.clips.find(c => c.id === getCardId(e.target));
  if (clip?.sourceUrl) window.open(clip.sourceUrl, '_blank');
}
async function onStarItem(e) {
  e.stopPropagation();
  const id   = getCardId(e.target);
  const clip = state.clips.find(c => c.id === id);
  if (!clip) return;
  const res = await send('updateClip', { id, patch: { favorite: !clip.favorite } });
  const idx = state.clips.findIndex(c => c.id === id);
  if (idx >= 0) state.clips[idx] = res.clip;
  await refresh();
  renderRecent();
  renderVault();
}
async function onDelItem(e) {
  e.stopPropagation();
  const id = getCardId(e.target);
  await send('deleteClip', { id });
  await refresh();
  renderRecent();
  renderVault();
  if (state.selectedId === id) { state.selectedId = null; renderSummary(); }
}

// ─── Export / import ─────────────────────────────────────────────────────────

async function doExport(fmt) {
  const res = await send('exportClips', { format: fmt });
  const blob = new Blob([res.blob], { type: res.mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: fmt === 'md' ? 'clarity-vault.md' : 'clarity-vault.json',
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (!Array.isArray(json.clips)) throw new Error('Invalid format');
    await send('importClips', { clips: json.clips });
    await refresh();
    renderRecent();
    renderVault();
  } catch {
    alert('Import failed: invalid JSON format.');
  }
  e.target.value = '';
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function applySettings(patch) {
  try {
    const res = await send('setSettings', patch);
    if (res?.ok) state.settings = res.settings;
    return res;
  } catch { return null; }
}

function applyTheme(mode) {
  let t = mode || 'system';
  if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
}

function applyStoredTheme() {
  // Apply before first render to avoid flash
  try {
    chrome.storage.local.get(['settings'], r => {
      applyTheme(r?.settings?.theme || 'system');
    });
  } catch { applyTheme('system'); }
}

// ─── UI prefs ─────────────────────────────────────────────────────────────────

function loadUiPrefs() {
  return new Promise(resolve =>
    chrome.storage.local.get(['cv_ui_prefs'], r =>
      resolve(r.cv_ui_prefs || { compact: false, showText: true })
    )
  );
}
function saveUiPrefs() {
  return new Promise(resolve =>
    chrome.storage.local.set({ cv_ui_prefs: uiPrefs }, resolve)
  );
}
function wireRecentControls() {
  el('#uiCompact')?.addEventListener('change', async e => {
    uiPrefs.compact = e.target.checked;
    await saveUiPrefs();
    renderRecent();
  });
  el('#uiShowText')?.addEventListener('change', async e => {
    uiPrefs.showText = e.target.checked;
    await saveUiPrefs();
    renderRecent();
  });
}

// ─── Vault filters ────────────────────────────────────────────────────────────

// (Vault filter logic lives in renderVault; applyVaultFilters calls filterClips)

// ─── Utilities ────────────────────────────────────────────────────────────────

function send(type, payload) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type, payload }, resolve)
  );
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - (ts || Date.now())) / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
