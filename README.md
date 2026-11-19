# BetterSharePoint

Extension de navigateur (Chrome, Brave, Edge) qui rend l'utilisation de SharePoint Online plus agréable au quotidien.
Elle fonctionne avec ta session SharePoint habituelle : aucune application à déclarer dans Entra ID, aucun serveur externe.

## Fonctionnalités

| | Fonctionnalité | Où |
|---|---|---|
| 📁 | **Dossier parent depuis la recherche** : un bouton à côté de chaque résultat ouvre le dossier qui contient le fichier. Ctrl+clic ou clic du milieu : nouvel onglet. | Page de résultats de recherche |
| 🔎 | **Résultats enrichis** : chemin complet cliquable, date de modification, auteur, taille, alerte quand plusieurs fichiers portent le même nom. | Page de résultats de recherche |
| ⭐ | **Favoris multi-sites** : étoile sur un dossier ou un fichier, liste dans la popup et la palette, synchronisée par le navigateur. | Barre de chemin, résultats, popup |
| 🕘 | **Dossiers récents** : les 20 derniers dossiers visités. | Popup, palette, touche `R` |
| ⌨️ | **Palette de commandes** : `Ctrl+K` partout dans SharePoint pour retrouver un favori, un dossier récent, un site suivi, lancer une action ou chercher dans SharePoint. | Partout |
| ⌨️ | **Raccourcis clavier** personnalisables (voir plus bas). | Partout |
| 📍 | **Barre de chemin** : chemin complet du dossier ou du fichier affiché, chaque segment cliquable, boutons copier (lien direct, chemin, Markdown). | En bas à gauche |
| 🗂️ | **Nouvel onglet fiable** : clic du milieu et Ctrl+clic fonctionnent sur les noms de fichiers et dossiers des bibliothèques. Option « toujours ouvrir dans un nouvel onglet ». | Bibliothèques |
| 🧹 | **Mode compact** : lignes et marges réduites, éléments masquables (en-tête, barre d'applications, commentaires…), et sélecteur « Masquer un élément de la page… » pour retirer ce qui te gêne. | Partout |
| 🌙 | **Mode sombre**, désactivable site par site. | Partout |
| 👁️ | **Aperçu au survol** : vignette et métadonnées d'un fichier ou dossier. | Bibliothèques, recherche |
| 🕰️ | **Historique des versions lisible** : auteur, date, taille, commentaire ; comparaison ligne à ligne pour les fichiers texte, ouverture côte à côte pour les autres. | Touche `V`, barre de chemin, palette |

### Raccourcis par défaut

| Touche | Action |
|---|---|
| `Ctrl+K` | Palette de commandes |
| `/` | Aller à la barre de recherche |
| `P` | Ouvrir le dossier parent |
| `C` | Copier le lien direct (de la ligne sélectionnée ou de la page) |
| `Maj+C` | Copier le chemin |
| `F` | Ajouter ou retirer des favoris |
| `R` | Dossiers récents |
| `V` | Historique des versions |
| `D` | Mode sombre |
| `Maj+D` | Mode compact |
| `?` | Aide |

Les raccourcis sans `Ctrl` sont ignorés quand tu écris dans un champ. Tout se change dans les options.

## Installation (mode développeur)

1. Récupère le dépôt : `git clone https://github.com/GuideAuBug73/BetterSharepoint.git`
2. Ouvre la page des extensions :
   - Edge : `edge://extensions`
   - Chrome : `chrome://extensions`
   - Brave : `brave://extensions`
3. Active le **mode développeur**.
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier du dépôt (celui qui contient `manifest.json`).
5. Ouvre un site SharePoint : la barre de chemin apparaît en bas à gauche dans les bibliothèques et `Ctrl+K` ouvre la palette.

Après une mise à jour du code, clique sur « Recharger » dans la page des extensions puis recharge l'onglet SharePoint.

## Développement

Aucune étape de compilation : le code est chargé tel quel par le navigateur.

```bash
npm install          # installe Playwright pour les tests de bout en bout
npm test             # tests unitaires (Node)
npx playwright install chromium
npm run test:e2e     # l'extension est chargée dans Chromium sur un faux tenant SharePoint
npm run pack         # crée dist/bettersharepoint-<version>.zip pour les stores
```

`HEADED=1 npm run test:e2e` affiche le navigateur, `BROWSER_CHANNEL=msedge` utilise Edge s'il est installé.

### Organisation

```
manifest.json            Manifest V3
src/background.js        Service worker (nouveaux onglets, fenêtres côte à côte)
src/lib/                 Modules purs testés sous Node (URL SharePoint, recherche, diff, raccourcis…)
src/content/             Scripts injectés dans SharePoint, un fichier par fonctionnalité
src/styles/page.css      Styles injectés dans la page (mode sombre, compact, boutons)
src/styles/ui.css        Styles de l'interface isolée (Shadow DOM) : palette, panneaux, barre de chemin
src/popup/, src/options/ Popup et page d'options
tests/unit/, tests/e2e/  Tests
```

Pour activer les journaux de débogage : dans la console de la page des options, `chrome.storage.local.set({ debug: true })`.

## Confidentialité

L'extension ne contacte que les sites SharePoint que tu visites, avec ta propre session, et uniquement en lecture.
Favoris, dossiers récents et réglages restent dans le stockage du navigateur. Aucune donnée n'est envoyée ailleurs.

## Limites connues

- L'interface de SharePoint change régulièrement : les sélecteurs utilisés pour les bibliothèques et le mode compact peuvent demander des ajustements.
- La comparaison ligne à ligne des versions est réservée aux formats texte (txt, md, csv, json, xml, code…). Les documents Office s'ouvrent côte à côte.
- Les domaines SharePoint personnalisés (hors `*.sharepoint.com`, `.us`, `.de`, `.cn`) ne sont pas encore pris en charge.
