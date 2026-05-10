(function () {
  const D = window.DATA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  // Derived stats
  const wins = D.rounds.filter((r) => /VITÓRIA/i.test(r.result)).length;
  const losses = D.rounds.filter((r) => /DERROTA/i.test(r.result)).length;
  const live = D.rounds.filter((r) => r.state !== 'Encerrada').length;
  const totalStars = D.rounds.reduce((a, r) => a + (r.starsUs || 0), 0);
  const totalDestr = D.rounds.length
    ? (D.rounds.reduce((a, r) => a + (r.destrUs || 0), 0) / D.rounds.length).toFixed(1)
    : 0;
  const triples = D.attacks.filter((a) => a.stars === 3).length;
  const triplePct = D.attacks.length ? Math.round((triples / D.attacks.length) * 100) : 0;
  const avgAttackDestr = D.attacks.length
    ? (D.attacks.reduce((a, x) => a + (x.destruction || 0), 0) / D.attacks.length).toFixed(1)
    : 0;
  const triplesAgainst = D.defenses.filter((d) => d.stars === 3).length;
  const holdPct = D.defenses.length ? Math.round(((D.defenses.length - triplesAgainst) / D.defenses.length) * 100) : 0;

  // Hero
  $('#clan-title').textContent = D.info.clanName;
  $('#clan-sub').textContent = D.info.subtitle || '';
  $('#hero-meta').appendChild(buildHeroMeta());
  $('#hero-stats').appendChild(buildHeroStats());
  $('#generated').textContent = D.info.generatedAt ? `Atualizado em ${D.info.generatedAt}` : '';
  document.title = `${D.info.clanName} · ${D.info.season || ''} · CWL`;

  function buildHeroMeta() {
    const wrap = el('div', { class: 'hero-meta' });
    if (D.info.tag) wrap.appendChild(el('span', { class: 'chip tag' }, D.info.tag));
    if (D.info.season) wrap.appendChild(el('span', { class: 'chip' }, `Temporada ${D.info.season}`));
    if (D.info.state) {
      const isLive = /guerra/i.test(D.info.state);
      wrap.appendChild(el('span', { class: 'chip ' + (isLive ? 'live' : '') }, D.info.state));
    }
    return wrap;
  }

  function buildHeroStats() {
    const wrap = el('div', { class: 'hero-stats' });
    const cards = [
      { label: 'Vitórias / Derrotas', value: `${wins} – ${losses}`, sub: live ? `${live} em andamento` : 'temporada' , cls: wins > losses ? 'win' : losses > wins ? 'loss' : '' },
      { label: '★ Totais', value: totalStars, sub: `em ${D.rounds.length} rodadas`, cls: 'gold' },
      { label: '% Destruição média', value: `${totalDestr}%`, sub: 'média por rodada' },
      { label: 'Triplos', value: `${triples}`, sub: `${triplePct}% dos ataques`, cls: 'gold' },
      { label: 'Defesa', value: `${holdPct}%`, sub: `${triplesAgainst} triplos sofridos` },
      { label: 'Jogadores', value: D.ranking.length, sub: `CV ${[...new Set(D.ranking.map(r => r.th))].sort((a,b)=>b-a).join(', ')}` },
    ];
    for (const c of cards) {
      wrap.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label' }, c.label),
        el('div', { class: 'stat-value ' + (c.cls || '') }, String(c.value)),
        el('div', { class: 'stat-sub' }, c.sub || ''),
      ]));
    }
    return wrap;
  }

  // Tabs
  $$('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const id = t.dataset.tab;
      $$('.panel').forEach((p) => p.classList.add('hidden'));
      $('#panel-' + id).classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // ---------- Overview panel ----------
  function renderOverview() {
    const root = $('#panel-overview');
    root.innerHTML = '';

    // Recent rounds preview
    root.appendChild(el('div', { class: 'section-title' }, 'Rodadas'));
    const grid = el('div', { class: 'rounds-grid' });
    D.rounds.forEach((r) => grid.appendChild(roundCard(r)));
    root.appendChild(grid);

    // Top 3 podium
    root.appendChild(el('div', { class: 'section-title' }, 'Pódio'));
    const podium = el('div', { class: 'podium' });
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['gold', '', ''];
    D.ranking.slice(0, 3).forEach((p, i) => {
      podium.appendChild(el('div', { class: 'podium-card ' + colors[i] }, [
        el('div', { class: 'podium-medal' }, medals[i]),
        el('div', { class: 'podium-name' }, p.player),
        el('div', { class: 'podium-score' }, fmt(p.score)),
        el('div', { class: 'podium-meta' }, `★ ${p.starsTotal} · ${p.avgDestr}% · CV ${p.th} · ${p.attacks}`),
      ]));
    });
    root.appendChild(podium);
  }

  function roundCard(r) {
    const isClosed = r.state === 'Encerrada';
    let cls = 'live';
    if (isClosed) cls = /VITÓRIA/i.test(r.result) ? 'win' : 'loss';
    const resCls = !isClosed ? 'result-live' : /VITÓRIA/i.test(r.result) ? 'result-win' : 'result-loss';

    return el('div', { class: 'round ' + cls }, [
      el('div', { class: 'round-head' }, [
        el('div', {}, [
          el('div', { class: 'round-num' }, r.round),
          el('div', { class: 'round-opp' }, 'vs ' + r.opponent),
        ]),
        el('div', { class: 'round-state' }, r.state),
      ]),
      el('div', { class: 'round-score' }, [
        el('div', { class: 'round-side' }, [
          el('div', { class: 'lbl' }, 'Nós'),
          el('div', { class: 'stars' }, '★ ' + (r.starsUs ?? '–')),
          el('div', { class: 'destr' }, (r.destrUs ?? 0) + '%'),
        ]),
        el('div', { class: 'round-vs' }, 'vs'),
        el('div', { class: 'round-side them' }, [
          el('div', { class: 'lbl' }, 'Eles'),
          el('div', { class: 'stars' }, '★ ' + (r.starsThem ?? '–')),
          el('div', { class: 'destr' }, (r.destrThem ?? 0) + '%'),
        ]),
      ]),
      el('div', { class: 'round-result ' + resCls }, r.result || ''),
    ]);
  }

  // ---------- Rounds panel ----------
  function renderRounds() {
    const root = $('#panel-rounds');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'section-title' }, `Todas as ${D.rounds.length} rodadas`));
    const grid = el('div', { class: 'rounds-grid' });
    D.rounds.forEach((r) => grid.appendChild(roundCard(r)));
    root.appendChild(grid);
  }

  // ---------- Ranking panel ----------
  function renderRanking() {
    const root = $('#panel-ranking');
    root.innerHTML = '';

    const cols = [
      { key: 'pos', label: '#', width: 50, render: (v) => posBadge(v) },
      { key: 'player', label: 'Jogador', render: (v) => el('strong', {}, String(v)) },
      { key: 'th', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v)) },
      { key: 'attacks', label: 'Ataques' },
      { key: 'starsTotal', label: '★', render: (v) => el('span', { class: 'stars-cell' }, '★ ' + v) },
      { key: 'triples', label: '★★★' },
      { key: 'twoStars', label: '★★' },
      { key: 'oneStar', label: '★' },
      { key: 'avgDestr', label: 'Destr. %', render: (v) => destBar(v) },
      { key: 'avgTime', label: 'T. médio' },
      { key: 'missed', label: 'Perdidos', render: (v) => v > 0 ? el('span', { class: 'pos', style: 'background:rgba(239,68,68,0.18);color:#fca5a5' }, String(v)) : '0' },
      { key: 'score', label: 'Pontuação', render: (v) => el('strong', { style: 'color:var(--gold-2)' }, fmt(v)) },
    ];

    const tbl = buildSortableTable(D.ranking, cols, { defaultSort: 'score', defaultDesc: true, search: 'player' });
    root.appendChild(tbl);
  }

  // ---------- Attacks panel ----------
  function renderAttacks() {
    renderBattleTable('#panel-attacks', D.attacks, true);
  }
  function renderDefenses() {
    renderBattleTable('#panel-defenses', D.defenses, false);
  }

  function renderBattleTable(panelSel, rows, isAttack) {
    const root = $(panelSel);
    root.innerHTML = '';

    const cols = [
      { key: 'round', label: 'Rodada' },
      { key: 'opponent', label: 'Adversário' },
      isAttack
        ? { key: 'attacker', label: 'Atacante (nós)', render: (v) => el('strong', {}, v) }
        : { key: 'defender', label: 'Defensor (nós)', render: (v) => el('strong', {}, v) },
      isAttack ? { key: 'attackerTh', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v)) }
               : { key: 'defenderTh', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v)) },
      isAttack ? { key: 'attackerPos', label: 'Pos.', render: (v) => el('span', { class: 'pos' }, String(v)) }
               : { key: 'defenderPos', label: 'Pos.', render: (v) => el('span', { class: 'pos' }, String(v)) },
      isAttack ? { key: 'defender', label: 'Defensor (eles)' }
               : { key: 'attacker', label: 'Atacante (eles)' },
      isAttack ? { key: 'defenderTh', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v)) }
               : { key: 'attackerTh', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v)) },
      isAttack ? { key: 'defenderPos', label: 'Pos.', render: (v) => el('span', { class: 'pos' }, String(v)) }
               : { key: 'attackerPos', label: 'Pos.', render: (v) => el('span', { class: 'pos' }, String(v)) },
      { key: 'stars', label: '★', render: (v) => starsCell(v) },
      { key: 'destruction', label: 'Destr.', render: (v) => destBar(v) },
      { key: 'duration', label: 'Duração', render: (v) => v != null ? v + 's' : '' },
    ];

    const filters = [
      { key: 'round', label: 'Rodada', values: uniq(rows.map((r) => r.round)) },
      { key: 'opponent', label: 'Adversário', values: uniq(rows.map((r) => r.opponent)) },
      { key: isAttack ? 'attacker' : 'defender', label: 'Jogador', values: uniq(rows.map((r) => r[isAttack ? 'attacker' : 'defender'])).sort() },
    ];

    const tbl = buildSortableTable(rows, cols, {
      defaultSort: 'round', defaultDesc: false,
      search: isAttack ? 'attacker' : 'defender', searchExtra: ['defender', 'attacker', 'opponent'],
      filters,
    });
    root.appendChild(tbl);
  }

  // ---------- Group panel ----------
  function renderGroup() {
    const root = $('#panel-group');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'section-title' }, `${D.groupClans.length} clãs no grupo`));
    const grid = el('div', { class: 'group-grid' });
    D.groupClans.forEach((c) => {
      grid.appendChild(el('div', { class: 'clan-card ' + (c.isUs ? 'us' : '') }, [
        c.isUs ? el('span', { class: 'us-badge' }, 'Nosso clã') : null,
        el('div', { class: 'name' }, c.name),
        el('div', { class: 'tag' }, c.tag || ''),
        el('div', { class: 'meta' }, [
          el('div', {}, [el('div', { class: 'lbl' }, 'Nível'), el('div', { class: 'val' }, String(c.level))]),
          el('div', {}, [el('div', { class: 'lbl' }, 'Membros'), el('div', { class: 'val' }, String(c.members))]),
        ]),
      ]));
    });
    root.appendChild(grid);
  }

  // ---------- Helpers ----------
  function uniq(arr) { return Array.from(new Set(arr.filter((x) => x != null))); }
  function fmt(n) {
    if (typeof n !== 'number') return n ?? '';
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }
  function posBadge(v) {
    let cls = 'pos';
    if (v === '🥇' || v === 1) cls += ' gold';
    else if (v === '🥈' || v === 2) cls += ' silver';
    else if (v === '🥉' || v === 3) cls += ' bronze';
    return el('span', { class: cls }, String(v));
  }
  function starsCell(n) {
    const stars = '★'.repeat(n) + '<span class="empty">' + '★'.repeat(3 - n) + '</span>';
    return el('span', { class: 'stars-cell', html: stars });
  }
  function destBar(v) {
    if (v == null) return el('span');
    const span = el('span', {});
    const pct = Math.max(0, Math.min(100, v));
    const bar = el('span', { class: 'dest-bar' + (pct >= 100 ? ' full' : '') });
    bar.appendChild(el('i', { style: `width:${pct}%` }));
    span.appendChild(bar);
    span.appendChild(el('span', {}, pct + '%'));
    return span;
  }

  function buildSortableTable(rows, cols, opts = {}) {
    const wrap = el('div', { class: 'table-wrap' });
    const header = el('div', { class: 'table-header' });
    const search = el('input', { class: 'search', type: 'search', placeholder: '🔎 Buscar…' });
    header.appendChild(search);

    const filterEls = {};
    if (opts.filters) {
      for (const f of opts.filters) {
        const sel = el('select', { class: 'select' });
        sel.appendChild(el('option', { value: '' }, 'Todos · ' + f.label));
        for (const v of f.values) sel.appendChild(el('option', { value: String(v) }, String(v)));
        sel.addEventListener('change', () => render());
        filterEls[f.key] = sel;
        header.appendChild(sel);
      }
    }
    wrap.appendChild(header);

    const tbl = el('table');
    const thead = el('thead');
    const trh = el('tr');
    let sortKey = opts.defaultSort || cols[0].key;
    let sortDesc = !!opts.defaultDesc;

    cols.forEach((c) => {
      const th = el('th', {}, [document.createTextNode(c.label), el('span', { class: 'arr' }, '▼')]);
      th.dataset.key = c.key;
      th.addEventListener('click', () => {
        if (sortKey === c.key) sortDesc = !sortDesc;
        else { sortKey = c.key; sortDesc = true; }
        render();
      });
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tbl.appendChild(thead);

    const tbody = el('tbody');
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    search.addEventListener('input', render);

    function render() {
      // sort headers visual
      $$('th', thead).forEach((th) => {
        th.classList.toggle('sorted', th.dataset.key === sortKey);
        const arr = th.querySelector('.arr');
        if (arr) arr.textContent = th.dataset.key === sortKey ? (sortDesc ? '▼' : '▲') : '▼';
      });

      const q = search.value.trim().toLowerCase();
      let data = rows.slice();

      if (q) {
        const keys = [opts.search, ...(opts.searchExtra || [])].filter(Boolean);
        data = data.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
      }
      for (const [k, sel] of Object.entries(filterEls)) {
        if (sel.value) data = data.filter((r) => String(r[k]) === sel.value);
      }

      // Sort: try numeric
      data.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        const na = typeof va === 'number' ? va : parseFloat(va);
        const nb = typeof vb === 'number' ? vb : parseFloat(vb);
        let cmp;
        if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
        return sortDesc ? -cmp : cmp;
      });

      tbody.innerHTML = '';
      for (const r of data) {
        const tr = el('tr');
        cols.forEach((c) => {
          const td = el('td');
          const v = r[c.key];
          const node = c.render ? c.render(v, r) : (v == null ? '' : String(v));
          if (typeof node === 'string') td.textContent = node;
          else td.appendChild(node);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      if (!data.length) {
        const tr = el('tr');
        tr.appendChild(el('td', { colspan: String(cols.length), style: 'text-align:center;color:var(--muted);padding:24px' }, 'Nenhum resultado'));
        tbody.appendChild(tr);
      }
    }

    render();
    return wrap;
  }

  // Init
  renderOverview();
  renderRounds();
  renderRanking();
  renderAttacks();
  renderDefenses();
  renderGroup();
})();
