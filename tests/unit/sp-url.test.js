const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../src/lib/sp-url.js');

const O = 'https://contoso.sharepoint.com';

test('normalizePath décode et nettoie', () => {
  assert.equal(U.normalizePath('/sites/X/Shared%20Documents/A/'), '/sites/X/Shared Documents/A');
  assert.equal(U.normalizePath('sites//X'), '/sites/X');
  assert.equal(U.normalizePath('/'), '/');
});

test('encodePath encode chaque segment', () => {
  assert.equal(U.encodePath('/sites/X/Documents partagés/A#1'), '/sites/X/Documents%20partag%C3%A9s/A%231');
});

test('parentPath, basename, extension', () => {
  assert.equal(U.parentPath('/sites/X/Docs/a/b.docx'), '/sites/X/Docs/a');
  assert.equal(U.parentPath('/a'), '/');
  assert.equal(U.basename('/sites/X/Docs/b.docx'), 'b.docx');
  assert.equal(U.extension('rapport.final.PDF'), 'pdf');
  assert.equal(U.extension('.gitignore'), '');
  assert.equal(U.extension('Dossier'), '');
});

test('siteCollectionPath', () => {
  assert.equal(U.siteCollectionPath('/sites/Compta/Docs/x'), '/sites/Compta');
  assert.equal(U.siteCollectionPath('/teams/T1/Docs'), '/teams/T1');
  assert.equal(U.siteCollectionPath('/personal/jean_contoso_com/Documents'), '/personal/jean_contoso_com');
  assert.equal(U.siteCollectionPath('/Shared Documents/x'), '');
});

test('parse : chemin direct de fichier', () => {
  const r = U.parse(O + '/sites/X/Shared%20Documents/Projet/fichier.docx');
  assert.equal(r.kind, 'file');
  assert.equal(r.path, '/sites/X/Shared Documents/Projet/fichier.docx');
  assert.equal(r.webPath, '/sites/X');
});

test('parse : Doc.aspx?sourcedoc', () => {
  const r = U.parse(O + '/sites/X/_layouts/15/Doc.aspx?sourcedoc=%7B1A2B3C4D-0000-1111-2222-333344445555%7D&file=Rapport.docx&action=default');
  assert.equal(r.kind, 'file');
  assert.equal(r.uniqueId, '1a2b3c4d-0000-1111-2222-333344445555');
  assert.equal(r.fileName, 'Rapport.docx');
  assert.equal(r.webPath, '/sites/X');
  assert.ok(r.needsResolve);
});

test('parse : vue de bibliothèque ?id= (dossier) et aperçu ?id=&parent= (fichier)', () => {
  const f = U.parse(O + '/sites/X/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FX%2FShared%20Documents%2FProjet&viewid=abc');
  assert.equal(f.kind, 'folder');
  assert.equal(f.path, '/sites/X/Shared Documents/Projet');
  const p = U.parse(O + '/sites/X/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FX%2FShared%20Documents%2FProjet%2Fa.pdf&parent=%2Fsites%2FX%2FShared%20Documents%2FProjet');
  assert.equal(p.kind, 'file');
  assert.equal(p.parent, '/sites/X/Shared Documents/Projet');
});

test('parse : OneDrive onedrive.aspx?id=', () => {
  const r = U.parse('https://contoso-my.sharepoint.com/personal/jean_contoso_com/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Fjean_contoso_com%2FDocuments%2FPerso');
  assert.equal(r.kind, 'folder');
  assert.equal(r.path, '/personal/jean_contoso_com/Documents/Perso');
});

test('parse : racine de bibliothèque et RootFolder', () => {
  assert.deepEqual(
    [U.parse(O + '/sites/X/Shared%20Documents/Forms/AllItems.aspx').kind, U.parse(O + '/sites/X/Shared%20Documents/Forms/AllItems.aspx').path],
    ['folder', '/sites/X/Shared Documents']
  );
  const r = U.parse(O + '/sites/X/Docs/Forms/AllItems.aspx?RootFolder=%2Fsites%2FX%2FDocs%2FA');
  assert.equal(r.path, '/sites/X/Docs/A');
});

