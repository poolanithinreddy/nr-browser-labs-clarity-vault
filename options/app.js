// options/app.js — ES module. Full settings management page.
import { api } from '../common/api.js';

// ─── Theme ───────────────────────────────────────────────────────────────────

function applyTheme(mode) {
  let t = mode || 'system';
  if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
}

// ─── Messaging helpers ────────────────────────────────────────────────────────

async function send(type, payload) {
  return api.runtime.sendMessage({ type, payload });
}

// ─── Status feedback ──────────────────────────────────────────────────────────

function showBanner(msg, type = 'ok') {
  const el = document.getElementById('status-banner');
  if (!el) return;
  el.textContent = msg;
  el.className = `status-banner ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showInlineStatus(id, msg, type = 'ok') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ─── Settings load / save ─────────────────────────────────────────────────────

async function loadSettings() {
  const res = await send('getSettings');
  return res?.settings || {};
}

async function saveSettings(patch) {
  const res = await send('setSettings', patch);
  return res?.settings || {};
}

// ─── Populate form from settings ─────────────────────────────────────────────

function populateForm(S) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const chk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  set('opt-theme',       S.theme || 'system');
  chk('opt-autoCapture', S.autoCaptureEnabled);
  set('opt-maxClips',    S.maxClips ?? 500);
  chk('opt-autoSummarize', S.autoSummarize !== false);
  chk('opt-autoCleanUrls', S.autoCleanUrls !== false);
  set('opt-ignoreList',  (S.ignoreList || []).join('\n'));

  applyTheme(S.theme);
}

// ─── Wire form events ─────────────────────────────────────────────────────────

function wireForm() {
  // Theme
  on('opt-theme', 'change', async e => {
    const s = await saveSettings({ theme: e.target.value });
    applyTheme(s.theme);
    showBanner('Theme updated.');
  });

  // Auto-capture
  on('opt-autoCapture', 'change', async e => {
    const s = await saveSettings({ autoCaptureEnabled: e.target.checked });
    // If permission was denied, the service worker sets autoCaptureEnabled: false
    const granted = !!s.autoCaptureEnabled;
    document.getElementById('opt-autoCapture').checked = granted;
    if (e.target.checked && !granted) {
      showBanner('Permission was not granted. Auto-capture was not enabled.', 'err');
    } else {
      showBanner(granted ? 'Auto-capture enabled.' : 'Auto-capture disabled.');
    }
    await renderDiagnostics();
  });

  // Max clips
  on('opt-maxClips', 'change', async e => {
    const v = Math.max(50, Math.min(2000, parseInt(e.target.value) || 500));
    e.target.value = v;
    await saveSettings({ maxClips: v });
    showBanner(`Max clips set to ${v}.`);
  });

  // Auto-summarize
  on('opt-autoSummarize', 'change', async e => {
    await saveSettings({ autoSummarize: e.target.checked });
    showBanner(e.target.checked ? 'Auto-summarize on.' : 'Auto-summarize off.');
  });

  // Auto-clean URLs
  on('opt-autoCleanUrls', 'change', async e => {
    await saveSettings({ autoCleanUrls: e.target.checked });
    showBanner(e.target.checked ? 'URL tracking cleanup on.' : 'URL tracking cleanup off.');
  });

  // Ignore list
  on('opt-ignoreList', 'blur', async e => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    await saveSettings({ ignoreList: list });
    showBanner(`Ignore list saved (${list.length} domain${list.length !== 1 ? 's' : ''}).`);
  });

  // Export JSON
  on('opt-exportJson', 'click', () => doExport('json'));

  // Export Markdown
  on('opt-exportMd', 'click', () => doExport('md'));

  // Import JSON
  on('opt-importJson', 'change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!Array.isArray(json.clips)) throw new Error('Missing clips array');
      const res = await send('importClips', { clips: json.clips });
      showInlineStatus('import-status', `✓ Imported ${res.count} clips successfully.`, 'ok');
      await renderDiagnostics();
    } catch (err) {
      showInlineStatus('import-status', `✗ Import failed: ${err.message || 'invalid JSON format'}.`, 'err');
    }
    e.target.value = '';
  });

  // Delete all
  on('opt-clearAll', 'click', async () => {
    if (!confirm('Delete ALL clips? This cannot be undone. Your settings will be kept.')) return;
    await send('clearClips');
    await renderDiagnostics();
    showBanner('All clips deleted.', 'ok');
  });

  // Diagnostics refresh
  on('diag-refresh', 'click', renderDiagnostics);
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function doExport(fmt) {
  try {
    const res  = await send('exportClips', { format: fmt });
    const blob = new Blob([res.blob], { type: res.mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: fmt === 'md' ? 'clarity-vault.md' : 'clarity-vault.json',
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showBanner(`Exported as ${fmt.toUpperCase()}.`);
  } catch {
    showBanner('Export failed. Make sure the extension is active.', 'err');
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

async function renderDiagnostics() {
  const container = document.getElementById('diag');
  if (!container) return;

  const t0 = performance.now();
  let S, clips;
  try {
    [S, clips] = await Promise.all([
      send('getSettings').then(r => r?.settings || {}),
      send('getClips').then(r => r?.clips || []),
    ]);
  } catch {
    container.innerHTML = '<span class="diag-loading">Could not reach background worker.</span>';
    return;
  }
  const ms = (performance.now() - t0).toFixed(0);
  const usagePct = Math.round((clips.length / (S.maxClips || 500)) * 100);

  container.innerHTML = `
    <div class="diag-row">
      <span class="diag-label">Clips stored</span>
      <span class="diag-value ${clips.length >= (S.maxClips || 500) ? 'warn' : ''}">${clips.length} / ${S.maxClips || 500}</span>
    </div>
    <div class="diag-row">
      <span class="diag-label">Storage used</span>
      <span class="diag-value">${usagePct}%</span>
    </div>
    <div class="diag-row">
      <span class="diag-label">Auto-capture</span>
      <span class="diag-value">${S.autoCaptureEnabled ? 'Enabled' : 'Disabled'}</span>
    </div>
    <div class="diag-row">
      <span class="diag-label">Theme</span>
      <span class="diag-value">${S.theme || 'system'}</span>
    </div>
    <div class="diag-row">
      <span class="diag-label">Ignore list</span>
      <span class="diag-value">${(S.ignoreList || []).length} domain(s)</span>
    </div>
    <div class="diag-row">
      <span class="diag-label">Storage latency</span>
      <span class="diag-value">${ms} ms</span>
    </div>
  `;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function on(id, event, handler) {
  document.getElementById(id)?.addEventListener(event, handler);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Stamp extension version from manifest
  try {
    const manifest = chrome.runtime.getManifest?.();
    if (manifest?.version) {
      const vEl = document.getElementById('ext-version');
      if (vEl) vEl.textContent = manifest.version;
    }
  } catch { /* ignore */ }

  // Initial settings load
  let settings = {};
  try { settings = await loadSettings(); } catch { /* background not ready */ }
  populateForm(settings);
  wireForm();
  await renderDiagnostics();

  // Honour OS-level theme changes when set to "system"
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const s = await loadSettings();
    if (s.theme === 'system' || !s.theme) applyTheme('system');
  });
}

main().catch(err => console.error('[Clarity Vault options]', err));
