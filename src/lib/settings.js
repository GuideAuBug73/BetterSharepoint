/*
 * Réglages de l'extension : valeurs par défaut et fusion. La partie stockage
 * (chrome.storage) n'est utilisée que si l'API est disponible.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    version: 1,
    features: {
      parentButton: true, // 1 · bouton dossier parent dans la recherche
      enrichSearch: true, // 8 · résultats de recherche enrichis
      favorites: true, // 4 · favoris multi-sites
      recents: true, // 5 · dossiers récents
      palette: true, // 6 · palette de commandes
      shortcuts: true, // 7 · raccourcis clavier
      pathBar: true, // 9 · barre de chemin copiable
      newTab: true, // 11 · ouverture fiable en nouvel onglet
      hoverPreview: true, // 15 · aperçu au survol
      versions: true, // 18 · historique de versions
    },
    dark: {
      enabled: false, // 14 · mode sombre
      excludedSites: [], // clés "hote/sites/X" où le mode sombre est désactivé
    },
    compact: {
      enabled: false, // 10 · mode compact
      hide: {
        siteHeader: false,
        appBar: false,
        comments: false,
        feedback: true,
        footer: false,
      },
      customSelectors: '',
    },
    recentsMax: 20,
    alwaysNewTab: false,
    folderOpenMode: 'direct', // 'direct' ou 'allitems'
    hoverDelay: 600,
    shortcuts: {
      palette: 'mod+k',
      search: '/',
      parent: 'p',
      copyLink: 'c',
      copyPath: 'shift+c',
      favorite: 'f',
      recents: 'r',
      versions: 'v',
      dark: 'd',
      compact: 'shift+d',
      help: '?',
    },
  };

  const SHORTCUT_LABELS = {
    palette: 'Ouvrir la palette de commandes',
    search: 'Aller à la barre de recherche',
    parent: 'Ouvrir le dossier parent',
    copyLink: 'Copier le lien direct',
    copyPath: 'Copier le chemin',
    favorite: 'Ajouter ou retirer des favoris',
    recents: 'Dossiers récents',
    versions: 'Historique des versions',
    dark: 'Basculer le mode sombre',
    compact: 'Basculer le mode compact',
    help: 'Afficher l’aide des raccourcis',
  };

  function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function merge(base, over) {
    if (!isObject(over)) return clone(base);
    const out = {};
    for (const k of Object.keys(base)) {
      const b = base[k];
      const o = over[k];
      if (isObject(b)) out[k] = merge(b, o);
      else if (o === undefined) out[k] = clone(b);
      else if (Array.isArray(b)) out[k] = Array.isArray(o) ? o.slice() : clone(b);
      else if (typeof b === typeof o) out[k] = o;
      else out[k] = clone(b);
    }
    return out;
  }

  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  function normalize(stored) {
    return merge(DEFAULTS, stored || {});
  }

  function hasChrome() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  }

  async function load() {
    if (!hasChrome()) return clone(DEFAULTS);
    const r = await chrome.storage.sync.get('settings');
    return normalize(r.settings);
  }

  async function save(settings) {
    const s = normalize(settings);
    if (hasChrome()) await chrome.storage.sync.set({ settings: s });
    return s;
  }

  /** Modifie une valeur par chemin pointé ("dark.enabled") et enregistre. */
  async function update(path, value) {
    const s = await load();
    const keys = path.split('.');
    let o = s;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = typeof value === 'function' ? value(o[keys[keys.length - 1]]) : value;
    return save(s);
  }

  function onChange(cb) {
    if (!hasChrome()) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) cb(normalize(changes.settings.newValue));
    });
  }

  const api = { DEFAULTS, SHORTCUT_LABELS, normalize, merge, load, save, update, onChange };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).settingsLib = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
