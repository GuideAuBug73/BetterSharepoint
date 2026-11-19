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

  function rowItem(row) {
    if (!row) return null;
    const a = row.querySelector('a[href]');
    if (a) {
      const p = U.parse(a.href);
      if (p && p.path && (p.kind === 'file' || p.kind === 'folder')) return Object.assign(p, { title: U.basename(p.path) });
    }
    const { text } = rowName(row);
    const folder = currentFolder();
    if (!text || !folder || text.includes('/')) return null;
    const isFolder = !!row.querySelector(FOLDER_ICON) || !U.extension(text);
    return { kind: isFolder ? 'folder' : 'file', path: folder + '/' + text, origin: location.origin, title: text };
  }

  function selectedItems() {
    return Array.from(document.querySelectorAll('[role="row"][aria-selected="true"]'))
      .filter((r) => r.closest(GRID))
      .map(rowItem)
      .filter(Boolean);
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
    if (!it) return;
    // Clic simple + « toujours nouvel onglet » : seulement pour les fichiers, les dossiers restent sur place.
    if (plain && it.kind !== 'file') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    BSP.open(BSP.urlFor(it), { newTab: true, background: !plain && !e.shiftKey });
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
    selectedItems,
    currentFolder,
    init() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('auxclick', onClick, true);
      document.addEventListener('mousedown', onMouseDown, true);
    },
  };
})(globalThis);
