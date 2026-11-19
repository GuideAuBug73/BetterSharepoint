/*
 * Service worker : ouverture d'onglets et de fenêtres côte à côte demandée par les scripts de contenu.
 */
'use strict';

function isSafeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'openTab' && isSafeUrl(msg.url)) {
    const props = { url: msg.url, active: !!msg.active };
    if (sender.tab) {
      props.index = sender.tab.index + 1;
      props.openerTabId = sender.tab.id;
      props.windowId = sender.tab.windowId;
    }
    chrome.tabs.create(props).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'openSideBySide' && Array.isArray(msg.urls) && msg.urls.length === 2 && msg.urls.every(isSafeUrl)) {
    const s = msg.screen || {};
    const width = Math.max(400, Math.floor((s.width || 1600) / 2));
    const height = Math.max(400, s.height || 900);
    const left = s.left || 0;
    const top = s.top || 0;
    Promise.all([
      chrome.windows.create({ url: msg.urls[0], left, top, width, height, focused: false }),
      chrome.windows.create({ url: msg.urls[1], left: left + width, top, width, height, focused: true }),
    ]).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
  }
});
