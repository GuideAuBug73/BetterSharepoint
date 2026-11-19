/*
 * 1 · Bouton « Ouvrir le dossier parent » sur chaque résultat de recherche.
 * 8 · Résultats enrichis : chemin complet cliquable, date, auteur, taille, doublons.
 *
 * Fonctionnement : on repère dans la page de résultats les liens qui pointent vers un
 * fichier ou un dossier SharePoint, on y greffe nos boutons, puis on interroge l'API de
 * recherche avec la même requête pour récupérer chemin et métadonnées.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  // Zones de navigation de SharePoint (pas les <header> internes des cartes de résultat).
  const EXCLUDE =
    '[role="banner"], [role="navigation"], nav, #SuiteNavWrapper, #O365_NavHeader, #spSiteHeader, [data-automationid="SiteHeader"], [data-bsp], #bsp-ui-host';
  // Carte d'un résultat : un seul élément décoré par carte.
  const CARD = 'article, [role="article"], [role="listitem"], [role="option"], [role="row"], li, [data-automationid*="result" i]';
  // Lien « Emplacement » d'une carte : il pointe vers le dossier qui contient le résultat.
  const LOCATION_RE = /^\s*(emplacement|location|chemin d|path)\b/i;

  let observer = null;
  let decorated = [];
  let api = { query: null, rows: null, byKey: new Map(), dups: new Map(), pending: null };
  let chipTimer = null;

  function queryText() {
    const p = new URLSearchParams(location.search);
    return p.get('q') || p.get('k') || p.get('query') || '';
  }

  function isSearchPage() {
    const p = location.pathname.toLowerCase();
    const q = queryText();
    if (/\/search\.aspx(\/|$)/.test(p) || /osssearchresults\.aspx/.test(p)) return true;
    return !!q && (/\/(sharepoint|onedrive)\.aspx$/.test(p) || /\/_layouts\/15\/search/.test(p));
  }

  // ---------- File d'attente pour les résolutions REST ----------
  const queue = [];
  let running = 0;
  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (running < 4 && queue.length) {
      const job = queue.shift();
      running++;
      job
        .fn()
        .then(job.resolve, job.reject)
        .finally(() => {
          running--;
          pump();
        });
    }
  }

  // ---------- Repérage des résultats ----------
  function isLocationLink(a) {
    return LOCATION_RE.test(a.getAttribute('aria-label') || '');
  }

  function cardOf(a) {
    const c = a.closest(CARD);
    return c && c !== document.body ? c : a.parentElement;
  }

  /** Dossier indiqué par le lien « Emplacement » de la carte, s'il existe. */
  function locationOf(card) {
    for (const x of card.querySelectorAll('a[href]')) {
      if (!isLocationLink(x)) continue;
      const p = U.parse(x.href);
      if (p && p.path && p.kind === 'folder') return p;
    }
    return null;
  }

  function scan() {
    if (!BSP.feature('parentButton') && !BSP.feature('enrichSearch')) return;
    const cards = new Map();
    for (const a of document.querySelectorAll('a[href]:not([data-bsp-done])')) {
      a.setAttribute('data-bsp-done', '');
      if (a.closest(EXCLUDE) || isLocationLink(a)) continue;
      if (!a.textContent.trim()) continue;
      const info = U.parse(a.href);
      if (!info || (info.kind !== 'file' && info.kind !== 'folder')) continue;
      const card = cardOf(a);
      if (!card || card.hasAttribute('data-bsp-decorated')) continue;
      // Le titre (dans un h1-h6) et les fichiers passent avant les autres liens de la carte.
      const score = (a.closest('h1, h2, h3, h4, h5, h6') ? 4 : 0) + (info.kind === 'file' ? 2 : 0);
      const prev = cards.get(card);
      if (!prev || score > prev.score) cards.set(card, { a, info, score });
    }
    for (const [card, c] of cards) {
      card.setAttribute('data-bsp-decorated', '');
      decorate(c.a, c.info, card);
    }
    if (decorated.length) hideChip();
  }

  function stopBubbling(node) {
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'auxclick', 'dblclick']) {
      node.addEventListener(t, (e) => e.stopPropagation());
    }
  }

  function decorate(a, info, container) {
    const entry = { a, info, container, resolved: null, actions: null, meta: null, parentBtn: null };
    decorated.push(entry);
    if (BSP.settings.alwaysNewTab) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    if (BSP.feature('parentButton')) {
      const actions = BSP.el('span', { class: 'bsp-actions', 'data-bsp': '' });
      stopBubbling(actions);
      const parentBtn = BSP.el('a', {
        class: 'bsp-btn bsp-parent',
        href: '#',
        role: 'button',
        title: 'Ouvrir le dossier parent (Ctrl+clic : nouvel onglet)',
        'aria-label': 'Ouvrir le dossier parent',
        'aria-busy': 'true',
        html: BSP.icons.folderUp,
      });
      parentBtn.addEventListener('click', (e) => onParentClick(e, entry));
      actions.appendChild(parentBtn);
      entry.actions = actions;
      entry.parentBtn = parentBtn;
      a.after(actions);
    }
    resolveEntry(entry);
  }

  async function resolveEntry(entry) {
    let r = entry.info.path ? entry.info : null;
    // Doc.aspx?sourcedoc=…&file=nom + lien « Emplacement » : le chemin est connu sans appel réseau.
    if (!r && entry.info.fileName) {
      const loc = locationOf(entry.container);
      if (loc) r = Object.assign({}, entry.info, { path: loc.path + '/' + entry.info.fileName, origin: loc.origin, needsResolve: false });
    }
    if (!r) {
      const row = matchRow(entry.info);
      if (row) {
        const p = U.parse(row.path);
        if (p && p.path) r = Object.assign({}, entry.info, { path: p.path, origin: p.origin, needsResolve: false });
      }
    }
    if (!r) {
      try {
        r = await enqueue(() => BSP.api.resolve(entry.info));
      } catch (e) {
        BSP.log('resolve', e);
      }
    }
    if (!r || !r.path) {
      if (entry.parentBtn) {
        entry.parentBtn.removeAttribute('aria-busy');
        entry.parentBtn.title = 'Dossier parent introuvable pour ce résultat';
      }
      return;
    }
    entry.resolved = r;
    entry.a.setAttribute('data-bsp-path', r.path);
    entry.a.setAttribute('data-bsp-origin', r.origin);
    entry.a.setAttribute('data-bsp-kind', r.kind);
    if (entry.parentBtn) {
      const parent = r.kind === 'file' && r.parent ? r.parent : U.parentPath(r.path);
      entry.parentBtn.href = BSP.folderUrl(parent, r.origin);
      entry.parentBtn.title = 'Ouvrir le dossier parent : ' + parent + '\n(Ctrl+clic ou clic du milieu : nouvel onglet)';
      entry.parentBtn.removeAttribute('aria-busy');
      entry.parentBtn.removeAttribute('role');
      if (BSP.settings.alwaysNewTab) entry.parentBtn.target = '_blank';
      if (BSP.feature('favorites') && !entry.actions.querySelector('.bsp-star')) {
        entry.actions.appendChild(
          BSP.favorites.starButton({ kind: r.kind, path: r.path, origin: r.origin, title: U.basename(r.path) })
        );
      }
    }
    enrich(entry);
  }

  function onParentClick(e, entry) {
    if (!entry.resolved) {
      e.preventDefault();
      BSP.ui.toast(entry.parentBtn.getAttribute('aria-busy') ? 'Recherche du dossier…' : 'Dossier parent introuvable', 'warn');
    }
    // Sinon : lien réel, le navigateur gère clic, Ctrl+clic et clic du milieu.
  }

  // ---------- API de recherche ----------
  function indexRows(rows) {
    api.byKey = new Map();
    for (const r of rows) {
      if (r.uniqueId) api.byKey.set('id:' + r.uniqueId, r);
      const k = U.compareKey(r.path);
      if (k) api.byKey.set(k, r);
    }
    api.dups = BSP.searchParse.duplicatesByName(rows);
  }

  function matchRow(info) {
    if (!api.rows) return null;
    if (info.uniqueId && api.byKey.has('id:' + info.uniqueId)) return api.byKey.get('id:' + info.uniqueId);
    if (info.path) return api.byKey.get((info.origin + info.path).toLowerCase()) || null;
    return null;
  }

  function loadApi() {
    const q = queryText();
    if (!q || !BSP.feature('enrichSearch')) return;
    if (api.query === q) return;
    api = { query: q, rows: null, byKey: new Map(), dups: new Map(), pending: null };
    const mine = api;
    mine.pending = BSP.api
      .search(q, { rowLimit: 50 })
      .then((rows) => {
        if (api !== mine) return;
        mine.rows = rows;
        indexRows(rows);
        for (const e of decorated) {
          if (!e.resolved) resolveEntry(e);
          else enrich(e);
        }
      })
      .catch((e) => BSP.log('search api', e));
  }

  function enrich(entry) {
    if (!BSP.feature('enrichSearch') || !entry.resolved) return;
    const r = entry.resolved;
    const row = matchRow(r) || matchRow(entry.info);
    // Déjà enrichi : ne refaire que si les données de l'API sont arrivées entre-temps.
    if (entry.meta) {
      if (entry.metaHasRow || !row) return;
      entry.meta.remove();
      entry.meta = null;
    }
    const parent = r.kind === 'file' && r.parent ? r.parent : U.parentPath(r.path);
    let webPath = BSP.webPathFor(parent);
    if (row && row.webUrl) {
      const w = U.parse(row.webUrl);
      if (w && w.path) webPath = w.path;
    }
    const meta = BSP.el('div', { class: 'bsp-meta', 'data-bsp': '' });
    stopBubbling(meta);
    const crumbs = BSP.el('span', { class: 'bsp-crumbs', title: 'Chemin du dossier (cliquer pour l’ouvrir)' });
    const segs = U.segments(parent, webPath, (row && row.siteTitle) || BSP.siteLabel(parent));
    segs.forEach((s, i) => {
      if (i) crumbs.appendChild(BSP.el('span', { class: 'bsp-sep', text: '›' }));
      const href = s.kind === 'site' ? U.siteUrl(r.origin, s.path) : BSP.folderUrl(s.path, r.origin);
      crumbs.appendChild(BSP.el('a', { href, text: s.label, target: BSP.settings.alwaysNewTab ? '_blank' : null }));
    });
    meta.appendChild(crumbs);
    if (row) {
      const bits = [];
      if (row.modified) bits.push('Modifié le ' + BSP.formatDate(row.modified) + (row.editor ? ' par ' + row.editor : ''));
      else if (row.author) bits.push('Auteur : ' + row.author);
      if (row.size && row.isDocument) bits.push(BSP.formatSize(row.size));
      if (bits.length) meta.appendChild(BSP.el('span', { class: 'bsp-info', text: bits.join(' · ') }));
      const name = U.basename(r.path).toLowerCase();
      const dups = api.dups.get(name);
      if (dups && dups.length > 1) {
        const others = dups.filter((d) => d !== row).map((d) => '• ' + safePath(d.path));
        meta.appendChild(
          BSP.el('span', {
            class: 'bsp-dup',
            text: dups.length + ' fichiers portent ce nom',
            title: 'Autres emplacements :\n' + others.join('\n'),
          })
        );
      }
    }
    entry.meta = meta;
    entry.metaHasRow = !!row;
    (entry.actions || entry.a).after(meta);
  }

  function safePath(abs) {
    const p = U.parse(abs);
    return p && p.path ? p.path : abs;
  }

  // ---------- Repli : pastille vers la palette ----------
  function showChipLater() {
    clearTimeout(chipTimer);
    chipTimer = setTimeout(() => {
      if (!isSearchPage() || decorated.length || !queryText() || !BSP.feature('palette')) return;
      const r = BSP.ui.ensure();
      if (r.querySelector('.chip')) return;
      const chip = BSP.el('button', { class: 'chip', type: 'button' }, [
        BSP.el('span', { class: 'chip-icon', html: BSP.icons.folderUp }),
        BSP.el('span', { text: 'Voir les résultats avec leur dossier parent' }),
      ]);
      chip.addEventListener('click', () => BSP.palette.open({ query: queryText(), searchNow: true }));
      r.appendChild(chip);
    }, 4000);
  }

  function hideChip() {
    const r = BSP.ui.ensure();
    const c = r.querySelector('.chip');
    if (c) c.remove();
  }

  // ---------- Cycle de vie ----------
  function cleanup() {
    for (const e of decorated) {
      if (e.actions) e.actions.remove();
      if (e.meta) e.meta.remove();
      e.container.removeAttribute('data-bsp-decorated');
    }
    document.querySelectorAll('[data-bsp-done]').forEach((x) => x.removeAttribute('data-bsp-done'));
    decorated = [];
  }

  function start() {
    if (!isSearchPage()) {
      stop();
      return;
    }
    if (api.query !== queryText()) cleanup();
    loadApi();
    scan();
    showChipLater();
    if (!observer) {
      const debounced = BSP.debounce(() => {
        // Les résultats dont le DOM a été recréé par React sont oubliés.
        decorated = decorated.filter((e) => e.a.isConnected);
        scan();
      }, 250);
      observer = new MutationObserver(debounced);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(chipTimer);
    hideChip();
  }

  BSP.search = {
    isSearchPage,
    queryText,
    init() {
      start();
      BSP.onNavigate(() => setTimeout(start, 50));
      BSP.onSettings(() => {
        cleanup();
        start();
      });
    },
    _scan: scan,
  };
})(globalThis);
