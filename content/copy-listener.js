// Content script: listens for copy events and sends selection to background
(function init() {
  if (window.__clarityVaultCopyListenerAttached) return;
  window.__clarityVaultCopyListenerAttached = true;

  let lastPayload = '';
  let lastTime = 0;

  document.addEventListener('copy', () => {
    try {
      const sel = window.getSelection();
      const text = (sel && sel.toString()) || '';
      if (!text || text.trim().length < 2) return;
      const payload = text.trim().slice(0, 10000);
      const now = Date.now();
      if (payload === lastPayload && now - lastTime < 1500) return; // dedupe rapid copies
      lastPayload = payload; lastTime = now;
      const title = document.title || '';
      const url = location.href;
      chrome.runtime.sendMessage({ type: 'saveClip', payload: { text: payload, title, url } });
    } catch {}
  }, { capture: true });
})();
