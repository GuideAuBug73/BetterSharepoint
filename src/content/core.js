/*
 * Socle commun des scripts de contenu : réglages, contexte de page, navigation SPA,
 * élément courant, utilitaires DOM, copie et ouverture d'URL.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  BSP.isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  BSP.log = (...a) => {
    if (BSP.debug) console.debug('[BetterSharePoint]', ...a);
  };

  // ---------- Réglages ----------
  BSP.settings = BSP.settingsLib.normalize({});
  const settingsListeners = [];
  BSP.onSettings = (cb) => settingsListeners.push(cb);
  BSP.feature = (name) => !!(BSP.settings.features && BSP.settings.features[name]);
  BSP.loadSettings = async () => {
    BSP.settings = await BSP.settingsLib.load();
    return BSP.settings;
  };
  BSP.settingsLib.onChange((s) => {
    BSP.settings = s;
    settingsListeners.forEach((cb) => {
      try {
        cb(s);
      } catch (e) {
        console.error(e);
      }
    });
  });

  // ---------- Contexte SharePoint publié par page-bridge.js ----------
  BSP.pageContext = () => {
    try {
      return JSON.parse(document.documentElement.getAttribute('data-bsp-ctx') || '{}');
    } catch (e) {
      return {};
    }
  };

  /** Chemin du web le plus probable pour un chemin donné. */
  BSP.webPathFor = (path) => {
    const ctx = BSP.pageContext();
    const p = U.normalizePath(path);
    const w = ctx.webServerRelativeUrl ? U.normalizePath(ctx.webServerRelativeUrl) : '';
    if (w && w !== '/' && (p.toLowerCase() === w.toLowerCase() || p.toLowerCase().startsWith(w.toLowerCase() + '/'))) return w;
    return U.siteCollectionPath(p) || '/';
  };

  BSP.folderUrl = (path, origin) =>
    U.folderUrl(origin || location.origin, path, { mode: BSP.settings.folderOpenMode, webPath: BSP.webPathFor(path) });

  BSP.urlFor = (item) => {
    if (!item || !item.path) return item && item.url;
    if (item.kind === 'folder') return BSP.folderUrl(item.path, item.origin);
    if (item.kind === 'site') return U.siteUrl(item.origin || location.origin, item.path);
    const ctx = BSP.pageContext();
    return U.fileOpenUrl(item.origin || location.origin, item.path, {
      libraryRoot: ctx.listUrl || '',
      webPath: BSP.webPathFor(item.path),
    });
  };

  // ---------- Navigation SPA ----------
  const navListeners = [];
  let lastHref = location.href;
  BSP.onNavigate = (cb) => navListeners.push(cb);
  function checkNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    BSP._current = null;
    navListeners.forEach((cb) => {
      try {
        cb(location.href);
      } catch (e) {
        console.error(e);
      }
    });
  }
  window.addEventListener('bsp:locationchange', () => setTimeout(checkNav, 0));
  window.addEventListener('popstate', () => setTimeout(checkNav, 0));
  window.addEventListener('hashchange', () => setTimeout(checkNav, 0));
  setInterval(checkNav, 1000);

  // ---------- Élément courant ----------
  /**
   * Décrit ce qui est affiché : { kind, path, origin, url, title, webPath, parent? }.
   * Pour les documents Office (Doc.aspx?sourcedoc=), le chemin est résolu par l'API REST.
   */
  BSP.current = async () => {
    if (BSP._current && BSP._current.href === location.href) return BSP._current.value;
    const href = location.href;
    const r = U.parse(href);
    let value = null;
    if (r) {
      value = Object.assign({}, r);
      if (r.needsResolve && r.uniqueId) {
        try {
          const f = await BSP.api.fileById(r.webPath, r.uniqueId);
          if (f && f.ServerRelativeUrl) {
            value.path = U.normalizePath(f.ServerRelativeUrl);
            value.needsResolve = false;
          }
        } catch (e) {
          BSP.log('fileById', e);
        }
      }
      if (value.path) {
        value.webPath = BSP.webPathFor(value.path);
        value.title = value.kind === 'site' ? BSP.pageContext().webTitle || U.basename(value.path) : U.basename(value.path);
        value.url = BSP.urlFor(value);
      }
    }
    BSP._current = { href, value };
    return value;
  };

  /** Libellé du site pour l'affichage. */
  BSP.siteLabel = (path) => {
    const ctx = BSP.pageContext();
    const web = BSP.webPathFor(path);
    if (ctx.webTitle && ctx.webServerRelativeUrl && U.normalizePath(ctx.webServerRelativeUrl) === web) return ctx.webTitle;
    if (/^\/personal\//i.test(web)) return 'OneDrive';
    return U.basename(web) || location.hostname.split('.')[0];
  };

  /** Élément favori/récent à partir d'une description d'élément. */
  BSP.toItem = (x) => ({
    title: x.title || U.basename(x.path),
    url: x.url || BSP.urlFor(x),
    path: x.path,
    origin: x.origin || location.origin,
    kind: x.kind,
    site: x.site || BSP.siteLabel(x.path),
  });

  // ---------- Utilitaires DOM ----------
  BSP.el = (tag, attrs, children) => {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v; // uniquement pour des icônes SVG statiques
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  };

  BSP.debounce = (fn, ms) => {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  BSP.formatDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  BSP.formatSize = (n) => {
    if (n == null || isNaN(n)) return '';
    const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let x = Number(n);
    while (x >= 1024 && i < u.length - 1) {
      x /= 1024;
      i++;
    }
    return (i === 0 ? x : x.toFixed(x < 10 ? 1 : 0)).toString().replace('.', ',') + ' ' + u[i];
  };

  // ---------- Copie ----------
  BSP.copy = async (text, html) => {
    try {
      if (html && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
        return true;
      }
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  BSP.escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Ouverture ----------
  /** newTab : true pour un nouvel onglet ; background : true pour ne pas l'activer. */
  BSP.open = (url, opts) => {
    const o = opts || {};
    if (!url) return;
    if (o.newTab) {
      try {
        chrome.runtime.sendMessage({ type: 'openTab', url, active: !o.background });
        return;
      } catch (e) {
        window.open(url, '_blank', 'noopener');
        return;
      }
    }
    location.assign(url);
  };

  /** Interprète un clic : Ctrl/Cmd/clic du milieu = nouvel onglet en arrière-plan, Maj = nouvel onglet actif. */
  BSP.openFromEvent = (url, ev) => {
    const mod = ev && (ev.ctrlKey || ev.metaKey || ev.button === 1);
    const shift = ev && ev.shiftKey;
    BSP.open(url, { newTab: mod || shift || BSP.settings.alwaysNewTab, background: mod && !shift });
  };

  // ---------- Icônes (SVG statiques, chemins Fluent simplifiés) ----------
  const svg = (d, vb) => `<svg viewBox="${vb || '0 0 20 20'}" aria-hidden="true"><path d="${d}"/></svg>`;
  BSP.icons = {
    folderUp: svg('M2 5.5A2.5 2.5 0 0 1 4.5 3h3.09c.4 0 .78.16 1.06.44L10.2 5H15.5A2.5 2.5 0 0 1 18 7.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 14.5v-9Zm8.35 3.15a.5.5 0 0 0-.7 0l-2.5 2.5a.5.5 0 0 0 .7.7L9.5 10.21V14a.5.5 0 0 0 1 0v-3.8l1.65 1.65a.5.5 0 0 0 .7-.7l-2.5-2.5Z'),
    folder: svg('M2 5.5A2.5 2.5 0 0 1 4.5 3h3.09c.4 0 .78.16 1.06.44L10.2 5H15.5A2.5 2.5 0 0 1 18 7.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 14.5v-9ZM4.5 4A1.5 1.5 0 0 0 3 5.5V7h5.59l.85-.85L7.94 4.65A.5.5 0 0 0 7.59 4H4.5ZM3 8v6.5c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5h-5.3l-1.35 1.35a.5.5 0 0 1-.35.15H3Z'),
    file: svg('M6 2a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7.41c0-.4-.16-.78-.44-1.06l-3.91-3.91A1.5 1.5 0 0 0 10.59 2H6Zm-1 2a1 1 0 0 1 1-1h4v3.5c0 .83.67 1.5 1.5 1.5H15v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Zm9.8 3h-3.3a.5.5 0 0 1-.5-.5V3.2L14.8 7Z'),
    star: svg('M9.1 2.9a1 1 0 0 1 1.8 0l1.93 3.91 4.31.63a1 1 0 0 1 .56 1.7l-3.12 3.05.73 4.3a1 1 0 0 1-1.45 1.05L10 15.51l-3.86 2.03a1 1 0 0 1-1.45-1.05l.74-4.3L2.3 9.14a1 1 0 0 1 .56-1.7l4.31-.63L9.1 2.9Zm.9.44L8.07 7.25a1 1 0 0 1-.75.55l-4.32.62 3.13 3.05a1 1 0 0 1 .29.88l-.74 4.3 3.86-2.03a1 1 0 0 1 .93 0l3.86 2.03-.74-4.3a1 1 0 0 1 .29-.88l3.13-3.05-4.32-.62a1 1 0 0 1-.75-.55L10 3.35Z'),
    starFilled: svg('M9.1 2.9a1 1 0 0 1 1.8 0l1.93 3.91 4.31.63a1 1 0 0 1 .56 1.7l-3.12 3.05.73 4.3a1 1 0 0 1-1.45 1.05L10 15.51l-3.86 2.03a1 1 0 0 1-1.45-1.05l.74-4.3L2.3 9.14a1 1 0 0 1 .56-1.7l4.31-.63L9.1 2.9Z'),
    copy: svg('M8 2a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8ZM7 4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4ZM4 6a2 2 0 0 1 1-1.73V14.5A2.5 2.5 0 0 0 7.5 17h6.23A2 2 0 0 1 12 18H7.5A3.5 3.5 0 0 1 4 14.5V6Z'),
    link: svg('M8 6a.5.5 0 0 1 .09 1H6a3 3 0 0 0-.2 6H8a.5.5 0 0 1 .09 1H6a4 4 0 0 1-.22-8H8Zm6 0a4 4 0 0 1 .22 8H12a.5.5 0 0 1-.09-1H14a3 3 0 0 0 .2-6H12a.5.5 0 0 1-.09-1H14ZM7 9.5h6a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1Z'),
    history: svg('M10 3a7 7 0 1 1-6.93 8.02.5.5 0 0 1 .99-.15A6 6 0 1 0 5.6 5.9H7.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 1 0v1.6A6.98 6.98 0 0 1 10 3Zm-.5 3a.5.5 0 0 1 .5.5V10h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5Z'),
    site: svg('M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm2.4 9H7.6c.13 1.73.53 3.26 1.1 4.32.46.86.92 1.18 1.3 1.18.38 0 .84-.32 1.3-1.18.57-1.06.97-2.6 1.1-4.32ZM6.6 11H3.06a7 7 0 0 0 4.7 5.64A12.2 12.2 0 0 1 6.6 11Zm10.34 0H13.4a12.2 12.2 0 0 1-1.16 5.64A7 7 0 0 0 16.94 11ZM7.76 3.36A7 7 0 0 0 3.06 9H6.6c.12-2.2.56-4.2 1.16-5.64ZM10 3.5c-.38 0-.84.32-1.3 1.18-.57 1.06-.97 2.6-1.1 4.32h4.8c-.13-1.73-.53-3.26-1.1-4.32-.46-.86-.92-1.18-1.3-1.18Zm2.24-.14c.6 1.44 1.04 3.44 1.16 5.64h3.54a7 7 0 0 0-4.7-5.64Z'),
    clock: svg('M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-.5 2a.5.5 0 0 1 .5.41V10h2.5a.5.5 0 0 1 .09 1H9.5a.5.5 0 0 1-.5-.41V5.5c0-.28.22-.5.5-.5Z'),
    bolt: svg('M11.85 2.15A.5.5 0 0 1 12 2.6L11.1 8H15.5a.5.5 0 0 1 .38.82l-7 8.5a.5.5 0 0 1-.87-.43L8.9 11H4.5a.5.5 0 0 1-.38-.82l7-8.5a.5.5 0 0 1 .73-.03Z'),
    search: svg('M8.5 3a5.5 5.5 0 0 1 4.23 9.02l4.12 4.13a.5.5 0 0 1-.63.76l-.07-.06-4.13-4.12A5.5 5.5 0 1 1 8.5 3Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z'),
    close: svg('M4.09 4.22l.06-.07a.5.5 0 0 1 .63-.06l.07.06L10 9.29l5.15-5.14a.5.5 0 0 1 .63-.06l.07.06c.18.17.2.44.06.63l-.06.07L10.71 10l5.14 5.15c.18.17.2.44.06.63l-.06.07a.5.5 0 0 1-.63.06l-.07-.06L10 10.71l-5.15 5.14a.5.5 0 0 1-.63.06l-.07-.06a.5.5 0 0 1-.06-.63l.06-.07L9.29 10 4.15 4.85a.5.5 0 0 1-.06-.63l.06-.07-.06.07Z'),
    chevron: svg('M7.65 4.15c.2-.2.5-.2.7 0l5.49 5.46c.21.22.21.57 0 .78l-5.49 5.46a.5.5 0 0 1-.7-.7L12.8 10 7.65 4.85a.5.5 0 0 1 0-.7Z'),
    newTab: svg('M6 4a2 2 0 0 0-2 2v8c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2v-2.5a.5.5 0 0 0-1 0V14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5a.5.5 0 0 0 0-1H6Zm5.5 0a.5.5 0 0 0 0 1h2.8l-4.65 4.65a.5.5 0 0 0 .7.7L15 5.71V8.5a.5.5 0 0 0 1 0v-4a.5.5 0 0 0-.5-.5h-4Z'),
  };
})(globalThis);
