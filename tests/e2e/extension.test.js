/*
 * Tests de bout en bout : l'extension est chargée dans Chromium et testée sur un faux tenant.
 * Lancement : npm run test:e2e   (HEADED=1 pour voir le navigateur)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { ORIGIN, install } = require('./mock-sharepoint');

const EXT = path.resolve(__dirname, '../..');
const SHOTS = process.env.SHOTS_DIR || '';
const SEARCH_URL = ORIGIN + '/sites/X/_layouts/15/search.aspx/siteall?q=budget';
const LIB_URL = ORIGIN + '/sites/X/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FX%2FShared%20Documents%2FProjets';

let context;
let extId;
let calls;
let sw;

/** Ouvre un onglet via `action` et renvoie l'URL demandée (même si le faux réseau ne l'a pas servie). */
async function openedUrl(action) {
  const [p] = await Promise.all([context.waitForEvent('page'), action()]);
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  let url = p.url();
  if (!url.startsWith('https:')) {
    const tabs = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl || t.url));
    url = tabs.find((u) => u && u.startsWith('https://') && !u.includes('search.aspx') && !u.includes('AllItems.aspx')) || url;
  }
  await p.close();
  return url;
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

const shadow = (page, sel) => page.locator('#bsp-ui-host').locator(sel);

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsp-e2e-'));
  const opts = {
    headless: !process.env.HEADED,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
    viewport: { width: 1280, height: 800 },
  };
  if (process.env.BROWSER_CHANNEL) opts.channel = process.env.BROWSER_CHANNEL;
  else opts.channel = 'chromium';
  context = await chromium.launchPersistentContext(dir, opts);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  calls = await install(context);
  [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extId = new URL(sw.url()).host;
});

test.after(async () => {
  if (context) await context.close();
});

async function openPage(url) {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('html[data-bsp-ready]');
  return page;
}

async function clearStorage() {
  const page = await context.newPage();
  await page.goto('chrome-extension://' + extId + '/src/options/options.html');
  await page.evaluate(async () => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
  });
  await page.close();
}

test('1 et 8 · boutons dossier parent et résultats enrichis', async () => {
  await clearStorage();
  const page = await openPage(SEARCH_URL);
  const results = page.locator('#results > li');
  // Les 3 fichiers et le résultat ajouté plus tard ont un bouton ; pas la page de site.
  await page.waitForFunction(() => document.querySelectorAll('#results .bsp-parent').length === 4);
  assert.equal(await results.nth(3).locator('.bsp-parent').count(), 0, 'pas de bouton pour une page de site');
  // Carte réelle : un seul bouton, sur le titre, et le lien « Emplacement » n'est pas pris pour le fichier.
  assert.equal(await results.nth(0).locator('.bsp-parent').count(), 1);
  assert.equal(await results.nth(0).locator('h2 .bsp-parent').count(), 1);
  assert.equal(await results.nth(0).locator('a[aria-label^="Emplacement"][data-bsp-path]').count(), 0);
  assert.equal(await page.locator('header[role="banner"] .bsp-actions').count(), 0, 'pas de bouton dans la navigation');

  // Lien direct : dossier parent calculé depuis l'URL.
  const alpha = results.nth(1).locator('.bsp-parent');
  assert.equal(await alpha.getAttribute('href'), ORIGIN + '/sites/X/Shared%20Documents/Projets/Alpha');

  // Doc.aspx?sourcedoc= : chemin retrouvé grâce à l'API de recherche (UniqueId).
  const xlsx = results.nth(0).locator('.bsp-parent');
  await page.waitForFunction(() => !document.querySelector('#results .bsp-parent').hasAttribute('aria-busy'));
  assert.equal(await xlsx.getAttribute('href'), ORIGIN + '/sites/X/Shared%20Documents/Finance');

  // Métadonnées
  const meta0 = results.nth(0).locator('.bsp-meta');
  await meta0.waitFor();
  const text0 = await meta0.innerText();
  assert.match(text0, /Projet X/);
  assert.match(text0, /Finance/);
  assert.match(text0, /Marie Curie/);
  assert.match(text0, /245 Ko/);
  assert.equal(await meta0.locator('.bsp-crumbs a').first().getAttribute('href'), ORIGIN + '/sites/X');
  // Doublons
  assert.match(await results.nth(1).locator('.bsp-dup').innerText(), /2 fichiers portent ce nom/);
  // Étoile favoris
  assert.equal(await results.nth(1).locator('.bsp-star').count(), 1);

  // Le clic sur nos boutons ne déclenche pas le clic de la carte SharePoint.
  await results.nth(2).locator('.bsp-star').click();
  assert.equal(await page.evaluate(() => window.cardClicks), 0);

  // Clic du milieu sur le bouton dossier parent : nouvel onglet.
  assert.equal(await openedUrl(() => alpha.click({ button: 'middle' })), ORIGIN + '/sites/X/Shared%20Documents/Projets/Alpha');

  await shot(page, '01-recherche');

  // Clic normal : navigation vers le dossier.
  await Promise.all([page.waitForURL(ORIGIN + '/sites/X/Shared%20Documents/Projets/Alpha'), alpha.click()]);
  await page.close();
});

