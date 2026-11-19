const test = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../../src/lib/search-parse.js');
const F = require('../../src/lib/fuzzy.js');
const D = require('../../src/lib/diff.js');
const K = require('../../src/lib/keys.js');
const S = require('../../src/lib/settings.js');

test('buildSearchUrl échappe les apostrophes', () => {
  const u = SP.buildSearchUrl('https://c.sharepoint.com', "l'offre", { rowLimit: 10 });
  assert.match(u, /^https:\/\/c\.sharepoint\.com\/_api\/search\/query\?querytext=/);
  assert.ok(decodeURIComponent(u).includes("querytext='l''offre'"));
  assert.ok(u.includes('rowlimit=10'));
});

test('parseSearchResponse : formats nometadata et verbose', () => {
  const cells = [
    { Key: 'Title', Value: 'Budget' },
    { Key: 'Path', Value: 'https://c.sharepoint.com/sites/X/Docs/Budget.xlsx' },
    { Key: 'EditorOWSUSER', Value: 'm@c.com | Marie Curie | 693A i:0#.f|membership|m@c.com' },
    { Key: 'IsDocument', Value: 'true' },
    { Key: 'UniqueId', Value: '{AAAA-BB}' },
    { Key: 'Size', Value: '2048' },
  ];
  const nometa = { PrimaryQueryResult: { RelevantResults: { Table: { Rows: [{ Cells: cells }] } } } };
  const verbose = { d: { query: { PrimaryQueryResult: { RelevantResults: { Table: { Rows: { results: [{ Cells: { results: cells } }] } } } } } } };
  for (const json of [nometa, verbose]) {
    const [r] = SP.parseSearchResponse(json);
    assert.equal(r.title, 'Budget');
    assert.equal(r.editor, 'Marie Curie');
    assert.equal(r.isDocument, true);
    assert.equal(r.uniqueId, 'aaaa-bb');
    assert.equal(r.size, 2048);
  }
  assert.deepEqual(SP.parseSearchResponse({}), []);
});

test('duplicatesByName', () => {
  const rows = [
    { path: 'https://c/sites/A/a.docx', isDocument: true },
    { path: 'https://c/sites/B/A.docx', isDocument: true },
    { path: 'https://c/sites/B/b.docx', isDocument: true },
  ];
  const d = SP.duplicatesByName(rows);
  assert.equal(d.size, 1);
  assert.equal(d.get('a.docx').length, 2);
});

test('fuzzy : correspondance, accents, ordre', () => {
  assert.ok(F.match('compta', 'Comptabilité 2026'));
  assert.ok(F.match('cpt', 'Comptabilité'));
  assert.ok(F.match('equipe', 'Équipe projet'));
  assert.equal(F.match('xyz', 'Comptabilité'), null);
  assert.ok(F.match('projet budget', 'Budget du projet'));
  const sorted = F.filter('doc', ['Mes documents', 'Procédure doc', 'Dossier'], (x) => x).map((m) => m.item);
  assert.equal(sorted[0], 'Mes documents');
  assert.ok(!sorted.includes('Dossier') || sorted.indexOf('Dossier') > 0);
});

test('diffLines', () => {
  const d = D.diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
  assert.equal(d.added, 2);
  assert.equal(d.removed, 1);
  assert.deepEqual(
    d.ops.filter((o) => o.type !== 'eq').map((o) => o.type + ':' + o.text).sort(),
    ['add:B', 'add:e', 'del:b']
  );
  const same = D.diffLines('x\ny', 'x\r\ny\n');
  assert.equal(same.added + same.removed, 0);
  const h = D.hunks(D.diffLines(Array.from({ length: 50 }, (_, i) => 'l' + i).join('\n'), Array.from({ length: 50 }, (_, i) => (i === 25 ? 'X' : 'l' + i)).join('\n')).ops, 2);
  assert.equal(h.filter((o) => o.type === 'skip').length, 2);
  assert.ok(D.isTextExtension('MD'));
  assert.ok(!D.isTextExtension('docx'));
});

test('diffLines reconstruit les deux textes', () => {
  const a = 'un\ndeux\ntrois\nquatre\ncinq';
  const b = 'un\ntrois\nquatre bis\ncinq\nsix';
  const d = D.diffLines(a, b);
  assert.equal(d.ops.filter((o) => o.type !== 'add').map((o) => o.text).join('\n'), a);
  assert.equal(d.ops.filter((o) => o.type !== 'del').map((o) => o.text).join('\n'), b);
});

test('keys.matches', () => {
  const ev = (o) => Object.assign({ key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o);
  assert.ok(K.matches(ev({ key: 'k', ctrlKey: true }), 'mod+k', false));
  assert.ok(K.matches(ev({ key: 'k', metaKey: true }), 'mod+k', true));
  assert.ok(!K.matches(ev({ key: 'k', ctrlKey: true }), 'mod+k', true));
  assert.ok(K.matches(ev({ key: 'p' }), 'p'));
  assert.ok(!K.matches(ev({ key: 'P', shiftKey: true }), 'p'));
  assert.ok(K.matches(ev({ key: 'C', shiftKey: true }), 'shift+c'));
  assert.ok(K.matches(ev({ key: '?', shiftKey: true }), '?'));
  assert.ok(K.matches(ev({ key: '/' }), '/'));
  assert.ok(K.matches(ev({ key: 'q', code: 'KeyK', ctrlKey: true }), 'mod+k', false), 'repli sur le code physique');
  assert.equal(K.format('mod+shift+k', false), 'Ctrl+Maj+K');
  assert.equal(K.fromEvent(ev({ key: 'K', ctrlKey: true, shiftKey: true }), false), 'mod+shift+k');
  assert.equal(K.fromEvent(ev({ key: '?', shiftKey: true }), false), '?');
});

test('settings.normalize complète et ignore les types invalides', () => {
  const s = S.normalize({ dark: { enabled: true }, recentsMax: 'x', features: { palette: false }, inconnu: 1 });
  assert.equal(s.dark.enabled, true);
  assert.deepEqual(s.dark.excludedSites, []);
  assert.equal(s.recentsMax, 20);
  assert.equal(s.features.palette, false);
  assert.equal(s.features.parentButton, true);
  assert.equal(s.inconnu, undefined);
  assert.equal(s.shortcuts.palette, 'mod+k');
});
