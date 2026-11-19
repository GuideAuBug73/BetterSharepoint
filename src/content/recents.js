/*
 * 5 · Dossiers récents : chaque dossier visité est mémorisé localement (20 par défaut).
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});

  async function record() {
    if (!BSP.feature('recents')) return;
    const cur = await BSP.current();
    if (!cur || cur.kind !== 'folder' || !cur.path) return;
    // Ne pas mémoriser la racine d'une collection de sites.
    if (BSP.url.normalizePath(cur.path) === BSP.url.normalizePath(cur.webPath || '/')) return;
    await BSP.store.addRecent(BSP.toItem(cur), BSP.settings.recentsMax);
  }

  BSP.recents = {
    record,
    list: () => BSP.store.listRecents(),
    init() {
      record();
      BSP.onNavigate(() => setTimeout(record, 300));
    },
  };
})(globalThis);
