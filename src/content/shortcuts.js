/*
 * 7 · Raccourcis clavier (personnalisables dans les options).
 * Les raccourcis sans modificateur sont ignorés pendant la saisie dans un champ.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});

  function hasModifier(binding) {
    const b = BSP.keys.parse(binding);
    return b.ctrl || b.meta || b.mod || b.alt;
  }

  function onKey(e) {
    if (e.defaultPrevented && !e.ctrlKey && !e.metaKey) return;
    const sc = BSP.settings.shortcuts || {};
    const path = e.composedPath ? e.composedPath() : [];
    const inOurUi = path.some((n) => n && n.id === 'bsp-ui-host');

    if (BSP.feature('palette') && sc.palette && BSP.keys.matches(e, sc.palette, BSP.isMac)) {
      e.preventDefault();
      e.stopPropagation();
      BSP.palette.toggle();
      return;
    }
    if (!BSP.feature('shortcuts') || inOurUi || e.repeat) return;
    if (BSP.palette && BSP.palette.isOpen()) return;
    const typing = BSP.keys.isTypingTarget(path[0] || e.target) || BSP.keys.isTypingTarget(document.activeElement);
    for (const id of Object.keys(sc)) {
      if (id === 'palette' || !sc[id]) continue;
      if (typing && !hasModifier(sc[id])) continue;
      if (!BSP.keys.matches(e, sc[id], BSP.isMac)) continue;
      const fn = BSP.actions[id];
      if (!fn) continue;
      e.preventDefault();
      e.stopPropagation();
      Promise.resolve(fn(e)).catch((err) => {
        console.error(err);
        BSP.ui.toast('Action impossible : ' + (err.message || err), 'warn');
      });
      return;
    }
  }

  BSP.shortcuts = {
    init() {
      window.addEventListener('keydown', onKey, true);
    },
  };
})(globalThis);
