/*
 * 9 · Chemin visible et copiable partout : une barre discrète en bas à gauche affiche
 * le chemin complet du dossier ou fichier courant, chaque segment est cliquable,
 * avec boutons copier (lien, chemin, Markdown), favori et versions.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;
  const KEY = 'pathbarCollapsed';
  let bar = null;
  let collapsed = false;
  let renderToken = 0;

  async function render() {
    const token = ++renderToken;
    const r = BSP.ui.ensure();
    if (!BSP.feature('pathBar')) {
      if (bar) bar.remove();
      bar = null;
      return;
    }
    const cur = await BSP.current();
    if (token !== renderToken) return;
    if (!cur || !cur.path || !['folder', 'file'].includes(cur.kind)) {
      if (bar) bar.remove();
      bar = null;
      return;
    }
    if (!bar) {
      bar = BSP.el('div', { class: 'pathbar', role: 'toolbar', 'aria-label': 'Chemin BetterSharePoint' });
      r.appendChild(bar);
    }
    bar.classList.toggle('collapsed', collapsed);
    bar.textContent = '';

    const toggle = BSP.ui.iconButton(cur.kind === 'file' ? BSP.icons.file : BSP.icons.folder, collapsed ? 'Afficher le chemin' : 'Réduire', () => {
      collapsed = !collapsed;
      try {
        chrome.storage.local.set({ [KEY]: collapsed });
      } catch (e) {
        /* ignore */
      }
      render();
    });
    toggle.classList.add('pb-toggle');
    bar.appendChild(toggle);
    if (collapsed) return;

    const crumbs = BSP.el('nav', { class: 'pb-crumbs', 'aria-label': 'Chemin' });
    const segs = U.segments(cur.path, cur.webPath, BSP.siteLabel(cur.path));
    segs.forEach((s, i) => {
      if (i) crumbs.appendChild(BSP.el('span', { class: 'sep', html: BSP.icons.chevron }));
      const last = i === segs.length - 1;
      const href = s.kind === 'site' ? U.siteUrl(cur.origin, s.path) : last && cur.kind === 'file' ? null : BSP.folderUrl(s.path, cur.origin);
      crumbs.appendChild(
        href && !last
          ? BSP.el('a', { href, text: s.label, title: s.path })
          : BSP.el('span', { class: 'leaf', text: s.label, title: s.path })
      );
    });
    bar.appendChild(crumbs);
    requestAnimationFrame(() => (crumbs.scrollLeft = crumbs.scrollWidth));

    const acts = BSP.el('div', { class: 'pb-actions' });
    acts.appendChild(BSP.ui.iconButton(BSP.icons.link, 'Copier le lien direct', () => BSP.actions.copyLink()));
    acts.appendChild(BSP.ui.iconButton(BSP.icons.copy, 'Copier le chemin', () => BSP.actions.copyPath()));
    const md = BSP.el('button', { class: 'ibtn txt', type: 'button', title: 'Copier un lien Markdown', text: 'MD' });
    md.addEventListener('click', () => BSP.actions.copyMarkdown());
    acts.appendChild(md);
    if (BSP.feature('favorites')) {
      acts.appendChild(BSP.favorites.starButton(cur, 'ibtn'));
    }
    if (cur.kind === 'file' && BSP.feature('versions')) {
      acts.appendChild(BSP.ui.iconButton(BSP.icons.history, 'Historique des versions', () => BSP.versions.open(cur)));
    }
    bar.appendChild(acts);
  }

  BSP.pathbar = {
    render,
    async init() {
      try {
        const s = await chrome.storage.local.get(KEY);
        collapsed = !!s[KEY];
      } catch (e) {
        /* ignore */
      }
      render();
      BSP.onNavigate(() => setTimeout(render, 100));
      BSP.onSettings(render);
    },
  };
})(globalThis);
