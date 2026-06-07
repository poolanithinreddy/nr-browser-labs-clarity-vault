// Service worker (MV3) — background logic.
// ES module; imported from manifest.json "background.service_worker".
import { api } from '../common/api.js';
import {
  addClip, getClips, updateClip, deleteClip, clearClips,
  getSettings, setSettings, newId, deriveDomain,
} from '../common/storage.js';
import { cleanText, detectType, autoTags } from '../common/clean.js';
import { toMarkdown } from './xport.js';

const COPY_SCRIPT_ID = 'copy-listener';
const AI_HOSTS = new Set([
  'gemini.google.com', 'chat.openai.com', 'claude.ai',
  'copilot.microsoft.com', 'bard.google.com', 'perplexity.ai',
]);
const LIMITS = { maxPreview: 600, maxStore: 8000 };

// ─── Context menus ───────────────────────────────────────────────────────────

async function ensureContextMenus() {
  try { await new Promise(res => api.contextMenus.removeAll(res)); } catch { /* ignore */ }
  api.contextMenus.create({
    id: 'save-selection',
    title: 'Save selection to Clarity Vault',
    contexts: ['selection', 'page'],
  });
}

// ─── Content-script registration ─────────────────────────────────────────────

async function hasAllUrlsPermission() {
  if (!api.permissions) return false;
  try { return await api.permissions.contains({ origins: ['<all_urls>'] }); }
  catch { return false; }
}

async function registerCopyContentScript() {
  if (!api.scripting) return;
  if (!(await hasAllUrlsPermission())) return;
  const existing = await api.scripting
    .getRegisteredContentScripts({ ids: [COPY_SCRIPT_ID] })
    .catch(() => []);
  if (!existing?.length) {
    await api.scripting.registerContentScripts([{
      id: COPY_SCRIPT_ID,
      js: ['content/copy-listener.js'],
      matches: ['<all_urls>'],
      runAt: 'document_start',
      allFrames: false,
      persistAcrossSessions: true,
    }]).catch(() => { /* already registered or permission missing */ });
  }
}

async function unregisterCopyContentScript() {
  if (!api.scripting) return;
  const existing = await api.scripting
    .getRegisteredContentScripts({ ids: [COPY_SCRIPT_ID] })
    .catch(() => []);
  if (existing?.length) {
    await api.scripting.unregisterContentScripts({ ids: [COPY_SCRIPT_ID] }).catch(() => {});
  }
}

// ─── Permission helpers ───────────────────────────────────────────────────────

async function requestAllUrlsPermission() {
  if (!api.permissions) return false;
  try { return !!(await api.permissions.request({ origins: ['<all_urls>'] })); }
  catch { return false; }
}

async function ensureAnalyzePermission() {
  if (!api.permissions) return true;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return false;
    // Reject non-scriptable URLs immediately
    if (/^(chrome|edge|about|data|blob):/.test(tab.url)) return false;
    const origin = new URL(tab.url).origin + '/*';
    const has = await api.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await api.permissions.request({ origins: [origin] });
  } catch { return false; }
}

// ─── Text processing ──────────────────────────────────────────────────────────

