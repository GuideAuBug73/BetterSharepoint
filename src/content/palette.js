/*
 * 6 · Palette de commandes (Ctrl+K) : recherche instantanée parmi les favoris, les dossiers
 * récents, les sites suivis et les actions, plus une recherche SharePoint dont chaque
 * résultat a son bouton « dossier parent ».
 *
 * Clavier : ↑/↓ pour choisir, Entrée pour ouvrir, Ctrl+Entrée nouvel onglet,
 * Alt+Entrée dossier parent, Échap pour fermer. Préfixe « > » : actions seulement.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  let wrap = null;
  let input = null;
  let listEl = null;
  let footer = null;
  let items = [];
  let active = 0;
  let mode = null;
  let data = { favs: [], recents: [], sites: [] };
  let search = { q: '', rows: null, loading: false, error: null, ctrl: null };

  function actionList() {
    const sc = BSP.settings.shortcuts;
    const f = (k) => (sc[k] ? BSP.keys.format(sc[k], BSP.isMac) : '');
    const list = [
      { id: 'parent', title: 'Ouvrir le dossier parent', hint: f('parent') },
      { id: 'copyLink', title: 'Copier le lien direct', hint: f('copyLink') },
      { id: 'copyPath', title: 'Copier le chemin', hint: f('copyPath') },
      { id: 'copyMarkdown', title: 'Copier un lien Markdown' },
      { id: 'favorite', title: 'Ajouter ou retirer des favoris', hint: f('favorite'), feature: 'favorites' },
      { id: 'versions', title: 'Historique des versions', hint: f('versions'), feature: 'versions' },
      { id: 'dark', title: 'Basculer le mode sombre', hint: f('dark') },
      { id: 'darkExcludeSite', title: 'Désactiver le mode sombre sur ce site' },
      { id: 'compact', title: 'Basculer le mode compact', hint: f('compact') },
      { id: 'pickToHide', title: 'Masquer un élément de la page…' },
      { id: 'search', title: 'Aller à la barre de recherche SharePoint', hint: f('search') },
      { id: 'help', title: 'Aide des raccourcis clavier', hint: f('help') },
      { id: 'openOptions', title: 'Ouvrir les options de BetterSharePoint' },
    ];
    return list
      .filter((a) => !a.feature || BSP.feature(a.feature))
      .map((a) => ({ type: 'action', title: a.title, hint: a.hint, icon: BSP.icons.bolt, run: () => BSP.actions[a.id]() }));
  }

  function entryFromStored(x, type) {
    return {
      type,
      title: x.title || U.basename(x.path) || x.url,
      subtitle: [x.site, x.path ? U.parentPath(x.path) : x.url].filter(Boolean).join(' · '),
      icon: type === 'site' ? BSP.icons.site : x.kind === 'file' ? BSP.icons.file : type === 'recent' ? BSP.icons.clock : BSP.icons.folder,
      url: x.url,
      path: x.path,
      origin: x.origin,
      kind: x.kind || (type === 'site' ? 'site' : 'folder'),
      fav: type === 'fav',
    };
  }

  function entryFromResult(r) {
    const p = U.parse(r.path);
    const isFile = r.isDocument || (p && p.kind === 'file');
    const kind = r.isContainer ? 'folder' : isFile ? 'file' : p ? p.kind : 'page';
    const it = {
      type: 'result',
      title: r.title || (p && p.path ? U.basename(p.path) : r.path),
      subtitle: [p && p.path ? U.parentPath(p.path) : r.path, r.modified ? BSP.formatDate(r.modified) : '', r.editor].filter(Boolean).join(' · '),
      icon: kind === 'folder' ? BSP.icons.folder : kind === 'file' ? BSP.icons.file : BSP.icons.site,
      origin: p ? p.origin : location.origin,
      kind,
    };
    if (p && p.path && (kind === 'file' || kind === 'folder')) {
      it.path = p.path;
      it.url = BSP.urlFor({ kind, path: p.path, origin: p.origin });
      if (kind === 'file' && p.path) it.title = U.basename(p.path);
    } else it.url = r.path;
    return it;
  }

  async function loadData() {
    const [favs, recents] = await Promise.all([
      BSP.feature('favorites') ? BSP.store.listFavorites() : [],
      BSP.feature('recents') ? BSP.store.listRecents() : [],
    ]);
    data.favs = favs;
    data.recents = recents;
    render();
    BSP.api
      .followedSites()
      .then((sites) => {
        data.sites = sites;
        if (wrap) render();
      })
      .catch(() => {});
  }

  function build() {
    const r = BSP.ui.ensure();
    input = BSP.el('input', {
      class: 'pal-input',
      type: 'text',
      placeholder: 'Rechercher un favori, un dossier récent, un site, une action…  (« > » pour les actions)',
      'aria-label': 'Palette de commandes',
      'aria-controls': 'bsp-pal-list',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    listEl = BSP.el('div', { class: 'pal-list', id: 'bsp-pal-list', role: 'listbox' });
    footer = BSP.el('div', { class: 'pal-foot' });
    const box = BSP.el('div', { class: 'palette', role: 'dialog', 'aria-label': 'BetterSharePoint' }, [
      BSP.el('div', { class: 'pal-head' }, [BSP.el('span', { class: 'pal-icon', html: BSP.icons.search }), input]),
      listEl,
      footer,
    ]);
    wrap = BSP.el('div', { class: 'pal-wrap' }, [BSP.el('div', { class: 'scrim', onclick: close }), box]);
    r.appendChild(wrap);
    input.addEventListener('input', () => {
      active = 0;
      render();
      scheduleSearch();
    });
    input.addEventListener('keydown', onKey);
    // Empêche SharePoint de réagir aux touches tapées dans la palette.
    for (const t of ['keydown', 'keyup', 'keypress']) wrap.addEventListener(t, (e) => e.stopPropagation());
  }

  function open(opts) {
    if (!BSP.feature('palette')) return;
    const o = opts || {};
    mode = o.mode || null;
    if (!wrap) build();
    wrap.hidden = false;
    input.value = o.query || '';
    input.placeholder = mode === 'recents' ? 'Filtrer les dossiers récents…' : input.placeholder;
    active = 0;
    search = { q: '', rows: null, loading: false, error: null, ctrl: null };
    render();
    loadData();
    if (o.searchNow && input.value) runSearch(input.value);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function close() {
    if (!wrap) return;
    if (search.ctrl) search.ctrl.abort();
    wrap.remove();
    wrap = null;
    BSP.hover && BSP.hover.hide();
  }

  function toggle() {
    if (wrap) close();
    else open();
  }

  const scheduleSearch = BSP.debounce(() => {
    const q = input ? input.value.trim() : '';
    if (q.length >= 3 && !q.startsWith('>') && mode !== 'recents') runSearch(q);
  }, 400);

  async function runSearch(q) {
    if (search.ctrl) search.ctrl.abort();
    const ctrl = new AbortController();
    search = { q, rows: null, loading: true, error: null, ctrl };
    render();
    try {
      const rows = await BSP.api.search(q, { rowLimit: 15, signal: ctrl.signal });
      if (search.ctrl !== ctrl) return;
      search.rows = rows;
    } catch (e) {
      if (e.name === 'AbortError' || search.ctrl !== ctrl) return;
      search.error = e;
    }
    search.loading = false;
    if (wrap) render();
  }

  function compute() {
    const raw = input.value;
    const q = raw.trim();
    const out = [];
    const section = (title, list) => {
      if (list.length) out.push({ section: title }, ...list);
    };
    if (mode === 'recents') {
      const all = data.recents.map((x) => entryFromStored(x, 'recent'));
      section('Dossiers récents', q ? filter(q, all) : all);
      if (!data.recents.length) out.push({ empty: 'Aucun dossier récent pour l’instant.' });
      return out;
    }
    if (q.startsWith('>')) {
      const aq = q.slice(1).trim();
      const acts = actionList();
      section('Actions', aq ? filter(aq, acts) : acts);
      return out;
    }
    const favs = data.favs.map((x) => entryFromStored(x, 'fav'));
    const recents = data.recents.map((x) => entryFromStored(x, 'recent'));
    const sites = data.sites.map((s) => entryFromStored({ title: s.title, url: s.url, kind: 'site' }, 'site'));
    if (!q) {
      section('Favoris', favs.slice(0, 8));
      section('Récents', recents.slice(0, 6));
      section('Actions', actionList().slice(0, 5));
      if (!favs.length && !recents.length) out.unshift({ empty: 'Astuce : ajoute des favoris avec l’étoile ou la touche F.' });
      return out;
    }
    section('Favoris', filter(q, favs).slice(0, 6));
    section('Récents', filter(q, recents).slice(0, 6));
    section('Sites suivis', filter(q, sites).slice(0, 5));
    section('Actions', filter(q, actionList()).slice(0, 4));
    const sp = [{ type: 'searchAll', title: 'Rechercher « ' + q + ' » dans SharePoint', subtitle: 'Entrée : page de résultats complète', icon: BSP.icons.search, q }];
    if (search.q === q) {
      if (search.loading) sp.push({ empty: 'Recherche en cours…' });
      else if (search.error) sp.push({ empty: 'La recherche SharePoint a échoué (' + (search.error.status || search.error.message) + ').' });
      else if (search.rows) {
        if (!search.rows.length) sp.push({ empty: 'Aucun résultat.' });
        sp.push(...search.rows.map(entryFromResult));
      }
    }
    section('SharePoint', sp);
    return out;
  }

  function filter(q, list) {
    return BSP.fuzzy.filter(q, list, (x) => x.title + ' ' + (x.subtitle || '')).map((m) => {
      const t = m.item.title;
      const titleMatch = BSP.fuzzy.match(q, t);
      return Object.assign({}, m.item, { indices: titleMatch ? titleMatch.indices : [] });
    });
  }

  function render() {
    if (!wrap) return;
    const rows = compute();
    items = rows.filter((r) => r.type);
    if (active >= items.length) active = Math.max(0, items.length - 1);
    listEl.textContent = '';
    let idx = 0;
    for (const r of rows) {
      if (r.section) {
        listEl.appendChild(BSP.el('div', { class: 'pal-section', text: r.section }));
        continue;
      }
      if (r.empty) {
        listEl.appendChild(BSP.el('div', { class: 'pal-empty', text: r.empty }));
        continue;
      }
      listEl.appendChild(renderItem(r, idx++));
    }
    footer.textContent = '';
    footer.append(
      hint('↑↓', 'choisir'),
      hint('Entrée', 'ouvrir'),
      hint(BSP.isMac ? '⌘+Entrée' : 'Ctrl+Entrée', 'nouvel onglet'),
      hint(BSP.isMac ? '⌥+Entrée' : 'Alt+Entrée', 'dossier parent'),
      hint('Échap', 'fermer')
    );
    highlightActive();
  }

  function hint(k, label) {
    return BSP.el('span', null, [BSP.el('kbd', { text: k }), ' ' + label]);
  }

  function renderItem(it, i) {
    const row = BSP.el('div', { class: 'pal-item', role: 'option', id: 'bsp-pal-' + i, 'data-index': String(i) });
    row.appendChild(BSP.el('span', { class: 'pi-icon' + (it.fav ? ' fav' : ''), html: it.icon }));
    const title = BSP.el('span', { class: 'pi-title' });
    title.appendChild(BSP.ui.highlight(it.title, it.indices));
    row.appendChild(BSP.el('span', { class: 'pi-text' }, [title, it.subtitle ? BSP.el('span', { class: 'pi-sub', text: it.subtitle }) : null]));
    if (it.hint) row.appendChild(BSP.el('kbd', { class: 'pi-hint', text: it.hint }));
    if (it.path && (it.kind === 'file' || it.kind === 'folder')) {
      const btns = BSP.el('span', { class: 'pi-btns' });
      const up = BSP.ui.iconButton(BSP.icons.folderUp, 'Ouvrir le dossier parent', (e) => {
        e.stopPropagation();
        openParent(it, e);
      });
      const nt = BSP.ui.iconButton(BSP.icons.newTab, 'Nouvel onglet', (e) => {
        e.stopPropagation();
        BSP.open(it.url, { newTab: true, background: false });
      });
      btns.append(up, nt);
      if (it.type === 'result' && BSP.feature('favorites')) {
        btns.appendChild(BSP.favorites.starButton({ kind: it.kind, path: it.path, origin: it.origin, title: it.title }, 'ibtn'));
      }
      row.appendChild(btns);
    }
    row.addEventListener('mousemove', () => {
      if (active !== i) {
        active = i;
        highlightActive();
      }
    });
    row.addEventListener('click', (e) => activate(it, e));
    row.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        activate(it, { ctrlKey: true });
      }
    });
    return row;
  }

  function highlightActive() {
    listEl.querySelectorAll('.pal-item').forEach((n) => {
      const on = Number(n.dataset.index) === active;
      n.classList.toggle('active', on);
      n.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        n.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', n.id);
      }
    });
  }

  function openParent(it, ev) {
    if (!it.path) return;
    const p = U.parentPath(it.path);
    close();
    BSP.openFromEvent(BSP.folderUrl(p, it.origin), ev);
  }

  function activate(it, ev) {
    const e = ev || {};
    if (it.type === 'action') {
      close();
      it.run();
      return;
    }
    if (it.type === 'searchAll') {
      const url = location.origin + '/_layouts/15/search.aspx/siteall?q=' + encodeURIComponent(it.q);
      close();
      BSP.openFromEvent(url, e);
      return;
    }
    if (e.altKey && it.path) return openParent(it, e);
    close();
    BSP.openFromEvent(it.url, e);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      highlightActive();
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      active = Math.max(0, active - 1);
      highlightActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[active];
      if (it) activate(it, e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (BSP.keys.matches(e, BSP.settings.shortcuts.palette, BSP.isMac)) {
      e.preventDefault();
      close();
    }
  }

  BSP.palette = { open, close, toggle, isOpen: () => !!wrap, init() {} };
})(globalThis);
