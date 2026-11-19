/*
 * Différence ligne à ligne entre deux textes (plus longue sous-séquence commune). Module pur.
 */
(function (root) {
  'use strict';

  const MAX_CELLS = 4000000;

  function splitLines(s) {
    const t = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
    if (t === '') return [];
    const lines = t.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /**
   * Renvoie { ops: [{ type: 'eq'|'add'|'del', text, a?, b? }], tooBig, added, removed }.
   * `a` et `b` sont les numéros de ligne (1-based) dans l'ancien et le nouveau texte.
   */
  function diffLines(oldText, newText) {
    const A = splitLines(oldText);
    const B = splitLines(newText);
    let start = 0;
    while (start < A.length && start < B.length && A[start] === B[start]) start++;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
      endA--;
      endB--;
    }
    const n = endA - start;
    const m = endB - start;
    const ops = [];
    for (let i = 0; i < start; i++) ops.push({ type: 'eq', text: A[i], a: i + 1, b: i + 1 });

    if ((n + 1) * (m + 1) > MAX_CELLS) {
      return { ops: [], tooBig: true, added: 0, removed: 0 };
    }

    // Table LCS sur la partie centrale.
    const W = m + 1;
    const L = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * W + j] = A[start + i] === B[start + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    let added = 0;
    let removed = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[start + i] === B[start + j]) {
        ops.push({ type: 'eq', text: A[start + i], a: start + i + 1, b: start + j + 1 });
        i++;
        j++;
      } else if (j < m && (i === n || L[i * W + j + 1] >= L[(i + 1) * W + j])) {
        ops.push({ type: 'add', text: B[start + j], b: start + j + 1 });
        added++;
        j++;
      } else {
        ops.push({ type: 'del', text: A[start + i], a: start + i + 1 });
        removed++;
        i++;
      }
    }
    for (let k = 0; k < A.length - endA; k++) {
      ops.push({ type: 'eq', text: A[endA + k], a: endA + k + 1, b: endB + k + 1 });
    }
    return { ops, tooBig: false, added, removed };
  }

  /** Réduit les longues plages identiques à `context` lignes autour des changements. */
  function hunks(ops, context) {
    const c = context == null ? 3 : context;
    const keep = new Array(ops.length).fill(false);
    ops.forEach((op, idx) => {
      if (op.type !== 'eq') {
        for (let k = Math.max(0, idx - c); k <= Math.min(ops.length - 1, idx + c); k++) keep[k] = true;
      }
    });
    const out = [];
    let skipped = 0;
    ops.forEach((op, idx) => {
      if (keep[idx]) {
        if (skipped) out.push({ type: 'skip', count: skipped });
        skipped = 0;
        out.push(op);
      } else skipped++;
    });
    if (skipped) out.push({ type: 'skip', count: skipped });
    return out;
  }

  const TEXT_EXT = new Set([
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx',
    'py', 'sql', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'log', 'ps1', 'psm1', 'sh', 'bat', 'cmd', 'java', 'cs', 'c',
    'h', 'cpp', 'hpp', 'go', 'rs', 'rb', 'php', 'vb', 'svg', 'toml', 'properties', 'env', 'tex', 'rst', 'adoc',
  ]);

  function isTextExtension(ext) {
    return TEXT_EXT.has(String(ext || '').toLowerCase());
  }

  const api = { splitLines, diffLines, hunks, isTextExtension };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).diff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
