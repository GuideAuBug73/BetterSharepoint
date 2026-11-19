/*
 * Actions partagées par la palette (6), les raccourcis (7) et la barre de chemin (9).
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  /** L'élément visé : la ligne sélectionnée d'une bibliothèque s'il y en a une seule, sinon la page. */
  async function target() {
    const sel = BSP.newtab && BSP.newtab.selectedItems ? BSP.newtab.selectedItems() : [];
    if (sel.length === 1) return sel[0];
    return BSP.current();
  }

  function decodedUrl(item) {
    return (item.origin || location.origin) + U.normalizePath(item.path);
  }

  async function parent(ev) {
    const cur = await BSP.current();
    if (!cur || !cur.path) return BSP.ui.toast('Pas de dossier parent pour cette page', 'warn');
    const web = U.normalizePath(cur.webPath || BSP.webPathFor(cur.path));
    if (cur.kind === 'site' || U.normalizePath(cur.path) === web) return BSP.ui.toast('Déjà à la racine du site', 'warn');
    const p = cur.kind === 'file' && cur.parent ? cur.parent : U.parentPath(cur.path);
    const url = U.normalizePath(p) === web ? U.siteUrl(cur.origin, web) : BSP.folderUrl(p, cur.origin);
    BSP.openFromEvent(url, ev);
  }

  async function copyLink() {
    const it = await target();
    if (!it || !it.path) return BSP.ui.toast('Aucun fichier ou dossier à copier ici', 'warn');
    const url = BSP.urlFor(it);
    const name = U.basename(it.path);
    await BSP.copy(url, '<a href="' + BSP.escapeHtml(url) + '">' + BSP.escapeHtml(name) + '</a>');
    BSP.ui.toast('Lien copié : ' + name);
  }

  async function copyPath() {
    const it = await target();
    if (!it || !it.path) return BSP.ui.toast('Aucun chemin à copier ici', 'warn');
    await BSP.copy(decodedUrl(it));
    BSP.ui.toast('Chemin copié');
  }

  async function copyMarkdown() {
    const it = await target();
    if (!it || !it.path) return BSP.ui.toast('Aucun lien à copier ici', 'warn');
    const url = BSP.urlFor(it);
    await BSP.copy('[' + U.basename(it.path).replace(/([[\]])/g, '\\$1') + '](' + url.replace(/\)/g, '%29') + ')');
    BSP.ui.toast('Lien Markdown copié');
  }

  async function dark() {
    const on = await BSP.theme.toggleDark();
    BSP.ui.toast(on ? 'Mode sombre activé' : 'Mode sombre désactivé');
  }

  async function compact() {
    const on = await BSP.theme.toggleCompact();
    BSP.ui.toast(on ? 'Mode compact activé' : 'Mode compact désactivé');
  }

  async function darkExcludeSite() {
    await BSP.theme.excludeSite(true);
    BSP.ui.toast('Mode sombre désactivé sur ce site');
  }

  const SEARCH_INPUTS = [
    '#sbcId input',
    'input#ms-searchux-input',
    '[role="search"] input',
    'input[type="search"]',
    'input[aria-label*="Rechercher" i]',
    'input[aria-label*="Search" i]',
    'input[placeholder*="Rechercher" i]',
    'input[placeholder*="Search" i]',
  ];

  function focusSearch() {
    for (const sel of SEARCH_INPUTS) {
      const i = document.querySelector(sel);
      if (i && i.offsetParent !== null) {
        i.click();
        i.focus();
        if (i.select) i.select();
        return true;
      }
    }
    const box = document.querySelector('#sbcId, [role="search"], [data-automationid*="search" i]');
    if (box) {
      box.click();
      setTimeout(() => {
        const i = box.querySelector('input');
        if (i) i.focus();
      }, 50);
      return true;
    }
    BSP.ui.toast('Barre de recherche introuvable : utilise Ctrl+K', 'warn');
    return false;
  }

  function help() {
    const { body } = BSP.ui.panel('Raccourcis clavier', { subtitle: 'BetterSharePoint' });
    const table = BSP.el('table', { class: 'keys' });
    const sc = BSP.settings.shortcuts;
    for (const k of Object.keys(sc)) {
      if (!sc[k]) continue;
      table.appendChild(
        BSP.el('tr', null, [
          BSP.el('td', null, [BSP.el('kbd', { text: BSP.keys.format(sc[k], BSP.isMac) })]),
          BSP.el('td', { text: BSP.settingsLib.SHORTCUT_LABELS[k] || k }),
        ])
      );
    }
    body.appendChild(table);
    body.appendChild(
      BSP.el('p', {
        class: 'muted',
        text: 'Les raccourcis sans Ctrl sont ignorés quand tu écris dans un champ. Ils se modifient dans les options de l’extension.',
      })
    );
    const opt = BSP.el('button', { class: 'btn', type: 'button', text: 'Ouvrir les options' });
    opt.addEventListener('click', openOptions);
    body.appendChild(opt);
  }

  function openOptions() {
    try {
      chrome.runtime.sendMessage({ type: 'openOptions' });
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Sélecteur d'élément à masquer (mode compact) ----------
  const STABLE_ATTRS = ['data-automationid', 'data-automation-id', 'data-sp-feature-tag', 'id', 'aria-label', 'data-testid'];

  function cssEscape(v) {
    return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
  }

  function looksGenerated(v) {
    return /[0-9a-f]{8}-[0-9a-f]{4}|\d{5,}|^(ms|css|r)-[a-z0-9]{4,}$/i.test(v);
  }

  function selectorFor(node) {
    const parts = [];
    let n = node;
    for (let depth = 0; n && n.nodeType === 1 && n !== document.body && depth < 5; depth++) {
      const tag = n.tagName.toLowerCase();
      for (const a of STABLE_ATTRS) {
        const v = n.getAttribute(a);
        if (!v || looksGenerated(v) || v.length > 80) continue;
        const s = a === 'id' ? '#' + cssEscape(v) : tag + '[' + a + '="' + v.replace(/"/g, '\\"') + '"]';
        const full = [s].concat(parts).join(' > ');
        try {
          if (document.querySelectorAll(full).length <= 3) return full;
        } catch (e) {
          /* ignore */
        }
      }
      const parent = n.parentElement;
      const same = parent ? Array.from(parent.children).filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(n) + 1) + ')' : tag);
      n = parent;
    }
    return parts.join(' > ');
  }

  function pickToHide() {
    BSP.ui.toast('Clique sur l’élément à masquer (Échap pour annuler)');
    let hovered = null;
    const under = (e) => {
      const x = document.elementFromPoint(e.clientX, e.clientY);
      return x && !x.closest('#bsp-ui-host') ? x : null;
    };
    const move = (e) => {
      const x = under(e);
      if (x === hovered) return;
      if (hovered) hovered.classList.remove('bsp-pick-hover');
      hovered = x;
      if (hovered) hovered.classList.add('bsp-pick-hover');
    };
    const done = () => {
      if (hovered) hovered.classList.remove('bsp-pick-hover');
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
    const click = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const x = under(e);
      done();
      if (!x) return;
      const sel = selectorFor(x);
      if (!sel) return BSP.ui.toast('Impossible de cibler cet élément', 'warn');
      const s = await BSP.settingsLib.load();
      s.compact.enabled = true;
      s.compact.customSelectors = (s.compact.customSelectors ? s.compact.customSelectors.trimEnd() + '\n' : '') + sel;
      await BSP.settingsLib.save(s);
      BSP.ui.toast('Élément masqué. Annulable dans les options > Mode compact.');
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done();
        BSP.ui.toast('Annulé');
      }
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
  }

  BSP.actions = {
    target,
    parent,
    copyLink,
    copyPath,
    copyMarkdown,
    favorite: () => BSP.favorites.toggleCurrent(),
    versions: () => BSP.versions.openCurrent(),
    recents: () => BSP.palette.open({ mode: 'recents' }),
    palette: () => BSP.palette.toggle(),
    dark,
    compact,
    darkExcludeSite,
    search: focusSearch,
    help,
    openOptions,
    pickToHide,
    selectorFor,
  };
})(globalThis);
