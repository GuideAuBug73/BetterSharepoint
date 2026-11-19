/*
 * Raccourcis clavier : lecture, comparaison avec un événement, affichage. Module pur.
 * Format : "mod+k", "shift+c", "/", "?", "alt+p". "mod" = Ctrl (Cmd sur macOS).
 */
(function (root) {
  'use strict';

  function parse(binding) {
    const parts = String(binding || '')
      .toLowerCase()
      .split('+')
      .map((s) => s.trim());
    // "mod++" ou "+" : la touche est le signe plus.
    let key = parts.pop();
    if (key === '' && parts.length && parts[parts.length - 1] === '') {
      parts.pop();
      key = '+';
    }
    const b = { key, ctrl: false, alt: false, shift: false, meta: false, mod: false };
    for (const p of parts) {
      if (p === 'ctrl' || p === 'control') b.ctrl = true;
      else if (p === 'alt' || p === 'option') b.alt = true;
      else if (p === 'shift') b.shift = true;
      else if (p === 'meta' || p === 'cmd' || p === 'command') b.meta = true;
      else if (p === 'mod') b.mod = true;
    }
    if (key === 'space') b.key = ' ';
    if (key === 'esc') b.key = 'escape';
    return b;
  }

  function isLetter(k) {
    return /^[a-z]$/.test(k);
  }

  /** Vrai si l'événement clavier correspond au raccourci. */
  function matches(ev, binding, isMac) {
    const b = typeof binding === 'string' ? parse(binding) : binding;
    if (!b || !b.key) return false;
    const wantCtrl = b.ctrl || (b.mod && !isMac);
    const wantMeta = b.meta || (b.mod && !!isMac);
    if (!!ev.ctrlKey !== wantCtrl) return false;
    if (!!ev.metaKey !== wantMeta) return false;
    if (!!ev.altKey !== b.alt) return false;
    const key = String(ev.key || '').toLowerCase();
    if (isLetter(b.key) || b.key.length > 1) {
      if (!!ev.shiftKey !== b.shift) return false;
      if (key === b.key) return true;
      // Clavier non QWERTY ou modificateurs : se rabattre sur le code physique.
      if (isLetter(b.key) && ev.code === 'Key' + b.key.toUpperCase() && (ev.ctrlKey || ev.metaKey || ev.altKey)) return true;
      return false;
    }
    // Caractère imprimable non alphabétique ("/", "?") : Maj dépend de la disposition du clavier.
    if (b.shift && !ev.shiftKey) return false;
    return key === b.key;
  }

  function format(binding, isMac) {
    const b = typeof binding === 'string' ? parse(binding) : binding;
    if (!b || !b.key) return '';
    const parts = [];
    if (b.mod) parts.push(isMac ? '⌘' : 'Ctrl');
    if (b.ctrl) parts.push('Ctrl');
    if (b.meta) parts.push(isMac ? '⌘' : 'Meta');
    if (b.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (b.shift) parts.push(isMac ? '⇧' : 'Maj');
    const names = { ' ': 'Espace', escape: 'Échap', enter: 'Entrée', arrowup: '↑', arrowdown: '↓' };
    parts.push(names[b.key] || (b.key.length === 1 ? b.key.toUpperCase() : b.key));
    return parts.join('+');
  }

  /** Construit une chaîne de raccourci à partir d'un événement (pour l'éditeur des options). */
  function fromEvent(ev, isMac) {
    const key = String(ev.key || '').toLowerCase();
    if (['control', 'shift', 'alt', 'meta', 'os'].includes(key)) return '';
    const parts = [];
    const mod = isMac ? ev.metaKey : ev.ctrlKey;
    if (mod) parts.push('mod');
    if (!isMac && ev.metaKey) parts.push('meta');
    if (isMac && ev.ctrlKey) parts.push('ctrl');
    if (ev.altKey) parts.push('alt');
    const printableNonLetter = key.length === 1 && !/^[a-z0-9]$/.test(key);
    if (ev.shiftKey && !printableNonLetter) parts.push('shift');
    parts.push(key === ' ' ? 'space' : key);
    return parts.join('+');
  }

  /** Vrai si l'événement vient d'un champ de saisie (on n'y intercepte que les raccourcis avec modificateur). */
  function isTypingTarget(el) {
    let e = el;
    // Traverser les racines fantômes.
    while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement;
    if (!e || !e.tagName) return false;
    const tag = e.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      const t = (e.getAttribute('type') || 'text').toLowerCase();
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t);
    }
    if (e.isContentEditable) return true;
    const role = e.getAttribute && e.getAttribute('role');
    return role === 'textbox' || role === 'combobox' || role === 'searchbox';
  }

  const api = { parse, matches, format, fromEvent, isTypingTarget };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).keys = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
