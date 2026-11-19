/*
 * Appels à l'API REST SharePoint avec la session de l'utilisateur (cookies, même origine).
 * Lecture seule : l'extension ne modifie aucun contenu SharePoint.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  const ACCEPT = 'application/json;odata=nometadata';
  const cache = new Map();

  async function get(url, opts) {
    const o = opts || {};
    if (o.cache && cache.has(url)) return cache.get(url);
    const p = fetch(url, {
      credentials: 'include',
      headers: { Accept: o.accept || ACCEPT },
      signal: o.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status + ' ' + url);
        err.status = res.status;
        throw err;
      }
      if (o.text) return res.text();
      return res.json();
    });
    if (o.cache) {
      cache.set(url, p);
      p.catch(() => cache.delete(url));
    }
    return p;
  }

  function q(s) {
    return encodeURIComponent("'" + String(s).replace(/'/g, "''") + "'");
  }

  function base(webPath, origin) {
    const w = U.normalizePath(webPath || '/');
    return (origin || location.origin) + (w === '/' ? '' : U.encodePath(w));
  }

  const FILE_SELECT = 'Name,ServerRelativeUrl,Length,TimeLastModified,TimeCreated,UIVersionLabel,UniqueId,CheckOutType';

  const api = {
    get,

    fileById(webPath, guid, origin) {
      return get(base(webPath, origin) + "/_api/web/GetFileById('" + U.stripGuid(guid) + "')?$select=" + FILE_SELECT, {
        cache: true,
      });
    },

    fileInfo(path, opts) {
      const o = opts || {};
      const web = o.webPath || BSP.webPathFor(path);
      return get(
        base(web, o.origin) +
          '/_api/web/GetFileByServerRelativePath(decodedurl=@p)?@p=' +
          q(U.normalizePath(path)) +
          '&$select=' +
          FILE_SELECT +
          ',ModifiedBy/Title,Author/Title&$expand=ModifiedBy,Author',
        { cache: o.cache !== false }
      );
    },

    folderInfo(path, opts) {
      const o = opts || {};
      const web = o.webPath || BSP.webPathFor(path);
      return get(
        base(web, o.origin) +
          '/_api/web/GetFolderByServerRelativePath(decodedurl=@p)?@p=' +
          q(U.normalizePath(path)) +
          '&$select=Name,ServerRelativeUrl,ItemCount,TimeLastModified,UniqueId',
        { cache: true }
      );
    },

    versions(path, opts) {
      const o = opts || {};
      const web = o.webPath || BSP.webPathFor(path);
      return get(
        base(web, o.origin) +
          '/_api/web/GetFileByServerRelativePath(decodedurl=@p)/Versions?@p=' +
          q(U.normalizePath(path)) +
          '&$expand=CreatedBy&$select=ID,VersionLabel,Created,Size,Url,IsCurrentVersion,CheckInComment,CreatedBy/Title',
        {}
      ).then((r) => r.value || (r.d && r.d.results) || []);
    },

    /** Élément de liste par identifiant : chemin réel d'une ligne de bibliothèque. */
    listItem(webPath, listId, id, origin) {
      return get(
        base(webPath, origin) +
          "/_api/web/lists(guid'" +
          U.stripGuid(listId) +
          "')/items(" +
          Number(id) +
          ')?$select=FileRef,FileLeafRef,FSObjType',
        { cache: true }
      );
    },

    /** Contenu texte d'un fichier (version courante ou URL de version _vti_history). */
    text(absUrl) {
      return get(absUrl, { text: true, accept: '*/*' });
    },

    /** URL de vignette (getpreview.ashx) pour un fichier. */
    thumbnailUrl(path, opts) {
      const o = opts || {};
      const web = o.webPath || BSP.webPathFor(path);
      const abs = (o.origin || location.origin) + U.encodePath(path);
      return base(web, o.origin) + '/_layouts/15/getpreview.ashx?path=' + encodeURIComponent(abs) + '&resolution=1';
    },

    async search(query, opts) {
      const o = opts || {};
      const url = BSP.searchParse.buildSearchUrl(o.origin || location.origin, query, { rowLimit: o.rowLimit || 30 });
      const json = await get(url, { cache: o.cache !== false, signal: o.signal });
      return BSP.searchParse.parseSearchResponse(json);
    },

    /** Sites suivis par l'utilisateur. Mis en cache une heure dans storage.local. */
    async followedSites() {
      const KEY = 'followedSites:' + location.hostname.replace(/-my(?=\.)/, '');
      try {
        const c = await chrome.storage.local.get(KEY);
        if (c[KEY] && Date.now() - c[KEY].at < 3600 * 1000) return c[KEY].sites;
      } catch (e) {
        /* ignore */
      }
      const root = location.origin.replace(/-my\.sharepoint/, '.sharepoint');
      let sites = [];
      try {
        const r = await get(root + '/_api/social.following/my/followed(types=4)');
        const list = r.value || (r.d && r.d.Followed && r.d.Followed.results) || [];
        sites = list
          .map((a) => ({ title: a.Name || a.Title, url: a.Uri || a.ContentUri || a.Url }))
          .filter((s) => s.title && s.url);
      } catch (e) {
        BSP.log('followedSites', e);
      }
      try {
        await chrome.storage.local.set({ [KEY]: { at: Date.now(), sites } });
      } catch (e) {
        /* ignore */
      }
      return sites;
    },

    /** Résout un lien de partage à jeton (/:w:/s/...) via l'API v2.0 de SharePoint. */
    async resolveSharing(href) {
      const b64 = btoa(unescape(encodeURIComponent(href))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
      const u = new URL(href);
      const r = await get(u.origin + '/_api/v2.0/shares/u!' + b64 + '/driveItem?$select=webUrl,name,folder,file', { cache: true });
      const parsed = r.webUrl ? U.parse(r.webUrl) : null;
      if (parsed && parsed.path) return { path: parsed.path, kind: r.folder ? 'folder' : 'file', origin: parsed.origin };
      return null;
    },

    /** Trouve le chemin d'un élément décrit par U.parse(). */
    async resolve(info) {
      if (!info) return null;
      if (info.path) return info;
      if (info.uniqueId) {
        const f = await api.fileById(info.webPath, info.uniqueId, info.origin);
        if (f && f.ServerRelativeUrl) return Object.assign({}, info, { path: U.normalizePath(f.ServerRelativeUrl), needsResolve: false });
      }
      if (info.sharing && info.href) {
        const r = await api.resolveSharing(info.href);
        if (r) return Object.assign({}, info, r, { needsResolve: false });
      }
      return null;
    },
  };

  BSP.api = api;
})(globalThis);