test('parse : liens de partage', () => {
  const r = U.parse(O + '/:w:/r/sites/X/Shared%20Documents/a.docx?d=w123&csf=1');
  assert.equal(r.kind, 'file');
  assert.equal(r.path, '/sites/X/Shared Documents/a.docx');
  const f = U.parse(O + '/:f:/r/sites/X/Shared%20Documents/Projet?csf=1');
  assert.equal(f.kind, 'folder');
  const s = U.parse(O + '/:x:/s/X/EabcDEF123?e=xyz');
  assert.equal(s.kind, 'file');
  assert.ok(s.needsResolve);
  assert.ok(s.sharing);
});

test('parse : pages, sites et domaines non SharePoint', () => {
  assert.equal(U.parse(O + '/sites/X/SitePages/Accueil.aspx').kind, 'page');
  assert.equal(U.parse(O + '/sites/X/_layouts/15/search.aspx/siteall?q=test').kind, 'page');
  assert.equal(U.parse(O + '/sites/X').kind, 'site');
  assert.equal(U.parse(O + '/').kind, 'site');
  assert.equal(U.parse('https://example.com/a.docx'), null);
  assert.equal(U.parse('mailto:x@y.z'), null);
  assert.equal(U.parse(O + '/sites/X/Lists/Taches/AllItems.aspx').kind, 'list');
});

test('parse : dossier direct', () => {
  const r = U.parse(O + '/sites/X/Shared%20Documents/Projet/2026');
  assert.equal(r.kind, 'folder');
  assert.equal(r.path, '/sites/X/Shared Documents/Projet/2026');
});

test('folderUrl : direct, allitems, OneDrive', () => {
  assert.equal(U.folderUrl(O, '/sites/X/Shared Documents/Projet'), O + '/sites/X/Shared%20Documents/Projet');
  assert.equal(
    U.folderUrl(O, '/sites/X/Shared Documents/Projet', { mode: 'allitems' }),
    O + '/sites/X/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FX%2FShared%20Documents%2FProjet'
  );
  assert.equal(
    U.folderUrl('https://contoso-my.sharepoint.com', '/personal/j_c_com/Documents/A'),
    'https://contoso-my.sharepoint.com/personal/j_c_com/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Fj_c_com%2FDocuments%2FA'
  );
});

test('libraryRoot', () => {
  assert.equal(U.libraryRoot('/sites/X/Docs/a/b'), '/sites/X/Docs');
  assert.equal(U.libraryRoot('/sites/X/sub/Docs/a', '/sites/X/sub'), '/sites/X/sub/Docs');
  assert.equal(U.libraryRoot('/Shared Documents/a', '/'), '/Shared Documents');
});

test('segments : fil d’Ariane', () => {
  const s = U.segments('/sites/X/Docs/A/B', '/sites/X', 'Mon site');
  assert.deepEqual(s.map((x) => x.label), ['Mon site', 'Docs', 'A', 'B']);
  assert.equal(s[0].path, '/sites/X');
  assert.equal(s[2].path, '/sites/X/Docs/A');
  assert.equal(s[3].kind, 'leaf');
});

test('compareKey rapproche les formes d’URL', () => {
  assert.equal(U.compareKey(O + '/sites/X/Shared%20Documents/a.docx'), U.compareKey(O + '/sites/X/Shared Documents/a.docx'));
  assert.equal(U.compareKey(O + '/sites/X/_layouts/15/Doc.aspx?sourcedoc={ABC}'), 'id:abc');
});

test('siteKey', () => {
  assert.equal(U.siteKey(O + '/sites/Compta/Docs/x.pdf'), 'contoso.sharepoint.com/sites/compta');
  assert.equal(U.siteKey(O + '/Shared%20Documents'), 'contoso.sharepoint.com');
});
