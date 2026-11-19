/*
 * Script exécuté dans le monde de la page (MAIN). Il expose au script de contenu :
 *  - le contexte SharePoint (_spPageContextInfo) via l'attribut data-bsp-ctx de <html> ;
 *  - les navigations internes (history.pushState/replaceState) via l'événement "bsp:locationchange".
 * Il ne lit ni n'envoie aucune autre donnée.
 */
(function () {
  'use strict';
  if (window.__bspBridge) return;
  window.__bspBridge = true;

  const FIELDS = [
    'webAbsoluteUrl',
    'webServerRelativeUrl',
    'webTitle',
    'siteAbsoluteUrl',
    'siteServerRelativeUrl',
    'listUrl',
    'listTitle',
    'listId',
    'userDisplayName',
    'currentUICultureName',
    'isSPO',
  ];
  let last = '';

  function publish() {
    try {
      const c = window._spPageContextInfo;
      if (!c) return;
      const o = {};
      for (const f of FIELDS) if (c[f] != null) o[f] = c[f];
      const s = JSON.stringify(o);
      if (s !== last) {
        last = s;
        document.documentElement.setAttribute('data-bsp-ctx', s);
        window.dispatchEvent(new Event('bsp:context'));
      }
    } catch (e) {
      /* ignore */
    }
  }

  function notify() {
    window.dispatchEvent(new Event('bsp:locationchange'));
    setTimeout(publish, 300);
    setTimeout(publish, 1500);
  }

  for (const m of ['pushState', 'replaceState']) {
    const orig = history[m];
    if (typeof orig !== 'function') continue;
    history[m] = function () {
      const r = orig.apply(this, arguments);
      try {
        notify();
      } catch (e) {
        /* ignore */
      }
      return r;
    };
  }
  window.addEventListener('popstate', notify);

  publish();
  document.addEventListener('DOMContentLoaded', publish);
  window.addEventListener('load', publish);
  let n = 0;
  const t = setInterval(() => {
    publish();
    if (++n > 20) clearInterval(t);
  }, 500);
})();
