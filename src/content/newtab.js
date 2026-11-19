/*
 * 11 · Ouvrir en nouvel onglet de façon fiable.
 * Dans les bibliothèques, les noms de fichiers sont souvent des boutons React et non de vrais
 * liens : le clic du milieu et Ctrl+clic n'y fonctionnent pas. On reconstruit l'URL de
 * l'élément à partir du dossier courant et du nom affiché.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  const GRID = '[role="grid"], [role="treegrid"], .ms-DetailsList';
  const NAME_SEL = [
    '[data-automationid="field-LinkFilename"] [data-id="heroField"]',
    '[data-automationid="FieldRenderer-name"]',
    '[data-automationid="field-LinkFilename"]',
    '[data-automationid="field-FileLeafRef"]',
    '[data-automation-key^="displayNameColumn"] button',
    '[data-automation-key^="displayNameColumn"] [role="link"]',
    '[data-automation-key="LinkFilename"] button',
    '[data-automation-key="Name"] button',
  ].join(',');
  const FOLDER_ICON =
    '[data-icon-name*="Folder" i], i[class*="folder" i], img[src*="folder" i], [role="img"][aria-label*="dossier" i], [role="img"][aria-label*="folder" i], svg[aria-label*="folder" i]';

  function rowOf(node) {
    if (!node || !node.closest) return null;
    const row = node.closest('[role="row"]');
    if (!row || !row.closest(GRID)) return null;
    if (row.querySelector('[role="columnheader"]')) return null;
    return row;
  }

  function rowName(row) {
    let n = row.querySelector(NAME_SEL);
    let text = n ? n.getAttribute('title') || n.textContent : '';
    if (!text || !text.trim()) {
      n = null;
      for (const c of row.querySelectorAll(
        '[role="gridcell"] button, [role="gridcell"] a, [role="gridcell"] [role="link"], [role="gridcell"] [role="button"]'
      )) {
        const t = c.textContent.trim();
        if (t && !c.querySelector('input[type="checkbox"]') && c.getAttribute('role') !== 'checkbox') {
          text = t;
          n = c;
          break;
        }
      }
    }
    return { text: (text || '').trim(), node: n };
  }

  function currentFolder() {
    const r = U.parse(location.href);
    if (!r) return null;
    if (r.kind === 'folder') return r.path;
    if (r.kind === 'file' && r.parent) return r.parent;
    return null;
  }

  /** Recherche dans une bibliothèque (?q=…) : les résultats viennent de toute la bibliothèque. */
  function isListSearch() {
    return !!new URLSearchParams(location.search).get('q');
  }

  /** Identifiant d'élément de liste porté par la ligne (vues modernes). */
  function rowId(row) {
    const v = row.getAttribute('data-selection-index') || ((row.getAttribute('data-automationid') || '').match(/^row-(\d+)$/) || [])[1];
    return v && /^\d+$/.test(v) ? v : null;
  }

  function rowIsFolder(row, name) {
    if (row.querySelector(FOLDER_ICON)) return true;
    const icon = row.querySelector('[data-automationid="field-DocIcon"] [aria-label], [data-automationid="field-DocIcon"][aria-label]');
    const label = icon ? icon.getAttribute('aria-label') || '' : '';
    if (/^\.[a-z0-9]+$/i.test(label.trim())) return false;
    return !U.extension(name);
  }

  /**
   * Élément d'une ligne, calculé sans appel réseau. Renvoie null quand le chemin ne peut pas
   * être déduit de la page (recherche dans une bibliothèque) : utiliser alors resolveRow().
   */
  function rowItem(row) {
    if (!row) return null;
    const a = row.querySelector('a[href]');
    if (a) {
      const p = U.parse(a.href);
      if (p && p.path && (p.kind === 'file' || p.kind === 'folder')) return Object.assign(p, { title: U.basename(p.path) });
    }
    if (isListSearch()) return null;
    const { text } = rowName(row);
    const folder = currentFolder();
    if (!text || !folder || text.includes('/')) return null;
    return { kind: rowIsFolder(row, text) ? 'folder' : 'file', path: folder + '/' + text, origin: location.origin, title: text };
  }

  /** Élément d'une ligne, en interrogeant l'API de la liste si nécessaire. */
  async function resolveRow(row) {
    const quick = rowItem(row);
    if (quick) return quick;
    const id = rowId(row);
    const ctx = BSP.pageContext();
    if (!id || !ctx.listId) return null;
    try {
      const r = await BSP.api.listItem(ctx.webServerRelativeUrl || '/', ctx.listId, id);
      if (!r || !r.FileRef) return null;
      const path = U.normalizePath(r.FileRef);
      return { kind: Number(r.FSObjType) === 1 ? 'folder' : 'file', path, origin: location.origin, title: r.FileLeafRef || U.basename(path) };
    } catch (e) {
      BSP.log('listItem', e);
      return null;
    }
  }

  /** Clé stable d'une ligne, pour l'aperçu au survol. */
  function rowKey(row) {
    const id = rowId(row);
    if (id) return location.pathname + '#' + id;
    const it = rowItem(row);
    return it ? it.origin + it.path : '';
  }

  async function selectedItems() {
    const rows = Array.from(document.querySelectorAll('[role="row"][aria-selected="true"]')).filter((r) => r.closest(GRID));
    return (await Promise.all(rows.map(resolveRow))).filter(Boolean);
  }

  function isRealLink(a) {
    if (!a) return false;
    const h = a.getAttribute('href') || '';
    return !!h && !/^(#|javascript:)/i.test(h);
  }

  function onClick(e) {
    if (!BSP.feature('newTab')) return;
    if (e.target.closest && e.target.closest('[data-bsp], #bsp-ui-host')) return;
    const middle = e.type === 'auxclick' && e.button === 1;
    const mod = e.type === 'click' && e.button === 0 && (e.ctrlKey || e.metaKey);
    const plain = e.type === 'click' && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    if (!middle && !mod && !(plain && BSP.settings.alwaysNewTab)) return;
    if (isRealLink(e.target.closest('a[href]'))) return; // le navigateur sait faire
    const row = rowOf(e.target);
    if (!row) return;
    const nm = rowName(row);
    if (!nm.node || !nm.node.contains(e.target)) return;
    const it = rowItem(row);
    if (it) {
      // Clic simple + « toujours nouvel onglet » : seulement pour les fichiers, les dossiers restent sur place.
      if (plain && it.kind !== 'file') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      BSP.open(BSP.urlFor(it), { newTab: true, background: !plain && !e.shiftKey });
      return;
    }
    // Chemin inconnu (recherche dans une bibliothèque) : le résoudre par l'identifiant de la ligne.
    if (plain || !rowId(row)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const background = !e.shiftKey;
    resolveRow(row).then((r) => {
      if (r) BSP.open(BSP.urlFor(r), { newTab: true, background });
      else BSP.ui.toast('Impossible de retrouver l’emplacement de cet élément', 'warn');
    });
  }

  // Empêche le défilement automatique du clic du milieu sur les noms.
  function onMouseDown(e) {
    if (e.button !== 1 || !BSP.feature('newTab')) return;
    const row = rowOf(e.target);
    if (row && rowName(row).node && rowName(row).node.contains(e.target)) e.preventDefault();
  }

  BSP.newtab = {
    rowOf,
    rowName,
    rowItem,
    resolveRow,
    rowKey,
    rowId,
    isListSearch,
    selectedItems,
    currentFolder,
    init() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('auxclick', onClick, true);
      document.addEventListener('mousedown', onMouseDown, true);
    },
  };
})(globalThis);
