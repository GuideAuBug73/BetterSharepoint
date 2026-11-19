/*
 * 15 · Aperçu au survol : vignette et métadonnées d'un fichier ou dossier quand la souris
 * reste sur son nom (résultats de recherche, bibliothèques).
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;
  const NO_THUMB = new Set(['zip', '7z', 'rar', 'exe', 'msi', 'iso', 'url', 'lnk', 'one', 'onetoc2']);

  let timer = null;
  let card = null;
  let currentKey = '';
  let lastMouse = { x: 0, y: 0 };

  function itemFromTarget(t) {
    if (!t || !t.closest || t.closest('#bsp-ui-host, .bsp-actions, .bsp-meta')) return null;
    const a = t.closest('a[data-bsp-path]');
    if (a) {
      return { kind: a.getAttribute('data-bsp-kind') || 'file', path: a.getAttribute('data-bsp-path'), origin: a.getAttribute('data-bsp-origin') || location.origin, anchor: a };
    }
    const row = BSP.newtab.rowOf(t);
    if (row) {
      const nm = BSP.newtab.rowName(row);
      if (nm.node && nm.node.contains(t)) {
        const it = BSP.newtab.rowItem(row);
        if (it) return Object.assign(it, { anchor: nm.node });
      }
    }
    return null;
  }

  function onOver(e) {
    if (!BSP.feature('hoverPreview')) return;
    const it = itemFromTarget(e.target);
    const key = it ? it.origin + it.path : '';
    if (key === currentKey) return;
    currentKey = key;
    clearTimeout(timer);
    hide();
    if (!it) return;
    timer = setTimeout(() => show(it), Math.max(150, BSP.settings.hoverDelay || 600));
  }

  function onMove(e) {
    lastMouse = { x: e.clientX, y: e.clientY };
  }

  function hide() {
    if (card) card.remove();
    card = null;
  }

  function position(c, anchor) {
    const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    const W = 320;
    let x = rect ? rect.left : lastMouse.x + 12;
    let y = rect ? rect.bottom + 6 : lastMouse.y + 16;
    x = Math.min(Math.max(8, x), window.innerWidth - W - 8);
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    requestAnimationFrame(() => {
      const h = c.offsetHeight;
      if (y + h > window.innerHeight - 8) {
        const above = rect ? rect.top - h - 6 : lastMouse.y - h - 12;
        c.style.top = Math.max(8, above) + 'px';
      }
    });
  }

  async function show(it) {
    const r = BSP.ui.ensure();
    const myKey = it.origin + it.path;
    card = BSP.el('div', { class: 'hovercard', role: 'tooltip' });
    const name = U.basename(it.path);
    const ext = U.extension(name);
    const head = BSP.el('div', { class: 'hc-head' }, [
      BSP.el('span', { class: 'hc-icon', html: it.kind === 'folder' ? BSP.icons.folder : BSP.icons.file }),
      BSP.el('strong', { text: name }),
    ]);
    card.appendChild(head);
    let thumb = null;
    if (it.kind === 'file' && !NO_THUMB.has(ext)) {
      thumb = BSP.el('img', { class: 'hc-thumb', alt: '', src: BSP.api.thumbnailUrl(it.path, { origin: it.origin }) });
      thumb.addEventListener('error', () => thumb.remove());
      thumb.addEventListener('load', () => {
        // getpreview renvoie parfois une image 1×1 quand aucun aperçu n'existe.
        if (thumb.naturalWidth < 8) thumb.remove();
      });
      card.appendChild(thumb);
    }
    const meta = BSP.el('div', { class: 'hc-meta', text: 'Chargement…' });
    card.appendChild(meta);
    card.appendChild(BSP.el('div', { class: 'hc-path', text: U.parentPath(it.path) }));
    r.appendChild(card);
    position(card, it.anchor);

    try {
      const info = it.kind === 'folder' ? await BSP.api.folderInfo(it.path, { origin: it.origin }) : await BSP.api.fileInfo(it.path, { origin: it.origin });
      if (currentKey !== myKey || !card) return;
      const lines = [];
      if (it.kind === 'folder') {
        if (info.ItemCount != null) lines.push(info.ItemCount + ' élément' + (info.ItemCount > 1 ? 's' : ''));
        if (info.TimeLastModified) lines.push('Modifié le ' + BSP.formatDate(info.TimeLastModified));
      } else {
        if (info.TimeLastModified) {
          lines.push('Modifié le ' + BSP.formatDate(info.TimeLastModified) + (info.ModifiedBy && info.ModifiedBy.Title ? ' par ' + info.ModifiedBy.Title : ''));
        }
        if (info.Author && info.Author.Title) lines.push('Créé par ' + info.Author.Title + (info.TimeCreated ? ' le ' + BSP.formatDate(info.TimeCreated) : ''));
        const bits = [];
        if (info.Length != null) bits.push(BSP.formatSize(Number(info.Length)));
        if (info.UIVersionLabel) bits.push('version ' + info.UIVersionLabel);
        if (info.CheckOutType === 0) bits.push('extrait');
        if (bits.length) lines.push(bits.join(' · '));
      }
      meta.textContent = '';
      lines.forEach((l) => meta.appendChild(BSP.el('div', { text: l })));
      if (!lines.length) meta.remove();
    } catch (e) {
      if (meta.isConnected) meta.textContent = e.status === 404 ? 'Élément introuvable' : 'Métadonnées indisponibles';
    }
  }

  BSP.hover = {
    init() {
      document.addEventListener('mouseover', onOver, true);
      document.addEventListener('mousemove', onMove, { capture: true, passive: true });
      document.addEventListener('scroll', () => hide(), { capture: true, passive: true });
      document.addEventListener('mousedown', () => {
        clearTimeout(timer);
        hide();
      }, true);
    },
    hide,
  };
})(globalThis);
