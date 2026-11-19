/*
 * 18 · Historique de versions lisible : liste des versions avec auteur, date, taille et
 * commentaire ; comparaison ligne à ligne pour les fichiers texte, ouverture côte à côte
 * dans deux fenêtres pour les autres formats.
 */
(function (g) {
  'use strict';
  const BSP = (g.BSP = g.BSP || {});
  const U = BSP.url;

  async function openCurrent() {
    if (!BSP.feature('versions')) return;
    const it = await BSP.actions.target();
    if (!it || it.kind !== 'file' || !it.path) {
      BSP.ui.toast('Ouvre ou sélectionne un fichier pour voir ses versions', 'warn');
      return;
    }
    return open(it);
  }

  function absVersionUrl(origin, webPath, rel) {
    const w = U.normalizePath(webPath || '/');
    return origin + U.encodePath((w === '/' ? '' : w) + '/' + rel);
  }

  async function open(item) {
    const origin = item.origin || location.origin;
    const name = U.basename(item.path);
    const ext = U.extension(name);
    const webPath = BSP.webPathFor(item.path);
    const { body } = BSP.ui.panel('Historique des versions', { subtitle: name, wide: true });
    body.appendChild(BSP.el('p', { class: 'muted', text: 'Chargement des versions…' }));

    let info;
    let list;
    try {
      [info, list] = await Promise.all([BSP.api.fileInfo(item.path, { origin, webPath, cache: false }), BSP.api.versions(item.path, { origin, webPath })]);
    } catch (e) {
      body.textContent = '';
      body.appendChild(
        BSP.el('p', {
          class: 'error',
          text: e.status === 403 ? 'Accès refusé à l’historique de ce fichier.' : 'Impossible de charger l’historique (' + (e.status || e.message) + ').',
        })
      );
      return;
    }

    const rows = [
      {
        label: info.UIVersionLabel || 'Actuelle',
        date: info.TimeLastModified,
        by: info.ModifiedBy && info.ModifiedBy.Title,
        size: Number(info.Length),
        url: U.fileUrl(origin, item.path),
        comment: '',
        current: true,
      },
    ].concat(
      list
        .slice()
        .sort((a, b) => new Date(b.Created) - new Date(a.Created))
        .filter((v) => !v.IsCurrentVersion)
        .map((v) => ({
          label: v.VersionLabel,
          date: v.Created,
          by: v.CreatedBy && v.CreatedBy.Title,
          size: Number(v.Size),
          url: absVersionUrl(origin, webPath, v.Url),
          comment: v.CheckInComment || '',
          current: false,
        }))
    );

    body.textContent = '';
    const canDiff = BSP.diff.isTextExtension(ext);
    body.appendChild(
      BSP.el('p', {
        class: 'muted',
        text:
          rows.length +
          ' version' +
          (rows.length > 1 ? 's' : '') +
          '. Coche deux versions pour les ' +
          (canDiff ? 'comparer ligne à ligne.' : 'ouvrir côte à côte (la comparaison ligne à ligne est réservée aux fichiers texte).'),
      })
    );

    const table = BSP.el('table', { class: 'versions' });
    table.appendChild(
      BSP.el('thead', null, [
        BSP.el('tr', null, ['', 'Version', 'Date', 'Par', 'Taille', 'Commentaire', ''].map((h) => BSP.el('th', { text: h }))),
      ])
    );
    const tbody = BSP.el('tbody');
    const checks = [];
    rows.forEach((r, i) => {
      const cb = BSP.el('input', { type: 'checkbox', 'aria-label': 'Choisir la version ' + r.label });
      if (i < 2) cb.checked = true;
      checks.push(cb);
      cb.addEventListener('change', () => {
        const on = checks.filter((c) => c.checked);
        if (on.length > 2) on.find((c) => c !== cb).checked = false;
        compareBtn.disabled = checks.filter((c) => c.checked).length !== 2;
      });
      const openLink = BSP.el('a', { href: r.url, target: '_blank', rel: 'noopener', text: 'Ouvrir', class: 'link' });
      const prev = rows[i + 1];
      const delta = prev && !isNaN(prev.size) && !isNaN(r.size) ? r.size - prev.size : null;
      tbody.appendChild(
        BSP.el('tr', { class: r.current ? 'current' : '' }, [
          BSP.el('td', null, [cb]),
          BSP.el('td', null, [BSP.el('strong', { text: r.label }), r.current ? BSP.el('span', { class: 'badge', text: 'actuelle' }) : null]),
          BSP.el('td', { text: BSP.formatDate(r.date) }),
          BSP.el('td', { text: r.by || '' }),
          BSP.el('td', { text: BSP.formatSize(r.size) + (delta ? ' (' + (delta > 0 ? '+' : '−') + BSP.formatSize(Math.abs(delta)) + ')' : '') }),
          BSP.el('td', { class: 'comment', text: r.comment }),
          BSP.el('td', null, [openLink]),
        ])
      );
    });
    table.appendChild(tbody);
    body.appendChild(BSP.el('div', { class: 'table-wrap' }, [table]));

    const out = BSP.el('div', { class: 'diff-out' });
    const compareBtn = BSP.el('button', { class: 'btn primary', type: 'button', text: canDiff ? 'Comparer les versions cochées' : 'Ouvrir côte à côte' });
    compareBtn.disabled = rows.length < 2;
    compareBtn.addEventListener('click', async () => {
      const chosen = rows.filter((r, i) => checks[i].checked).sort((a, b) => new Date(a.date) - new Date(b.date));
      if (chosen.length !== 2) return;
      if (canDiff) await showDiff(out, chosen[0], chosen[1]);
      else sideBySide(chosen[0].url, chosen[1].url);
    });
    const actions = BSP.el('div', { class: 'row-actions' }, [compareBtn]);
    if (canDiff && rows.length >= 2) {
      const sbs = BSP.el('button', { class: 'btn', type: 'button', text: 'Ouvrir côte à côte' });
      sbs.addEventListener('click', () => {
        const chosen = rows.filter((r, i) => checks[i].checked);
        if (chosen.length === 2) sideBySide(chosen[1].url, chosen[0].url);
      });
      actions.appendChild(sbs);
    }
    body.appendChild(actions);
    body.appendChild(out);
  }

  function sideBySide(a, b) {
    try {
      chrome.runtime.sendMessage({
        type: 'openSideBySide',
        urls: [a, b],
        screen: { left: screen.availLeft || 0, top: screen.availTop || 0, width: screen.availWidth, height: screen.availHeight },
      });
    } catch (e) {
      window.open(a, '_blank');
      window.open(b, '_blank');
    }
  }

  async function showDiff(out, older, newer) {
    out.textContent = '';
    out.appendChild(BSP.el('p', { class: 'muted', text: 'Téléchargement des deux versions…' }));
    let a;
    let b;
    try {
      [a, b] = await Promise.all([BSP.api.text(older.url), BSP.api.text(newer.url)]);
    } catch (e) {
      out.textContent = '';
      out.appendChild(BSP.el('p', { class: 'error', text: 'Impossible de télécharger les versions (' + (e.status || e.message) + ').' }));
      return;
    }
    const d = BSP.diff.diffLines(a, b);
    out.textContent = '';
    if (d.tooBig) {
      out.appendChild(BSP.el('p', { class: 'error', text: 'Fichiers trop volumineux ou trop différents pour être comparés ici.' }));
      return;
    }
    out.appendChild(
      BSP.el('div', { class: 'diff-head' }, [
        BSP.el('span', { text: 'Version ' + older.label + ' → ' + newer.label }),
        BSP.el('span', { class: 'add', text: '+' + d.added }),
        BSP.el('span', { class: 'del', text: '−' + d.removed }),
      ])
    );
    if (!d.added && !d.removed) {
      out.appendChild(BSP.el('p', { class: 'muted', text: 'Aucune différence de contenu.' }));
      return;
    }
    const pre = BSP.el('div', { class: 'diff' });
    for (const op of BSP.diff.hunks(d.ops, 3)) {
      if (op.type === 'skip') {
        pre.appendChild(BSP.el('div', { class: 'line skip', text: '··· ' + op.count + ' ligne' + (op.count > 1 ? 's' : '') + ' identique' + (op.count > 1 ? 's' : '') }));
        continue;
      }
      pre.appendChild(
        BSP.el('div', { class: 'line ' + op.type }, [
          BSP.el('span', { class: 'ln', text: op.a ? String(op.a) : '' }),
          BSP.el('span', { class: 'ln', text: op.b ? String(op.b) : '' }),
          BSP.el('span', { class: 'mark', text: op.type === 'add' ? '+' : op.type === 'del' ? '−' : ' ' }),
          BSP.el('span', { class: 'code', text: op.text }),
        ])
      );
    }
    out.appendChild(pre);
  }

  BSP.versions = { open, openCurrent, init() {} };
})(globalThis);
