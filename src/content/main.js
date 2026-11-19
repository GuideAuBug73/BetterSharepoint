/*
 * Point d'entrée des scripts de contenu.
 */
(async function (g) {
  'use strict';
  const BSP = g.BSP;
  if (!BSP || BSP.started) return;
  BSP.started = true;
  // Ne rien injecter dans les iframes (aperçus Office, etc.).
  if (window.top !== window) return;

  try {
    await BSP.loadSettings();
  } catch (e) {
    console.warn('[BetterSharePoint] réglages indisponibles, valeurs par défaut utilisées', e);
  }
  try {
    const s = await chrome.storage.local.get('debug');
    BSP.debug = !!s.debug;
  } catch (e) {
    /* ignore */
  }

  const modules = ['favorites', 'recents', 'newtab', 'hover', 'search', 'pathbar', 'versions', 'palette', 'shortcuts'];
  for (const name of modules) {
    try {
      BSP[name].init();
    } catch (e) {
      console.error('[BetterSharePoint] module ' + name, e);
    }
  }
  document.documentElement.setAttribute('data-bsp-ready', '');
})(globalThis);
