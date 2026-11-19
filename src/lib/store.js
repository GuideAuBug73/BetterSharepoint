/*
 * Favoris (chrome.storage.sync, une clé par favori pour respecter la limite de 8 Ko par clé)
 * et dossiers récents (chrome.storage.local). Partagé par les scripts de contenu et la popup.
 */
(function (root) {
  'use strict';

  const FAV_PREFIX = 'fav_';
  const RECENTS_KEY = 'recents';

  function hash(str) {
    let h = 5381;
    const s = String(str).toLowerCase();
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function itemKey(item) {
    return (item.origin || '') + (item.path || item.url || '');
  }

  function favId(item) {
    return hash(itemKey(item));
  }

  /**
   * Un élément : { title, url, path?, origin?, kind: 'folder'|'file'|'site'|'page', site? }
   */
  async function listFavorites() {
    const all = await chrome.storage.sync.get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(FAV_PREFIX))
      .map((k) => all[k])
      .filter((f) => f && f.url)
      .sort((a, b) => (a.order ?? a.addedAt ?? 0) - (b.order ?? b.addedAt ?? 0));
  }

  async function addFavorite(item) {
    const id = favId(item);
    const fav = {
      id,
      title: item.title || item.url,
      url: item.url,
      path: item.path || '',
      origin: item.origin || '',
      kind: item.kind || 'folder',
      site: item.site || '',
      addedAt: Date.now(),
    };
    await chrome.storage.sync.set({ [FAV_PREFIX + id]: fav });
    return fav;
  }

  async function removeFavorite(id) {
    await chrome.storage.sync.remove(FAV_PREFIX + id);
  }

  async function isFavorite(item) {
    const k = FAV_PREFIX + favId(item);
    const r = await chrome.storage.sync.get(k);
    return !!r[k];
  }

  /** Bascule l'état favori. Renvoie true si l'élément est maintenant en favori. */
  async function toggleFavorite(item) {
    if (await isFavorite(item)) {
      await removeFavorite(favId(item));
      return false;
    }
    await addFavorite(item);
    return true;
  }

  async function renameFavorite(id, title) {
    const k = FAV_PREFIX + id;
    const r = await chrome.storage.sync.get(k);
    if (!r[k]) return;
    r[k].title = title;
    await chrome.storage.sync.set({ [k]: r[k] });
  }

  async function reorderFavorites(ids) {
    const all = await chrome.storage.sync.get(ids.map((id) => FAV_PREFIX + id));
    const patch = {};
    ids.forEach((id, i) => {
      const f = all[FAV_PREFIX + id];
      if (f) patch[FAV_PREFIX + id] = Object.assign({}, f, { order: i });
    });
    await chrome.storage.sync.set(patch);
  }

  async function importFavorites(list) {
    const patch = {};
    for (const it of list || []) {
      if (!it || !it.url) continue;
      const id = favId(it);
      patch[FAV_PREFIX + id] = Object.assign({ addedAt: Date.now(), kind: 'folder' }, it, { id });
    }
    await chrome.storage.sync.set(patch);
    return Object.keys(patch).length;
  }

  async function listRecents() {
    const r = await chrome.storage.local.get(RECENTS_KEY);
    return Array.isArray(r[RECENTS_KEY]) ? r[RECENTS_KEY] : [];
  }

  async function addRecent(item, max) {
    const list = await listRecents();
    const key = itemKey(item).toLowerCase();
    const next = [Object.assign({}, item, { visitedAt: Date.now() })].concat(
      list.filter((x) => itemKey(x).toLowerCase() !== key)
    );
    next.length = Math.min(next.length, max || 20);
    await chrome.storage.local.set({ [RECENTS_KEY]: next });
    return next;
  }

  async function removeRecent(url) {
    const list = await listRecents();
    await chrome.storage.local.set({ [RECENTS_KEY]: list.filter((x) => x.url !== url) });
  }

  async function clearRecents() {
    await chrome.storage.local.set({ [RECENTS_KEY]: [] });
  }

  function onFavoritesChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && Object.keys(changes).some((k) => k.startsWith(FAV_PREFIX))) cb();
    });
  }

  function onRecentsChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[RECENTS_KEY]) cb();
    });
  }

  const api = {
    hash,
    favId,
    listFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    renameFavorite,
    reorderFavorites,
    importFavorites,
    listRecents,
    addRecent,
    removeRecent,
    clearRecents,
    onFavoritesChange,
    onRecentsChange,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).store = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
