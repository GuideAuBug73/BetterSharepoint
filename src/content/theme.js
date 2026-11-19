/*
 * 10 · Mode compact et 14 · mode sombre.
 * Exécuté au plus tôt (document_start) pour limiter le flash blanc : on pose des classes
 * sur <html>, le CSS correspondant est dans styles/page.css.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const S = BSP.settingsLib;
  const html = document.documentElement;
  const HIDE_KEYS = ['siteHeader', 'appBar', 'comments', 'feedback', 'footer'];
  let current = null;
  let customStyle = null;

  function siteKey() {
    return BSP.url.siteKey(location.href);
  }

  function isDarkHere(s) {
    return !!s.dark.enabled && !(s.dark.excludedSites || []).includes(siteKey());
  }

  function apply(s) {
    current = s;
    html.classList.toggle('bsp-dark', isDarkHere(s));
    html.classList.toggle('bsp-compact', !!s.compact.enabled);
    for (const k of HIDE_KEYS) {
      html.classList.toggle('bsp-hide-' + k, !!s.compact.enabled && !!s.compact.hide[k]);
    }
    const css = buildCustomCss(s.compact.enabled ? s.compact.customSelectors : '');
    if (css) {
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.id = 'bsp-custom-hide';
      }
      customStyle.textContent = css;
      if (!customStyle.isConnected) (document.head || html).appendChild(customStyle);
    } else if (customStyle) {
      customStyle.remove();
    }
    window.dispatchEvent(new CustomEvent('bsp:theme'));
  }

  /** Une ligne = un sélecteur CSS à masquer. Les lignes invalides sont ignorées. */
  function buildCustomCss(text) {
    const out = [];
    for (const raw of String(text || '').split('\n')) {
      const sel = raw.trim();
      if (!sel || sel.startsWith('#!') || sel.startsWith('//')) continue;
      if (/[{}]/.test(sel)) continue;
      try {
        document.createDocumentFragment().querySelector(sel);
        out.push(sel + '{display:none !important}');
      } catch (e) {
        /* sélecteur invalide */
      }
    }
    return out.join('\n');
  }

  async function toggleDark() {
    const s = await S.load();
    s.dark.enabled = !isDarkHere(s);
    if (s.dark.enabled) s.dark.excludedSites = (s.dark.excludedSites || []).filter((k) => k !== siteKey());
    await S.save(s);
    return s.dark.enabled;
  }

  async function toggleCompact() {
    const s = await S.update('compact.enabled', (v) => !v);
    return s.compact.enabled;
  }

  async function excludeSite(excluded) {
    const s = await S.load();
    const k = siteKey();
    const set = new Set(s.dark.excludedSites || []);
    if (excluded) set.add(k);
    else set.delete(k);
    s.dark.excludedSites = Array.from(set);
    await S.save(s);
  }

  BSP.theme = {
    toggleDark,
    toggleCompact,
    excludeSite,
    isDark: () => html.classList.contains('bsp-dark'),
    buildCustomCss,
    current: () => current,
  };

  S.load().then(apply);
  S.onChange(apply);
  // <head> n'existe pas encore à document_start : réinsérer le style personnalisé plus tard.
  document.addEventListener('DOMContentLoaded', () => current && apply(current));
})(globalThis);
