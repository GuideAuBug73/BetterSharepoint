/*
 * Hôte d'interface isolé (Shadow DOM) pour la palette, les panneaux, la barre de chemin,
 * l'aperçu au survol et les notifications. Les styles de SharePoint ne s'y appliquent pas.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const el = (...a) => BSP.el(...a);

  let host = null;
  let root = null;
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  function ensure() {
    if (root) return root;
    host = document.createElement('div');
    host.id = 'bsp-ui-host';
    host.setAttribute('data-bsp', '');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
    root = host.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/styles/ui.css');
    link.addEventListener('load', () => readyResolve());
    link.addEventListener('error', () => readyResolve());
    root.appendChild(link);
    (document.body || document.documentElement).appendChild(host);
    syncTheme();
    window.addEventListener('bsp:theme', syncTheme);
    // SharePoint remplace parfois le body : réattacher l'hôte si besoin.
    setInterval(() => {
      if (host && !host.isConnected) (document.body || document.documentElement).appendChild(host);
    }, 2000);
    return root;
  }

  function syncTheme() {
    if (host) host.classList.toggle('dark', document.documentElement.classList.contains('bsp-dark'));
  }

  let toastTimer;
  function toast(message, kind) {
    const r = ensure();
    let t = r.querySelector('.toast');
    if (!t) {
      t = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      r.appendChild(t);
    }
    t.textContent = message;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function iconButton(icon, label, onClick, extra) {
    const b = el('button', Object.assign({ class: 'ibtn', type: 'button', title: label, 'aria-label': label, html: icon }, extra || {}));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /**
   * Panneau latéral générique. Renvoie { panel, body, close }.
   * Un seul panneau à la fois.
   */
  function panel(title, opts) {
    const o = opts || {};
    const r = ensure();
    const prev = r.querySelector('.panel-wrap');
    if (prev) prev.remove();
    const body = el('div', { class: 'panel-body' });
    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      if (o.onClose) o.onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const header = el('div', { class: 'panel-head' }, [
      el('div', { class: 'panel-title' }, [el('span', { text: title }), o.subtitle ? el('small', { text: o.subtitle }) : null]),
      iconButton(BSP.icons.close, 'Fermer (Échap)', close),
    ]);
    const p = el('div', { class: 'panel' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title }, [header, body]);
    const wrap = el('div', { class: 'panel-wrap' }, [el('div', { class: 'scrim', onclick: close }), p]);
    r.appendChild(wrap);
    document.addEventListener('keydown', onKey, true);
    return { panel: p, body, close, header };
  }

  /** Met en évidence les lettres trouvées par la recherche approximative. */
  function highlight(text, indices) {
    const frag = document.createDocumentFragment();
    const set = new Set(indices || []);
    let buf = '';
    let inMark = false;
    const flush = () => {
      if (!buf) return;
      frag.appendChild(inMark ? el('mark', { text: buf }) : document.createTextNode(buf));
      buf = '';
    };
    for (let i = 0; i < text.length; i++) {
      const m = set.has(i);
      if (m !== inMark) {
        flush();
        inMark = m;
      }
      buf += text[i];
    }
    flush();
    return frag;
  }

  BSP.ui = { ensure, ready, toast, iconButton, panel, highlight, root: () => ensure(), host: () => host };
})(globalThis);
