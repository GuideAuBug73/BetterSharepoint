// Crée dist/bettersharepoint-<version>.zip, prêt pour le Chrome Web Store ou Edge Add-ons.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join('dist', `bettersharepoint-${version}.zip`);
fs.rmSync(path.join(root, out), { force: true });
execFileSync('zip', ['-r', '-q', out, 'manifest.json', 'src', '-x', 'src/icons/icon.svg'], { cwd: root, stdio: 'inherit' });
console.log('Archive créée : ' + out);
