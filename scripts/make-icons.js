// Génère les icônes PNG à partir de src/icons/icon.svg (node scripts/make-icons.js).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../src/icons/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(__dirname, `../src/icons/icon${size}.png`), omitBackground: true });
  }
  await browser.close();
})();
