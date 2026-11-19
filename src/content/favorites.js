/*
 * 4 · Favoris multi-sites : étoile sur le dossier ou fichier courant, sur les résultats
 * de recherche et dans la palette. Synchronisés entre navigateurs via storage.sync.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const listeners = [];

  async function toggle(item) {
    if (!item || !item.url) return false;
    const on = await BSP.store.toggleFavorite(BSP.toItem(item));
    BSP.ui.toast(on ? '★ Ajouté aux favoris : ' + (item.title || '') : 'Retiré des favoris');
    return on;
  }

  async function toggleCurrent() {
    if (!BSP.feature('favorites')) return;
    const cur = await BSP.current();
    if (!cur || !cur.path) {
      BSP.ui.toast('Rien à ajouter aux favoris sur cette page', 'warn');
      return;
    }
    return toggle(cur);
  }

  /** Bouton étoile pour un élément (utilisé dans les résultats de recherche). */
  function starButton(item, cls) {
    const b = BSP.el('button', { type: 'button', class: cls || 'bsp-btn bsp-star', 'aria-pressed': 'false' });
    const render = (on) => {
      b.innerHTML = on ? BSP.icons.starFilled : BSP.icons.star;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
      b.title = label;
      b.setAttribute('aria-label', label);
    };
    render(false);
    const refresh = () => BSP.store.isFavorite(BSP.toItem(item)).then(render).catch(() => {});
    refresh();
    listeners.push({ b, refresh });
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      render(await toggle(item));
    });
    return b;
  }

  BSP.favorites = {
    toggle,
    toggleCurrent,
    starButton,
    list: () => BSP.store.listFavorites(),
    init() {
      BSP.store.onFavoritesChange(() => {
        // Les boutons retirés du DOM sont oubliés.
        for (let i = listeners.length - 1; i >= 0; i--) {
          if (listeners[i].b.isConnected) listeners[i].refresh();
          else listeners.splice(i, 1);
        }
      });
    },
  };
})(globalThis);