function cleanGenericText(text) {
  if (!text) return '';
  let t = text;
  t = t.replace(/0\s*seconds\s*of[\s\S]*?Volume\s*\d+%/gi, ''); // media player overlays
  t = t.replace(/read more/gi, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function cleanAiText(text) {
  let t = text || '';
  t = t.replace(/0\s*seconds\s*of[\s\S]*?Volume\s*\d+%/gi, '');
  t = t.replace(/^\s*—\s*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function isAiHost(url) {
  try { return AI_HOSTS.has(new URL(url).hostname); }
  catch { return false; }
}

function cleanTextForSource(text, url) {
  const base = cleanGenericText(text || '');
  if (!url) return base;
  return isAiHost(url) ? cleanAiText(base) : base;
}

function buildPreview(text) { return (text || '').slice(0, LIMITS.maxPreview); }
function capForStorage(text) {
  const t = text || '';
  return t.length > LIMITS.maxStore ? t.slice(0, LIMITS.maxStore) : t;
}

// ─── Clip merging (for import) ────────────────────────────────────────────────

function mergeClips(existing, imported) {
  const key   = c => `${c.text}\x01${c.domain}\x01${new Date(c.createdAt).toDateString()}`;
  const byKey = new Map();
  [...imported, ...existing].forEach(c => { byKey.set(key(c), c); });
  return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Context menu handler ─────────────────────────────────────────────────────

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-selection' || !info.selectionText) return;
  const url     = tab?.url || '';
  const cleaned = cleanTextForSource(info.selectionText, url);
  const domain  = deriveDomain(url);
  const clip = {
    id:          newId(),
    text:        capForStorage(cleaned),
    preview:     buildPreview(cleaned),
    sourceUrl:   url,
    sourceTitle: tab?.title || '',
    domain,
    type:        detectType(cleaned),
    tags:        autoTags(cleaned, domain),
    createdAt:   Date.now(),
    favorite:    false,
    truncated:   cleaned.length > LIMITS.maxStore,
  };
  await addClip(clip);
});

// ─── Message dispatcher ───────────────────────────────────────────────────────

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const t0 = performance.now?.() ?? Date.now();

    switch (msg?.type) {

      case 'ping':
        sendResponse({ ok: true });
        break;

      case 'saveClip': {
        const { text, rawHtml, title, url } = msg.payload || {};
        const settings = await getSettings();
        const sourceUrl = url || sender?.tab?.url || '';
        const domain = deriveDomain(sourceUrl);

        if (settings.ignoreList?.some(d => domain.endsWith(d))) {
          sendResponse({ ok: false, ignored: true });
          break;
        }
        const cleaned = cleanTextForSource(text || '', sourceUrl);
        const clip = {
          id:          newId(),
          text:        capForStorage(cleaned),
          preview:     buildPreview(cleaned),
          rawHtml,
          sourceUrl,
          sourceTitle: title || sender?.tab?.title || '',
          domain,
          type:        detectType(cleaned),
          tags:        autoTags(cleaned, domain),
          createdAt:   Date.now(),
          favorite:    false,
          truncated:   cleaned.length > LIMITS.maxStore,
        };
        const saved = await addClip(clip);
        console.debug('[CV] clip stored ms', Math.round((performance.now?.() ?? Date.now()) - t0));
        sendResponse({ ok: true, clip: saved });
        break;
      }

      case 'getClips':
        sendResponse({ ok: true, clips: await getClips() });
        break;

      case 'updateClip': {
        const { id, patch } = msg.payload;
        const updated = await updateClip(id, patch);
        sendResponse({ ok: true, clip: updated });
        break;
      }

      case 'deleteClip':
        await deleteClip(msg.payload.id);
        sendResponse({ ok: true });
        break;

      case 'clearClips':
        await clearClips();
        sendResponse({ ok: true });
        break;

      case 'getSettings':
        sendResponse({ ok: true, settings: await getSettings() });
        break;

      case 'setSettings': {
        const settings = await setSettings(msg.payload);
        if (typeof msg.payload?.autoCaptureEnabled === 'boolean') {
          if (msg.payload.autoCaptureEnabled) {
            const granted = await requestAllUrlsPermission();
            if (!granted) {
              // Permission denied — revert the setting
              await setSettings({ autoCaptureEnabled: false });
              sendResponse({ ok: true, settings: await getSettings() });
              break;
            }
            await registerCopyContentScript();
          } else {
            await unregisterCopyContentScript();
          }
        }
        sendResponse({ ok: true, settings });
        break;
      }

      case 'exportClips': {
        const { format } = msg.payload || { format: 'json' };
        const clips = await getClips();
        if (format === 'md') {
          sendResponse({ ok: true, blob: toMarkdown(clips), mime: 'text/markdown' });
        } else {
          sendResponse({
            ok: true,
            blob: JSON.stringify({ version: 1, exportedAt: Date.now(), clips }, null, 2),
            mime: 'application/json',
          });
        }
        break;
      }

      case 'importClips': {
        const { clips: imported } = msg.payload;
        const existing = await getClips();
        const merged   = mergeClips(existing, imported);
        await api.storage.local.set({ clips: merged });
        sendResponse({ ok: true, count: merged.length });
        break;
      }

      case 'analyzePage': {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false }); break; }
        // Guard against non-scriptable URLs (chrome://, about:, etc.)
        if (!tab.url || /^(chrome|edge|about|data|blob):/.test(tab.url)) {
          sendResponse({ ok: false, denied: true });
          break;
        }
        const allowed = await ensureAnalyzePermission();
        if (!allowed) { sendResponse({ ok: false, denied: true }); break; }
        await api.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/inject.css'],
        }).catch(() => {});
        const res = await api.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/analyze.js'],
        }).catch(() => null);
        sendResponse({ ok: !!res });
        break;
      }

      case 'clearLabels': {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false }); break; }
        if (!tab.url || /^(chrome|edge|about|data|blob):/.test(tab.url)) {
          sendResponse({ ok: false });
          break;
        }
        const result = await api.tabs.sendMessage(tab.id, { type: 'cce:clearLabels' })
          .catch(() => null);
        sendResponse({ ok: !!result?.ok });
        break;
      }

      case 'toggleAnalyze': {
        const settings = await setSettings({ cceEnabled: !!msg.payload });
        sendResponse({ ok: true, settings });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'unknown_message_type' });
    }
  })();
  return true; // keep message channel open for async response
});

// ─── Install / update lifecycle ───────────────────────────────────────────────

try {
  chrome.runtime.onInstalled.addListener(async (details) => {
    await ensureContextMenus();
    const settings = await getSettings();
    if (settings.autoCaptureEnabled) await registerCopyContentScript();
    // Open settings page on first install so the user sees the privacy statement
    if (details?.reason === 'install') {
      try { chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html') }); } catch { /* ignore */ }
    }
  });
} catch { /* Firefox may not support all fields */ }

// Revoke content script registration when host permission is removed
if (api.permissions) {
  api.permissions.onRemoved?.addListener(async (perms) => {
    if (perms?.origins?.includes('<all_urls>')) {
      await unregisterCopyContentScript();
    }
  });
}
