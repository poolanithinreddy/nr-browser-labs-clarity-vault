// Lightweight webextension polyfill-ish wrapper
// Exposes: api (Promise-based), with storage, runtime, tabs, scripting, contextMenus, permissions.

const isChrome = typeof chrome !== 'undefined' && !globalThis.browser;
const browserLike = globalThis.browser || (function makeBrowserLike() {
  if (!isChrome) return undefined;
  // Minimal Promise wrapper that preserves 'this' binding
  const promisify = (fn, ctx) => (...args) => new Promise((resolve, reject) => {
    try {
      fn.apply(ctx, [...args, (result) => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(err);
        else resolve(result);
      }]);
    } catch (e) { reject(e); }
  });

  const storage = {
    local: {
      get: (keys) => promisify(chrome.storage.local.get, chrome.storage.local)(keys),
      set: (items) => promisify(chrome.storage.local.set, chrome.storage.local)(items),
      remove: (keys) => promisify(chrome.storage.local.remove, chrome.storage.local)(keys),
      clear: () => promisify(chrome.storage.local.clear, chrome.storage.local)(),
    },
    onChanged: chrome.storage.onChanged,
  };
  const runtime = {
    sendMessage: (msg) => promisify(chrome.runtime.sendMessage, chrome.runtime)(msg),
    onMessage: chrome.runtime.onMessage,
    getURL: chrome.runtime.getURL,
  };
  const tabs = {
    query: (q) => promisify(chrome.tabs.query, chrome.tabs)(q),
    sendMessage: (tabId, msg) => promisify(chrome.tabs.sendMessage, chrome.tabs)(tabId, msg),
    captureVisibleTab: (windowId, options) => promisify(chrome.tabs.captureVisibleTab, chrome.tabs)(windowId, options),
  };
  const scripting = chrome.scripting ? {
    registerContentScripts: (defs) => promisify(chrome.scripting.registerContentScripts, chrome.scripting)(defs),
    unregisterContentScripts: (ids) => promisify(chrome.scripting.unregisterContentScripts, chrome.scripting)(ids),
    getRegisteredContentScripts: (filter) => promisify(chrome.scripting.getRegisteredContentScripts, chrome.scripting)(filter),
    executeScript: (opts) => promisify(chrome.scripting.executeScript, chrome.scripting)(opts),
    insertCSS: (opts) => promisify(chrome.scripting.insertCSS, chrome.scripting)(opts),
    removeCSS: (opts) => promisify(chrome.scripting.removeCSS, chrome.scripting)(opts),
  } : undefined;
  const contextMenus = {
    create: (opts) => chrome.contextMenus.create(opts),
    onClicked: chrome.contextMenus.onClicked,
    removeAll: (cb) => chrome.contextMenus.removeAll(cb),
  };
  const permissions = chrome.permissions ? {
    request: (perms) => promisify(chrome.permissions.request, chrome.permissions)(perms),
    remove: (perms) => promisify(chrome.permissions.remove, chrome.permissions)(perms),
    contains: (perms) => promisify(chrome.permissions.contains, chrome.permissions)(perms),
    onAdded: chrome.permissions.onAdded,
    onRemoved: chrome.permissions.onRemoved,
  } : undefined;
  return { storage, runtime, tabs, scripting, contextMenus, permissions };
})();

export const api = browserLike || globalThis.browser;

export function getURL(path) {
  if (api?.runtime?.getURL) return api.runtime.getURL(path);
  return path;
}
