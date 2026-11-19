/*
 * Faux tenant SharePoint (https://contoso.sharepoint.com) servi par interception réseau Playwright.
 * Les pages imitent la structure des vues modernes (rôles ARIA, data-automationid),
 * les réponses REST suivent le format odata=nometadata.
 */
const ORIGIN = 'https://contoso.sharepoint.com';

const GUID = 'aaaa1111-2222-3333-4444-555566667777';

const ctxScript = (extra) => `<script>window._spPageContextInfo = Object.assign({
  webAbsoluteUrl: '${ORIGIN}/sites/X', webServerRelativeUrl: '/sites/X', webTitle: 'Projet X',
  siteAbsoluteUrl: '${ORIGIN}/sites/X', siteServerRelativeUrl: '/sites/X', isSPO: true,
  listUrl: '/sites/X/Shared Documents', listTitle: 'Documents', listId: '{0b5f1c2e-1111-2222-3333-444455556666}'
}, ${JSON.stringify(extra || {})});</script>`;

const shell = (body, extra) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>SharePoint</title>${ctxScript(extra)}
<style>body{font-family:sans-serif;margin:0} header{background:#03787c;color:#fff;padding:8px} main{padding:16px}
[role=row]{display:flex;gap:16px;padding:8px;border-bottom:1px solid #ddd} [role=gridcell]{min-width:120px}</style></head>
<body><header role="banner"><nav role="navigation"><a href="${ORIGIN}/sites/X/Shared%20Documents/Forms/AllItems.aspx">Documents</a></nav>
<div id="sbcId"><input type="search" aria-label="Rechercher dans ce site"></div></header>
<main role="main">${body}</main></body></html>`;

function searchPage() {
  return shell(`
<h1>Résultats</h1>
<ul id="results">
  <li class="wrapper-101"><article aria-posinset="1" aria-label="XLSX, Fichier Excel résultat. Budget 2026.">
    <a class="thumbnailLink-1" href="${ORIGIN}/sites/X/_layouts/15/Doc.aspx?sourcedoc=%7B${GUID.toUpperCase()}%7D&file=Budget%202026.xlsx&action=default"><img alt=""></a>
    <header><h2><a class="ms-Link" href="${ORIGIN}/sites/X/_layouts/15/Doc.aspx?sourcedoc=%7B${GUID.toUpperCase()}%7D&file=Budget%202026.xlsx&action=default">Budget 2026.xlsx</a></h2></header>
    <div class="container-229"><a class="link-232" target="_blank" aria-label="Emplacement. Dans SharePoint. Projet X site." href="${ORIGIN}/sites/X/Shared Documents/Finance">SharePoint • Projet X … Finance</a></div>
    <p>Prévisions budgétaires</p>
  </article></li>
  <li role="listitem" class="result"><a href="${ORIGIN}/sites/X/Shared%20Documents/Projets/Alpha/budget.pdf">budget.pdf</a><p>Budget du projet Alpha</p></li>
  <li role="listitem" class="result"><a href="${ORIGIN}/sites/Y/Shared%20Documents/Archives/budget.pdf">budget.pdf</a></li>
  <li role="listitem" class="result"><a href="${ORIGIN}/sites/X/SitePages/Budget.aspx">Page Budget</a></li>
</ul>
<script>
  // Résultat ajouté plus tard, comme le fait le rendu React au défilement.
  setTimeout(() => {
    const li = document.createElement('li'); li.setAttribute('role', 'listitem');
    li.innerHTML = '<a href="${ORIGIN}/sites/X/Shared%20Documents/Projets/Beta/budget-beta.docx">budget-beta.docx</a>';
    document.getElementById('results').appendChild(li);
  }, 600);
  // Le conteneur du résultat est cliquable en entier (comme dans SharePoint).
  window.cardClicks = 0;
  document.getElementById('results').addEventListener('click', () => window.cardClicks++);
</script>`);
}

// Structure relevée sur un vrai tenant (liste « spartan », novembre 2026).
function libraryPage() {
  const row = (id, name, folder, selected) => `
  <div role="row" aria-selected="${selected ? 'true' : 'false'}" data-automationid="row-${id}" data-selection-index="${id}" class="row_1 docLibRow_1">
    <div role="gridcell" data-automationid="row-selection-${id}"><input type="checkbox" aria-label="${name}" data-automationid="selection-checkbox"></div>
    <div role="gridcell" data-automationid="field-DocIcon"><i role="img" aria-label="${folder ? 'Dossier Jaune' : '.' + name.split('.').pop()}"></i></div>
    <div role="rowheader" data-automationid="field-LinkFilename"><span role="button" title="${name}" data-id="heroField" data-selection-invoke="true">${name}</span>
      <div data-automationid="heroCommands"><button title="Autres actions" data-automationid="moreActionsHeroField"></button></div></div>
    <div role="gridcell" data-automationid="field-Modified">Il y a 2 jours</div>
  </div>`;
  return shell(`
<input class="rowFocusInput_1" role="grid" aria-owns="html-list_3">
<div id="list-content-id" role="grid" data-automationid="list-content" aria-label="Projets">
  <div role="row" data-automationid="row-header"><div role="columnheader">Type</div><div role="columnheader">Nom</div><div role="columnheader">Modifié</div></div>
  ${row(11, 'Sous-dossier', true)}
  ${row(12, 'Syngo.via', true)}
  ${row(13, 'rapport.docx', false)}
  ${row(14, 'notes.txt', false, true)}
</div>
<script>
  // Comme SharePoint : un clic sur le nom navigue par script (pas de vrai lien).
  window.nameClicks = 0;
  document.querySelectorAll('[data-id="heroField"]').forEach((n) => n.addEventListener('click', () => window.nameClicks++));
</script>`);
}

// Recherche dans la bibliothèque : chemins réels des éléments, par identifiant.
const LIST_ITEMS = {
  11: { FileRef: '/sites/X/Shared Documents/Projets/Sous-dossier', FileLeafRef: 'Sous-dossier', FSObjType: 1 },
  12: { FileRef: '/sites/X/Shared Documents/Projets/Syngo.via', FileLeafRef: 'Syngo.via', FSObjType: 1 },
  13: { FileRef: '/sites/X/Shared Documents/Archives/2025/rapport.docx', FileLeafRef: 'rapport.docx', FSObjType: 0 },
  14: { FileRef: '/sites/X/Shared Documents/Projets/notes.txt', FileLeafRef: 'notes.txt', FSObjType: 0 },
};

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAADJmOS+AAAAQ0lEQVR4nO3PQQ0AIBDAMMC/5+ODgiUtZtj0vLYB5kG8gVqsXoleoF6gF6gX6AXqBXqBeoFeoF6gF6gX6AXqBXqBeoFeYJYBYdEBf5uS8B0AAAAASUVORK5CYII=',
  'base64'
);

function cell(k, v) {
  return { Key: k, Value: v == null ? null : String(v), ValueType: 'Edm.String' };
}

function searchJson() {
  const rows = [
    {
      Title: 'Budget 2026',
      Path: ORIGIN + '/sites/X/Shared Documents/Finance/Budget 2026.xlsx',
      SPWebUrl: ORIGIN + '/sites/X',
      SiteTitle: 'Projet X',
      LastModifiedTime: '2026-11-12T13:03:00Z',
      EditorOWSUSER: 'marie@contoso.com | Marie Curie | 693A i:0#.f|membership|marie@contoso.com',
      IsDocument: 'true',
      UniqueId: '{' + GUID.toUpperCase() + '}',
      Size: 250880,
      FileExtension: 'xlsx',
    },
    {
      Title: 'budget',
      Path: ORIGIN + '/sites/X/Shared Documents/Projets/Alpha/budget.pdf',
      SPWebUrl: ORIGIN + '/sites/X',
      SiteTitle: 'Projet X',
      LastModifiedTime: '2026-10-01T08:00:00Z',
      EditorOWSUSER: 'paul@contoso.com | Paul Langevin | x',
      IsDocument: 'true',
      UniqueId: '{BBBB}',
      Size: 1024,
      FileExtension: 'pdf',
    },
    {
      Title: 'budget',
      Path: ORIGIN + '/sites/Y/Shared Documents/Archives/budget.pdf',
      SPWebUrl: ORIGIN + '/sites/Y',
      SiteTitle: 'Archives',
      LastModifiedTime: '2024-01-01T08:00:00Z',
      IsDocument: 'true',
      UniqueId: '{CCCC}',
      FileExtension: 'pdf',
    },
    {
      Title: 'Dossier Budget',
      Path: ORIGIN + '/sites/X/Shared Documents/Budget',
      SPWebUrl: ORIGIN + '/sites/X',
      IsDocument: 'false',
      IsContainer: 'true',
      UniqueId: '{DDDD}',
    },
  ];
  return {
    PrimaryQueryResult: {
      RelevantResults: {
        TotalRows: rows.length,
        Table: { Rows: rows.map((r) => ({ Cells: Object.entries(r).map(([k, v]) => cell(k, v)) })) },
      },
    },
  };
}

const VERSION_TEXT = {
  '1.0': 'Réunion du lundi\n- point budget\n- planning\n',
  '2.0': 'Réunion du lundi\n- point budget validé\n- planning\n- recrutement\n',
};

async function install(context, log) {
  const calls = (log && log.calls) || [];
  await context.route(ORIGIN + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = decodeURIComponent(url.pathname);
    calls.push(req.url());
    const json = (body, status) => route.fulfill({ status: status || 200, contentType: 'application/json;odata=nometadata', body: JSON.stringify(body) });
    const html = (body) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });

    if (p.endsWith('/_api/search/query')) return json(searchJson());
    const li = /\/_api\/web\/lists\(guid'[^']+'\)\/items\((\d+)\)$/i.exec(p);
    if (li) return LIST_ITEMS[li[1]] ? json(LIST_ITEMS[li[1]]) : json({ error: 'not found' }, 404);
    if (/\/_api\/web\/GetFileById\(/i.test(p)) return json({ ServerRelativeUrl: '/sites/X/Shared Documents/Finance/Budget 2026.xlsx', Name: 'Budget 2026.xlsx' });
    if (/\/_api\/social\.following\/my\/followed/i.test(p)) {
      return json({ value: [{ Name: 'Comptabilité', Uri: ORIGIN + '/sites/Compta' }, { Name: 'Ressources humaines', Uri: ORIGIN + '/sites/RH' }] });
    }
    if (/GetFileByServerRelativePath\(decodedurl=@p\)\/Versions/i.test(p)) {
      return json({
        value: [
          { ID: 512, VersionLabel: '1.0', Created: '2026-11-01T09:00:00Z', Size: 40, Url: '_vti_history/512/Shared Documents/Projets/notes.txt', IsCurrentVersion: false, CheckInComment: 'Première version', CreatedBy: { Title: 'Paul Langevin' } },
        ],
      });
    }
    if (/GetFileByServerRelativePath/i.test(p)) {
      const target = url.searchParams.get('@p') || '';
      if (/missing/.test(target)) return json({ error: 'not found' }, 404);
      return json({
        Name: target.split('/').pop().replace(/'$/, ''),
        Length: '58',
        TimeLastModified: '2026-11-15T10:30:00Z',
        TimeCreated: '2026-11-01T09:00:00Z',
        UIVersionLabel: '2.0',
        ModifiedBy: { Title: 'Marie Curie' },
        Author: { Title: 'Paul Langevin' },
        ServerRelativeUrl: target.replace(/^'|'$/g, ''),
      });
    }
    if (/GetFolderByServerRelativePath/i.test(p)) {
      return json({ Name: 'Sous-dossier', ItemCount: 7, TimeLastModified: '2026-11-10T10:00:00Z' });
    }
    if (p.endsWith('/_layouts/15/getpreview.ashx')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX });
    if (p.includes('/_vti_history/512/')) return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: VERSION_TEXT['1.0'] });
    if (p === '/sites/X/Shared Documents/Projets/notes.txt') return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: VERSION_TEXT['2.0'] });
    if (/\/search\.aspx/i.test(p)) return html(searchPage());
    if (/\/Forms\/AllItems\.aspx$/i.test(p)) return html(libraryPage());
    if (p.startsWith('/sites/')) return html(shell('<h1>' + p + '</h1>'));
    return html(shell('<h1>Accueil</h1>'));
  });
  return calls;
}

module.exports = { ORIGIN, GUID, install };
