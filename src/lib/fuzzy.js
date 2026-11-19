/*
 * Correspondance approximative (sous-séquence) pour la palette de commandes. Module pur.
 */
(function (root) {
  'use strict';

  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  const SEP = /[\s/\\_\-.·›>]/;

  /**
   * Note `text` par rapport à `query`. Renvoie null si les lettres de la requête
   * n'apparaissent pas dans l'ordre, sinon { score, indices }.
   * Bonus : début de mot, lettres consécutives, préfixe. Les espaces de la requête séparent
   * des termes qui doivent tous apparaître (dans n'importe quel ordre).
   */
  function match(query, text) {
    const q = fold(query).trim();
    if (!q) return { score: 0, indices: [] };
    const t = fold(text);
    const terms = q.split(/\s+/).filter(Boolean);
    let total = 0;
    const all = new Set();
    for (const term of terms) {
      const r = matchTerm(term, t);
      if (!r) return null;
      total += r.score;
      r.indices.forEach((i) => all.add(i));
    }
    return { score: total, indices: Array.from(all).sort((a, b) => a - b) };
  }

  function matchTerm(term, t) {
    // Sous-chaîne exacte : meilleur cas.
    const sub = t.indexOf(term);
    if (sub >= 0) {
      const atWord = sub === 0 || SEP.test(t[sub - 1]);
      const indices = [];
      for (let i = 0; i < term.length; i++) indices.push(sub + i);
      return { score: 100 + term.length * 10 + (atWord ? 40 : 0) + (sub === 0 ? 30 : 0) - Math.min(sub, 30), indices };
    }
    // Sous-séquence gloutonne avec bonus.
    let score = 0;
    let ti = 0;
    let prev = -2;
    const indices = [];
    for (let qi = 0; qi < term.length; qi++) {
      const ch = term[qi];
      let found = -1;
      // Préférer un début de mot s'il en existe un plus loin.
      for (let j = ti; j < t.length; j++) {
        if (t[j] === ch) {
          if (found < 0) found = j;
          if (j === 0 || SEP.test(t[j - 1])) {
            found = j;
            break;
          }
          if (j === prev + 1) break;
        }
      }
      if (found < 0) return null;
      const atWord = found === 0 || SEP.test(t[found - 1]);
      score += 5 + (found === prev + 1 ? 15 : 0) + (atWord ? 20 : 0);
      indices.push(found);
      prev = found;
      ti = found + 1;
    }
    score -= Math.min(indices[0] || 0, 20);
    return { score, indices };
  }

  /** Filtre et trie des éléments. `keyFn` renvoie le texte à comparer. */
  function filter(query, items, keyFn) {
    const out = [];
    for (const item of items) {
      const m = match(query, keyFn(item));
      if (m) out.push({ item, score: m.score, indices: m.indices });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  const api = { fold, match, filter };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).fuzzy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
