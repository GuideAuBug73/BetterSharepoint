/*
 * Construction des requêtes et lecture des réponses de l'API de recherche SharePoint
 * (/_api/search/query). Module pur.
 */
(function (root) {
  'use strict';

  const SELECT = [
    'Title',
    'Path',
    'ParentLink',
    'SPWebUrl',
    'SiteTitle',
    'LastModifiedTime',
    'Author',
    'EditorOWSUSER',
    'ModifiedBy',
    'FileExtension',
    'FileType',
    'IsDocument',
    'IsContainer',
    'UniqueId',
    'Size',
    'ContentClass',
  ];

  function escapeKql(q) {
    return String(q || '').replace(/'/g, "''");
  }

  function buildSearchUrl(origin, query, opts) {
    const o = opts || {};
    const params = [
      'querytext=' + encodeURIComponent("'" + escapeKql(query) + "'"),
      'selectproperties=' + encodeURIComponent("'" + (o.select || SELECT).join(',') + "'"),
      'rowlimit=' + (o.rowLimit || 50),
      'trimduplicates=false',
      'clienttype=' + encodeURIComponent("'ContentSearchRegular'"),
    ];
    if (o.startRow) params.push('startrow=' + o.startRow);
    return origin + '/_api/search/query?' + params.join('&');
  }

  function cellsOf(row) {
    if (!row) return [];
    const c = row.Cells;
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c.results)) return c.results;
    return [];
  }

  function rowsOf(json) {
    if (!json) return [];
    const q = json.d && json.d.query ? json.d.query : json;
    const t = q && q.PrimaryQueryResult && q.PrimaryQueryResult.RelevantResults && q.PrimaryQueryResult.RelevantResults.Table;
    if (!t || !t.Rows) return [];
    if (Array.isArray(t.Rows)) return t.Rows;
    if (Array.isArray(t.Rows.results)) return t.Rows.results;
    return [];
  }

  function bool(v) {
    return v === true || v === 'true' || v === 'True' || v === '1';
  }

  /** "jdoe@contoso.com | Jean Dupont | 693A... i:0#.f|membership|..." → "Jean Dupont" */
  function displayNameFromUserField(v) {
    if (!v) return '';
    const s = String(v);
    if (s.includes('|')) {
      const parts = s.split('|').map((x) => x.trim());
      if (parts.length >= 2 && parts[1]) return parts[1];
    }
    return s.split(';')[0].trim();
  }

  function parseSearchResponse(json) {
    return rowsOf(json)
      .map((row) => {
        const m = {};
        for (const c of cellsOf(row)) m[c.Key] = c.Value;
        const path = m.Path || '';
        if (!path) return null;
        const editor = displayNameFromUserField(m.EditorOWSUSER) || displayNameFromUserField(m.ModifiedBy);
        return {
          title: m.Title || '',
          path,
          parentLink: m.ParentLink || '',
          webUrl: m.SPWebUrl || '',
          siteTitle: m.SiteTitle || '',
          modified: m.LastModifiedTime || '',
          author: displayNameFromUserField(m.Author),
          editor,
          ext: String(m.FileExtension || m.FileType || '').toLowerCase(),
          isDocument: bool(m.IsDocument),
          isContainer: bool(m.IsContainer),
          uniqueId: String(m.UniqueId || '').replace(/[{}]/g, '').toLowerCase(),
          size: m.Size != null && m.Size !== '' ? Number(m.Size) : null,
          contentClass: m.ContentClass || '',
        };
      })
      .filter(Boolean);
  }

  /** Total estimé de résultats, si fourni. */
  function totalRows(json) {
    const q = json && json.d && json.d.query ? json.d.query : json;
    const t = q && q.PrimaryQueryResult && q.PrimaryQueryResult.RelevantResults;
    return t ? Number(t.TotalRows || t.RowCount || 0) : 0;
  }

  /** Regroupe les résultats portant le même nom de fichier. */
  function duplicatesByName(results) {
    const map = new Map();
    for (const r of results) {
      if (!r.isDocument) continue;
      const name = (r.path.split('/').pop() || '').toLowerCase();
      if (!name) continue;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(r);
    }
    for (const [k, v] of map) if (v.length < 2) map.delete(k);
    return map;
  }

  const api = { SELECT, escapeKql, buildSearchUrl, parseSearchResponse, totalRows, duplicatesByName, displayNameFromUserField };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.BSP = root.BSP || {}).searchParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