test('6 · palette de commandes', async () => {
  await clearStorage();
  const page = await openPage(LIB_URL);
  await page.keyboard.press('Control+k');
  const input = shadow(page, '.pal-input');
  await input.waitFor();
  await input.fill('budg');
  // Recherche SharePoint automatique après saisie.
  await shadow(page, '.pal-item:has-text("Budget 2026.xlsx")').waitFor();
  assert.ok(await shadow(page, '.pal-item:has-text("Dossier Budget")').count());
  await shot(page, '02-palette');

  // Sites suivis
  await input.fill('compta');
  await shadow(page, '.pal-item:has-text("Comptabilité")').waitFor();

  // Actions avec « > »
  await input.fill('>sombre');
  await shadow(page, '.pal-item:has-text("Basculer le mode sombre")').waitFor();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.classList.contains('bsp-dark'));
  assert.equal(await shadow(page, '.pal-wrap').count(), 0, 'la palette se ferme');

  // Alt+Entrée sur un résultat : dossier parent
  await page.keyboard.press('Control+k');
  await input.fill('budget 2026');
  const item = shadow(page, '.pal-item:has-text("Budget 2026.xlsx")');
  await item.waitFor();
  await item.hover();
  await Promise.all([page.waitForURL(ORIGIN + '/sites/X/Shared%20Documents/Finance'), page.keyboard.press('Alt+Enter')]);
  await page.close();
});

test('4, 5, 7, 9 · barre de chemin, favoris, récents, raccourcis', async () => {
  await clearStorage();
  const page = await openPage(LIB_URL);
  const bar = shadow(page, '.pathbar');
  await bar.waitFor();
  const crumbs = await shadow(page, '.pb-crumbs > a, .pb-crumbs > .leaf').allInnerTexts();
  assert.deepEqual(crumbs, ['Projet X', 'Shared Documents', 'Projets']);

  // Copier le chemin (Maj+C) – aucune ligne sélectionnée → page courante. On désélectionne d'abord.
  await page.evaluate(() => document.querySelectorAll('[aria-selected="true"]').forEach((r) => r.setAttribute('aria-selected', 'false')));
  await page.mouse.click(640, 450);
  await page.keyboard.press('Shift+C');
  await shadow(page, '.toast.show:has-text("Chemin copié")').waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), ORIGIN + '/sites/X/Shared Documents/Projets');

  // Copier le lien (C)
  await page.keyboard.press('c');
  await shadow(page, '.toast.show:has-text("Lien copié")').waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), ORIGIN + '/sites/X/Shared%20Documents/Projets');

  // Les raccourcis sans modificateur sont ignorés dans un champ.
  await page.locator('#sbcId input').fill('');
  await page.locator('#sbcId input').type('f');
  assert.equal(await page.locator('#sbcId input').inputValue(), 'f');
  await page.mouse.click(640, 450);

  // Favori (F)
  await page.keyboard.press('f');
  await shadow(page, '.toast.show:has-text("Ajouté aux favoris")').waitFor();
  await shadow(page, '.pb-actions .ibtn[aria-pressed="true"]').waitFor();

  // Aide (?)
  await page.keyboard.press('Shift+?');
  await shadow(page, '.panel:has-text("Raccourcis clavier")').waitFor();
  await page.keyboard.press('Escape');

  // Dossier parent (P)
  await Promise.all([page.waitForURL(ORIGIN + '/sites/X/Shared%20Documents'), page.keyboard.press('p')]);
  await page.waitForSelector('html[data-bsp-ready]');

  // Popup : favoris et récents
  const popup = await context.newPage();
  await popup.goto('chrome-extension://' + extId + '/src/popup/popup.html');
  await popup.locator('#panel .title:has-text("Projets")').waitFor();
  await popup.click('#tab-rec');
  await popup.locator('#panel .title:has-text("Projets")').waitFor();
  await shot(popup, '03-popup');
  await popup.close();
  await page.close();
});

test('11 · clic du milieu et Ctrl+clic sur les noms de la bibliothèque', async () => {
  const page = await openPage(LIB_URL);
  const name = page.locator('[data-id="heroField"]:has-text("rapport.docx")');
  assert.equal(await openedUrl(() => name.click({ button: 'middle' })), ORIGIN + '/sites/X/Shared%20Documents/Projets/rapport.docx');

  const folder = page.locator('[data-id="heroField"]:has-text("Sous-dossier")');
  assert.equal(await openedUrl(() => folder.click({ modifiers: ['Control'] })), ORIGIN + '/sites/X/Shared%20Documents/Projets/Sous-dossier');
  assert.equal(await page.evaluate(() => window.nameClicks), 0, 'SharePoint ne reçoit pas le clic');

  // Un clic simple reste géré par SharePoint.
  await name.click();
  assert.equal(await page.evaluate(() => window.nameClicks), 1);
  await page.close();
});

