/*
 * Analyse et construction d'URL SharePoint Online.
 * Module pur : utilisable dans le navigateur (globalThis.BSP.url) et sous Node (module.exports).
 */
(function (root) {
  'use strict';

  const SITE_PREFIXES = ['sites', 'teams', 'personal', 'portals'];
  const SP_HOST_RE = /(^|\.)sharepoint(-df)?\.(com|us|de|cn)$|(^|\.)sharepoint-mil\.us$/i;
  const SHARING_RE = /^\/:([a-z]):\/([a-z])\/(.*)$/i;
  // Lettres des liens de partage : f = dossier, les autres désignent des fichiers.
  const FOLDER_LETTER = 'f';

  function isSharePointHost(host) {
    return SP_HOST_RE.test(String(host || ''));
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  }

  /** Normalise un chemin relatif au serveur : décodé, slash initial, sans slash final. */
  function normalizePath(p) {
    if (p == null) return '';
    let s = safeDecode(String(p)).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    if (!s.startsWith('/')) s = '/' + s;
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s;
  }

  /** Encode chaque segment d'un chemin pour l'utiliser dans une URL. */
  function encodePath(p) {
    return normalizePath(p)
      .split('/')
      .map((seg) => encodeURIComponent(seg).replace(/%40/g, '@'))
      .join('/');
  }

  function basename(p) {
    const s = normalizePath(p);
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function parentPath(p) {
    const s = normalizePath(p);
    const i = s.lastIndexOf('/');
    if (i <= 0) return '/';
    return s.slice(0, i);
  }

  function extension(name) {
    const b = basename(name);
    const i = b.lastIndexOf('.');
    if (i <= 0 || i === b.length - 1) return '';
    return b.slice(i + 1).toLowerCase();
  }

  /** Chemin de la collection de sites : "/sites/X", "/teams/Y", "/personal/z" ou "" pour la racine. */
  function siteCollectionPath(p) {
    const parts = normalizePath(p).split('/');
    if (parts.length >= 3 && SITE_PREFIXES.includes(parts[1].toLowerCase())) {
      return '/' + parts[1] + '/' + parts[2];
    }
    return '';
  }

  function isPersonal(p) {
    return /^\/personal\//i.test(normalizePath(p));
  }

  function isOneDriveHost(host) {
    return /-my\.sharepoint/i.test(String(host || ''));
  }

  /**
   * Racine de la bibliothèque contenant `path`, en supposant que la bibliothèque
   * est le premier segment après le web (`webPath`, par défaut la collection de sites).
   */
  function libraryRoot(path, webPath) {
    const p = normalizePath(path);
    const web = webPath != null ? normalizePath(webPath) : siteCollectionPath(p);
    const base = web === '/' ? '' : web;
    if (base && !p.toLowerCase().startsWith(base.toLowerCase() + '/')) return '';
    const rest = p.slice(base.length).split('/').filter(Boolean);
    if (!rest.length) return '';
    return base + '/' + rest[0];
  }

  /**
   * URL pour afficher un dossier.
   * mode "direct" : URL du dossier (SharePoint redirige vers la vue de la bibliothèque).
   * mode "allitems" : vue Forms/AllItems.aspx?id=..., plus explicite.
   * OneDrive personnel : toujours onedrive.aspx?id=...
   */
  function folderUrl(origin, path, opts) {
    const o = opts || {};
    const p = normalizePath(path);
    if (isPersonal(p)) {
      return origin + encodePath(siteCollectionPath(p)) + '/_layouts/15/onedrive.aspx?id=' + encodeURIComponent(p);
    }
    if (o.mode === 'allitems') {
      const lib = libraryRoot(p, o.webPath);
      if (lib) {
        return origin + encodePath(lib) + '/Forms/AllItems.aspx?id=' + encodeURIComponent(p);
      }
    }
    return origin + encodePath(p);
  }

  function fileUrl(origin, path) {
    return origin + encodePath(path);
  }

  const OFFICE_EXT = /^(doc|docx|docm|dot|dotx|dotm|rtf|odt|xls|xlsx|xlsm|xlsb|xlt|xltx|xltm|ods|ppt|pptx|pptm|pps|ppsx|ppsm|pot|potx|potm|odp|vsd|vsdx|vsdm|one)$/;

  /**
   * URL pour OUVRIR un fichier dans le navigateur (l'URL brute déclenche souvent un téléchargement).
   * - Office : URL du fichier + ?web=1 (Word, Excel, PowerPoint pour le web) ;
   * - autres formats : aperçu dans la bibliothèque (AllItems.aspx?id=fichier&parent=dossier) ;
   * - OneDrive personnel : onedrive.aspx?id=fichier&parent=dossier.
   */
  function fileOpenUrl(origin, path, opts) {
    const o = opts || {};
    const p = normalizePath(path);
    if (OFFICE_EXT.test(extension(p))) return fileUrl(origin, p) + '?web=1';
    const parent = parentPath(p);
    if (isPersonal(p)) {
      return origin + encodePath(siteCollectionPath(p)) + '/_layouts/15/onedrive.aspx?id=' + encodeURIComponent(p) + '&parent=' + encodeURIComponent(parent);
    }
    let lib = o.libraryRoot ? normalizePath(o.libraryRoot) : '';
    if (!lib || !p.toLowerCase().startsWith(lib.toLowerCase() + '/')) lib = libraryRoot(p, o.webPath);
    if (lib) {
      return origin + encodePath(lib) + '/Forms/AllItems.aspx?id=' + encodeURIComponent(p) + '&parent=' + encodeURIComponent(parent);
    }
    return fileUrl(origin, p) + '?web=1';
  }

  function siteUrl(origin, webPath) {
    const w = normalizePath(webPath || '/');
    return origin + (w === '/' ? '/' : encodePath(w));
  }

  function stripGuid(g) {
    return String(g || '').replace(/[{}]/g, '').toLowerCase();
  }

  function getParam(u, name) {
    // Recherche insensible à la casse (SharePoint mélange "RootFolder" et "rootfolder").
    for (const [k, v] of u.searchParams) {
      if (k.toLowerCase() === name.toLowerCase()) return v;
    }
    return null;
  }

  /**
   * Analyse une URL SharePoint.
   * Renvoie null si ce n'est pas une URL SharePoint, sinon un objet :
   * { origin, kind: 'file'|'folder'|'page'|'site'|'list'|'unknown', path?, parent?, uniqueId?,
   *   fileName?, webPath?, sharing?: true, needsResolve?: true }
   */
  function parse(href, base) {
    let u;
    try {
      u = new URL(href, base || undefined);
    } catch (e) {
      return null;
    }
    if (!/^https?:$/.test(u.protocol) || !isSharePointHost(u.hostname)) return null;
    const origin = u.origin;
    const rawPath = safeDecode(u.pathname);
    const lowerPath = rawPath.toLowerCase();

    // 1. Liens de partage : /:w:/r/sites/X/... (chemin en clair) ou /:w:/s/X/Ejk... (jeton)
    const sm = SHARING_RE.exec(rawPath);
    if (sm) {
      const letter = sm[1].toLowerCase();
      const mode = sm[2].toLowerCase();
      const kind = letter === FOLDER_LETTER ? 'folder' : 'file';
      if (mode === 'r') {
        const path = normalizePath('/' + sm[3]);
        return { origin, kind, path, webPath: siteCollectionPath(path), sharing: true };
      }
      return { origin, kind, sharing: true, needsResolve: true, href: u.href };
    }

    // 2. Documents Office ouverts via Doc.aspx / WopiFrame / viewer : ?sourcedoc={GUID}
    const sourcedoc = getParam(u, 'sourcedoc');
    if (sourcedoc && /\/_layouts\/15\//i.test(rawPath)) {
      const webPath = normalizePath(rawPath.slice(0, lowerPath.indexOf('/_layouts/15/')) || '/');
      const file = getParam(u, 'file');
      return {
        origin,
        kind: 'file',
        uniqueId: stripGuid(sourcedoc),
        fileName: file || undefined,
        webPath,
        needsResolve: true,
      };
    }

    // 3. Vues de bibliothèque / OneDrive : ?id=<chemin>[&parent=<dossier>]
    const id = getParam(u, 'id');
    if (id && id.startsWith('/') && (/\.aspx$/i.test(rawPath) || /\/forms\//i.test(lowerPath))) {
      const path = normalizePath(id);
      const parent = getParam(u, 'parent');
      if (parent && normalizePath(parent) !== path) {
        return { origin, kind: 'file', path, parent: normalizePath(parent), webPath: siteCollectionPath(path) };
      }
      return { origin, kind: 'folder', path, webPath: siteCollectionPath(path) };
    }

    // 4. Ancien format : ?RootFolder=<chemin>
    const rootFolder = getParam(u, 'RootFolder');
    if (rootFolder && rootFolder.startsWith('/')) {
      const path = normalizePath(rootFolder);
      return { origin, kind: 'folder', path, webPath: siteCollectionPath(path) };
    }

    // 5. Vue racine d'une bibliothèque : /Lib/Forms/AllItems.aspx
    const fm = /^(.*)\/forms\/[^/]+\.aspx$/i.exec(rawPath);
    if (fm) {
      const path = normalizePath(fm[1]);
      return { origin, kind: 'folder', path, webPath: siteCollectionPath(path) };
    }

    // 6. Listes : /Lists/X/AllItems.aspx
    if (/\/lists\/[^/]+\/[^/]+\.aspx$/i.test(rawPath)) {
      return { origin, kind: 'list', path: normalizePath(rawPath.replace(/\/[^/]+\.aspx$/i, '')) };
    }

    // 7. Pages système et pages de site
    if (/\/_layouts\//i.test(rawPath) || /\/_api\//i.test(rawPath) || /\/_vti_bin\//i.test(rawPath)) {
      return { origin, kind: 'page', path: normalizePath(rawPath) };
    }
    if (/\.aspx$/i.test(rawPath)) {
      return { origin, kind: 'page', path: normalizePath(rawPath) };
    }

    const path = normalizePath(rawPath);
    // 8. Fichier : dernier segment avec une extension
    if (extension(path)) {
      return { origin, kind: 'file', path, webPath: siteCollectionPath(path) };
    }

    // 9. Racine de site ou dossier
    const sc = siteCollectionPath(path);
    if (path === '/' || normalizePath(sc) === path) {
      return { origin, kind: 'site', path, webPath: sc || '/' };
    }
    const depth = path.slice(sc.length).split('/').filter(Boolean).length;
    return { origin, kind: 'folder', path, webPath: sc || '/', maybeWeb: depth === 1 };
  }

  /**
   * Découpe un chemin en segments cliquables pour un fil d'Ariane.
   * Le premier segment est le site (web), les suivants la bibliothèque et les dossiers.
   */
  function segments(path, webPath, webTitle) {
    const p = normalizePath(path);
    let web = webPath != null ? normalizePath(webPath) : siteCollectionPath(p) || '/';
    if (web !== '/' && !p.toLowerCase().startsWith(web.toLowerCase())) web = siteCollectionPath(p) || '/';
    const out = [];
    const base = web === '/' ? '' : web;
    out.push({ label: webTitle || basename(web) || 'Racine', path: web, kind: 'site' });
    const rest = p.slice(base.length).split('/').filter(Boolean);
    let acc = base;
    rest.forEach((seg, i) => {
      acc += '/' + seg;
      out.push({ label: seg, path: acc, kind: i === rest.length - 1 ? 'leaf' : 'folder' });
    });
    return out;
  }

  /** Clé de comparaison pour rapprocher deux URL désignant le même élément. */
  function compareKey(href, base) {
    const r = parse(href, base);
    if (!r) return '';
    if (r.uniqueId) return 'id:' + r.uniqueId;
    if (r.path) return (r.origin + r.path).toLowerCase();
    return '';
  }

  /** Clé de site, utilisée pour les exclusions par site (mode sombre). */
  function siteKey(href) {
    try {
      const u = new URL(href);
      return (u.hostname + siteCollectionPath(safeDecode(u.pathname))).toLowerCase();
    } catch (e) {
      return '';
    }
  }

  const api = {
    SITE_PREFIXES,
    isSharePointHost,
    isOneDriveHost,
    normalizePath,
    encodePath,
    basename,
    parentPath,
    extension,
    siteCollectionPath,
    libraryRoot,
    isPersonal,
    folderUrl,
    fileUrl,
    fileOpenUrl,
    siteUrl,
    stripGuid,
    parse,
    segments,
    compareKey,
    siteKey,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).url = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
