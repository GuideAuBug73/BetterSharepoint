'use strict';
(async function () {
  const { url: U, settingsLib: S, store, fuzzy } = globalThis.BSP;
  const $ = (id) => document.getElementById(id);
  let tab = 'fav';
  let favs = [];
  let recents = [];
  let activeTab = null;

  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    /* ignore */
  }
  const onSharePoint = !!(activeTab && activeTab.url && U.parse(activeTab.url));
  const siteKey = activeTab && activeTab.url ? U.siteKey(activeTab.url) : '';

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }

  function openUrl(url, ev) {
    const newTab = ev.ctrlKey || ev.metaKey || ev.button === 1 || ev.shiftKey || !onSharePoint;
    if (newTab) chrome.tabs.create({ url, active: !(ev.ctrlKey || ev.metaKey || ev.button === 1) });
    else chrome.tabs.update(activeTab.id, { url });
    if (!(ev.ctrlKey || ev.metaKey || ev.button === 1)) window.close();
  }

  function render() {
    const list = tab === 'fav' ? favs : recents;
    const q = $('filter').value.trim();
    const shown = q ? fuzzy.filter(q, list, (x) => (x.title || '') + ' ' + (x.site || '') + ' ' + (x.path || '')).map((m) => m.item) : list;
    const ul = $('panel');
    ul.textContent = '';
    if (!shown.length) {
      ul.appendChild(
        el('li', {
          class: 'empty',
          text: q
            ? 'Aucun résultat.'
            : tab === 'fav'
              ? 'Aucun favori. Clique sur l’étoile d’un dossier dans SharePoint ou appuie sur F.'
              : 'Aucun dossier récent pour l’instant.',
        })
      );
      return;
    }
    for (const it of shown) {
      const a = el('a', { href: it.url, class: 'item', title: it.path || it.url }, [
        el('span', { class: 'kind ' + (it.kind || 'folder'), 'aria-hidden': 'true' }),
        el('span', { class: 'txt' }, [
          el('span', { class: 'title', text: it.title || U.basename(it.path) }),
          el('span', { class: 'sub', text: [it.site, it.path ? U.parentPath(it.path) : ''].filter(Boolean).join(' · ') }),
        ]),
      ]);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(it.url, e);
      });
      a.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          openUrl(it.url, e);
        }
      });
      const li = el('li', null, [a]);
      if (tab === 'fav' && it.path) {
        const up = el('button', { class: 'mini', type: 'button', title: 'Ouvrir le dossier parent', 'aria-label': 'Ouvrir le dossier parent', text: '↑' });
        up.addEventListener('click', (e) => {
          const parent = U.parentPath(it.path);
          openUrl(U.folderUrl(it.origin, parent), e);
        });
        li.appendChild(up);
      }
      const rm = el('button', { class: 'mini', type: 'button', title: tab === 'fav' ? 'Retirer des favoris' : 'Retirer de l’historique', 'aria-label': 'Retirer', text: '×' });
      rm.addEventListener('click', async () => {
        if (tab === 'fav') await store.removeFavorite(it.id);
        else await store.removeRecent(it.url);
        await load();
      });
      li.appendChild(rm);
      ul.appendChild(li);
    }
  }

  async function load() {
    [favs, recents] = await Promise.all([store.listFavorites(), store.listRecents()]);
    render();
  }

  function setTab(t) {
    tab = t;
    $('tab-fav').setAttribute('aria-selected', String(t === 'fav'));
    $('tab-rec').setAttribute('aria-selected', String(t === 'rec'));
    render();
  }

  async function loadToggles() {
    const s = await S.load();
    $('dark').checked = s.dark.enabled;
    $('compact').checked = s.compact.enabled;
    $('darkSite').checked = (s.dark.excludedSites || []).includes(siteKey);
    $('darkSite').disabled = !onSharePoint || !s.dark.enabled;
    $('darkSite').parentElement.title = onSharePoint ? siteKey : 'Ouvre un site SharePoint pour utiliser cette option';
  }

  $('tab-fav').addEventListener('click', () => setTab('fav'));
  $('tab-rec').addEventListener('click', () => setTab('rec'));
  $('filter').addEventListener('input', render);
  $('filter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#panel a.item');
      if (first) first.dispatchEvent(new MouseEvent('click', { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
    }
  });
  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('dark').addEventListener('change', async (e) => {
    await S.update('dark.enabled', e.target.checked);
    loadToggles();
  });
  $('compact').addEventListener('change', (e) => S.update('compact.enabled', e.target.checked));
  $('darkSite').addEventListener('change', async (e) => {
    await S.update('dark.excludedSites', (list) => {
      const set = new Set(list || []);
      if (e.target.checked) set.add(siteKey);
      else set.delete(siteKey);
      return Array.from(set);
    });
  });

  await Promise.all([load(), loadToggles()]);
  $('filter').focus();
})();