test('recherche dans une bibliothèque (view=7&q=) : chemins réels par identifiant', async () => {
  const page = await openPage(LIB_URL + '&view=7&q=rapport');
  const name = page.locator('[data-id="heroField"]:has-text("rapport.docx")');
  // Le fichier est dans un autre dossier que le dossier courant.
  assert.equal(await openedUrl(() => name.click({ button: 'middle' })), ORIGIN + '/sites/X/Shared%20Documents/Archives/2025/rapport.docx');
  await page.mouse.move(5, 5);
  await name.hover();
  await shadow(page, '.hovercard .hc-path:has-text("Archives/2025")').waitFor();
  await page.mouse.move(5, 5);
  // Un dossier dont le nom contient un point reste un dossier.
  const dotted = page.locator('[data-id="heroField"]:has-text("Syngo.via")');
  assert.equal(await openedUrl(() => dotted.click({ modifiers: ['Control'] })), ORIGIN + '/sites/X/Shared%20Documents/Projets/Syngo.via');
  await page.close();

  const plain = await openPage(LIB_URL);
  const dotted2 = plain.locator('[data-id="heroField"]:has-text("Syngo.via")');
  assert.equal(await openedUrl(() => dotted2.click({ modifiers: ['Control'] })), ORIGIN + '/sites/X/Shared%20Documents/Projets/Syngo.via');
  await plain.close();
});

test('15 · aperçu au survol', async () => {
  const page = await openPage(LIB_URL);
  await page.locator('[data-id="heroField"]:has-text("rapport.docx")').hover();
  const card = shadow(page, '.hovercard');
  await card.waitFor({ timeout: 5000 });
  await shadow(page, '.hovercard:has-text("Marie Curie")').waitFor();
  const t = await card.innerText();
  assert.match(t, /rapport\.docx/);
  assert.match(t, /version 2\.0/);
  await shot(page, '04-survol');
  await page.locator('[data-id="heroField"]:has-text("Sous-dossier")').hover();
  await shadow(page, '.hovercard:has-text("7 éléments")').waitFor();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  assert.equal(await card.count(), 0);
  await page.close();
});

test('18 · historique des versions et comparaison', async () => {
  const page = await openPage(LIB_URL);
  // notes.txt est la ligne sélectionnée.
  await page.mouse.click(640, 450);
  await page.keyboard.press('v');
  const panel = shadow(page, '.panel');
  await panel.waitFor();
  await shadow(page, 'table.versions tbody tr').nth(1).waitFor();
  const rows = await shadow(page, 'table.versions tbody tr').allInnerTexts();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /2\.0/);
  assert.match(rows[1], /1\.0[\s\S]*Paul Langevin[\s\S]*Première version/);
  await shadow(page, 'button:has-text("Comparer")').click();
  await shadow(page, '.diff').waitFor();
  assert.match(await shadow(page, '.diff-head').innerText(), /\+2[\s\S]*−1/);
  assert.equal(await shadow(page, '.line.del').count(), 1);
  await shot(page, '05-versions');
  await page.keyboard.press('Escape');
  assert.equal(await panel.count(), 0);
  await page.close();
});

test('10 et 14 · modes sombre et compact, masquage d’éléments', async () => {
  await clearStorage();
  const page = await openPage(LIB_URL);
  await page.mouse.click(640, 450);
  await page.keyboard.press('d');
  await page.waitForFunction(() => document.documentElement.classList.contains('bsp-dark'));
  const filter = await page.evaluate(() => getComputedStyle(document.documentElement).filter);
  assert.match(filter, /invert/);
  await shot(page, '06-sombre');
  await page.keyboard.press('Shift+D');
  await page.waitForFunction(() => document.documentElement.classList.contains('bsp-compact'));

  // Le réglage s'applique aux autres onglets.
  const other = await openPage(SEARCH_URL);
  assert.ok(await other.evaluate(() => document.documentElement.classList.contains('bsp-dark')));
  await other.close();

  // Masquer un élément via le sélecteur
  await page.keyboard.press('Control+k');
  await shadow(page, '.pal-input').fill('>masquer');
  await page.keyboard.press('Enter');
  await page.locator('header nav a').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('header nav a')).display === 'none');
  const s = await page.evaluate(() => chrome.storage === undefined);
  assert.ok(s, 'la page n’a pas accès aux API de l’extension');

  // Désactiver le mode sombre (D) et le compact
  await page.keyboard.press('d');
  await page.waitForFunction(() => !document.documentElement.classList.contains('bsp-dark'));
  await page.close();
});

test('options : modification d’un raccourci', async () => {
  await clearStorage();
  const page = await context.newPage();
  await page.goto('chrome-extension://' + extId + '/src/options/options.html');
  await page.locator('#shortcuts button.key').first().click();
  await page.keyboard.press('Control+Shift+P');
  await page.locator('#saved:has-text("Enregistré")').waitFor();
  const sc = await page.evaluate(async () => (await chrome.storage.sync.get('settings')).settings.shortcuts.palette);
  assert.equal(sc, 'mod+shift+p');
  await shot(page, '07-options');
  await page.close();

  const sp = await openPage(LIB_URL);
  await sp.keyboard.press('Control+Shift+P');
  await shadow(sp, '.pal-input').waitFor();
  await sp.close();
});
