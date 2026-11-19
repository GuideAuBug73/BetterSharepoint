'use strict';
(async function () {
  const { settingsLib: S, keys: K, store } = globalThis.BSP;
  const isMac = /Mac/.test(navigator.platform || '');
  const $ = (id) => document.getElementById(id);

  const FEATURE_LABELS = {
    parentButton: 'Bouton « dossier parent » dans la recherche',
    enrichSearch: 'Résultats de recherche enrichis (chemin, date, auteur, doublons)',
    favorites: 'Favoris multi-sites',
    recents: 'Dossiers récents',
    palette: 'Palette de commandes (Ctrl+K)',
    shortcuts: 'Raccourcis clavier',
    pathBar: 'Barre de chemin copiable',
    newTab: 'Ouverture fiable en nouvel onglet (clic du milieu, Ctrl+clic)',
    hoverPreview: 'Aperçu au survol',
    versions: 'Historique des versions',
  };

  let s = await S.load();
  let savedTimer;

  function get(path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), s);
  }
  function set(path, v) {
    const keys = path.split('.');
    let o = s;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = v;
  }
  async function save() {
    s = await S.save(s);
    $('saved').textContent = 'Enregistré';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('saved').textContent = ''), 1500);
  }

  // Fonctionnalités
  const feat = $('features');
  for (const k of Object.keys(S.DEFAULTS.features)) {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.path = 'features.' + k;
    l.append(cb, ' ' + (FEATURE_LABELS[k] || k));
    feat.appendChild(l);
  }

  function bindInputs() {
    document.querySelectorAll('[data-path]').forEach((input) => {
      const path = input.dataset.path;
      const v = get(path);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v;
      if (input._bound) return;
      input._bound = true;
      input.addEventListener('change', () => {
        let val = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
        if (input.type === 'number') {
          const min = Number(input.min);
          const max = Number(input.max);
          if (isNaN(val)) val = get(path);
          val = Math.min(max, Math.max(min, val));
          input.value = val;
        }
        set(path, val);
        save();
      });
    });
    $('darkExcluded').value = (s.dark.excludedSites || []).join('\n');
    $('customSelectors').value = s.compact.customSelectors || '';
  }

  $('darkExcluded').addEventListener('change', (e) => {
    s.dark.excludedSites = e.target.value
      .split('\n')
      .map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
      .filter(Boolean);
    save();
  });
  $('customSelectors').addEventListener('change', (e) => {
    s.compact.customSelectors = e.target.value;
    save();
  });

  // Raccourcis
  function renderShortcuts() {
    const t = $('shortcuts');
    t.textContent = '';
    for (const id of Object.keys(S.DEFAULTS.shortcuts)) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = S.SHORTCUT_LABELS[id] || id;
      const td2 = document.createElement('td');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.textContent = s.shortcuts[id] ? K.format(s.shortcuts[id], isMac) : '— désactivé —';
      b.addEventListener('click', () => record(b, id));
      td2.appendChild(b);
      tr.append(td1, td2);
      t.appendChild(tr);
    }
  }

  function record(btn, id) {
    btn.textContent = 'Appuie sur une touche…';
    btn.classList.add('recording');
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return finish();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        s.shortcuts[id] = '';
        save();
        return finish();
      }
      const binding = K.fromEvent(e, isMac);
      if (!binding) return;
      const clash = Object.keys(s.shortcuts).find((k) => k !== id && s.shortcuts[k] === binding);
      if (clash) {
        s.shortcuts[clash] = '';
        $('saved').textContent = '« ' + K.format(binding, isMac) + ' » retiré de : ' + S.SHORTCUT_LABELS[clash];
      }
      s.shortcuts[id] = binding;
      save();
      finish();
    };
    const finish = () => {
      window.removeEventListener('keydown', onKey, true);
      btn.classList.remove('recording');
      renderShortcuts();
    };
    window.addEventListener('keydown', onKey, true);
  }

  $('resetShortcuts').addEventListener('click', () => {
    s.shortcuts = JSON.parse(JSON.stringify(S.DEFAULTS.shortcuts));
    save();
    renderShortcuts();
  });

  // Favoris
  $('exportFav').addEventListener('click', async () => {
    const list = await store.listFavorites();
    const blob = new Blob([JSON.stringify({ app: 'BetterSharePoint', version: 1, favorites: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bettersharepoint-favoris.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importFav').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const n = await store.importFavorites(Array.isArray(json) ? json : json.favorites);
      $('saved').textContent = n + ' favori(s) importé(s)';
    } catch (err) {
      $('saved').textContent = 'Fichier invalide : ' + err.message;
    }
    e.target.value = '';
  });
  $('clearRecents').addEventListener('click', async () => {
    await store.clearRecents();
    $('saved').textContent = 'Historique vidé';
  });

  S.onChange((ns) => {
    s = ns;
    bindInputs();
    renderShortcuts();
  });
  bindInputs();
  renderShortcuts();
})();
