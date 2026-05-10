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

  // ---------- Reordena ranking: ★ → % destruição → tempo ----------
  const _avgTimeSec = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
  D.ranking.sort((a, b) => {
    if ((b.starsTotal || 0) !== (a.starsTotal || 0)) return (b.starsTotal || 0) - (a.starsTotal || 0);
    if ((b.avgDestr || 0) !== (a.avgDestr || 0)) return (b.avgDestr || 0) - (a.avgDestr || 0);
    return _avgTimeSec(a.avgTime) - _avgTimeSec(b.avgTime);
  });
  D.ranking.forEach((p, i) => { p.pos = i + 1; });

  // ---------- Bônus CWL ----------
  const BONUS_KEY = 'bravus_bonus_count';
  let BONUS_N = parseInt(localStorage.getItem(BONUS_KEY) || '8', 10);
  function isEligible(p) {
    const att = String(p.attacks || '');
    const used = parseInt(att.split('/')[0], 10) || 0;
    return used > 0;
  }
  function bonusWinners() {
    return D.ranking.filter(isEligible).slice(0, BONUS_N);
  }
  function isBonus(player) {
    return bonusWinners().some((w) => w.player === player.player && w.pos === player.pos);
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

    // ⭐ Bônus CWL — destaque máximo no topo
    root.appendChild(buildBonusSpotlight());

    // Top 3 pódio
    root.appendChild(el('div', { class: 'section-title' }, '🏆 Pódio dos atacantes'));
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

    // Rodadas
    root.appendChild(el('div', { class: 'section-title' }, '📜 Rodadas'));
    const grid = el('div', { class: 'rounds-grid' });
    D.rounds.forEach((r) => grid.appendChild(roundCard(r)));
    root.appendChild(grid);
  }

  function buildBonusSpotlight() {
    const winners = bonusWinners();
    const wrap = el('section', { class: 'bonus-hero' });

    const head = el('div', { class: 'bonus-head' }, [
      el('div', {}, [
        el('div', { class: 'bonus-eyebrow' }, '🎖️ Bônus CWL · Temporada ' + (D.info.season || '')),
        el('div', { class: 'bonus-title' }, 'Quem leva os bônus'),
        el('div', { class: 'bonus-sub' }, `Os ${BONUS_N} melhores do ranking recebem o bônus de medalhas da CWL. Líderes: definam o pagamento conforme essa lista.`),
      ]),
      buildBonusControl(),
    ]);
    wrap.appendChild(head);

    const list = el('div', { class: 'bonus-list' });
    winners.forEach((p, i) => {
      list.appendChild(el('div', { class: 'bonus-card ' + (i < 3 ? 'top' : '') }, [
        el('div', { class: 'bonus-rank' }, '#' + (i + 1)),
        el('div', { class: 'bonus-info' }, [
          el('div', { class: 'bonus-name' }, p.player),
          el('div', { class: 'bonus-stats' }, `★ ${p.starsTotal} · ${p.avgDestr}% · CV ${p.th} · ${p.attacks}`),
        ]),
        el('div', { class: 'bonus-score' }, [
          el('div', { class: 'bonus-score-val' }, fmt(p.score)),
          el('div', { class: 'bonus-score-lbl' }, 'pontos'),
        ]),
        el('div', { class: 'bonus-medal' }, '🎖'),
      ]));
    });
    wrap.appendChild(list);

    // Próximos da fila (não receberão)
    const others = D.ranking.filter(isEligible).slice(BONUS_N, BONUS_N + 3);
    if (others.length) {
      wrap.appendChild(el('div', { class: 'bonus-next' }, [
        el('span', { class: 'bonus-next-lbl' }, 'Próximos da fila (sem bônus):'),
        ...others.map((p) => el('span', { class: 'bonus-next-chip' }, `#${p.pos} ${p.player} · ${fmt(p.score)}`)),
      ]));
    }
    return wrap;
  }

  function buildBonusControl() {
    const wrap = el('div', { class: 'bonus-control' });
    wrap.appendChild(el('label', { class: 'bonus-control-lbl' }, 'Nº de bônus'));
    const sel = el('select', { class: 'select bonus-select' });
    [3, 4, 5, 6, 7, 8].forEach((n) => {
      const o = el('option', { value: String(n) }, String(n));
      if (n === BONUS_N) o.setAttribute('selected', 'selected');
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      BONUS_N = parseInt(sel.value, 10);
      localStorage.setItem(BONUS_KEY, String(BONUS_N));
      renderOverview();
      renderRanking();
    });
    wrap.appendChild(sel);
    return wrap;
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
    const root = $('#panel-cwl-rounds');
    if (!root) return;
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

    // Banner de bônus
    const winners = bonusWinners();
    const banner = el('div', { class: 'rank-banner' }, [
      el('div', { class: 'rank-banner-left' }, [
        el('div', { class: 'rank-banner-eyebrow' }, '🎖️ Bônus CWL'),
        el('div', { class: 'rank-banner-title' }, `Top ${BONUS_N} recebem o bônus`),
        el('div', { class: 'rank-banner-sub' }, 'Linhas destacadas em dourado abaixo são as elegíveis.'),
      ]),
      el('div', { class: 'rank-banner-right' }, winners.map((p, i) => el('span', { class: 'rank-chip' }, `${i + 1}. ${p.player}`))),
      buildBonusControl(),
    ]);
    root.appendChild(banner);

    const cols = [
      { key: 'pos', label: '#', width: 50, render: (v, r) => posBadge(v, r) },
      { key: 'player', label: 'Jogador', render: (v, r) => {
        const node = el('span', {}, [el('strong', {}, String(v))]);
        if (isBonus(r)) node.appendChild(el('span', { class: 'bonus-tag', title: 'Recebe bônus de medalhas CWL' }, '🎖 Bônus'));
        return node;
      } },
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

    const tbl = buildSortableTable(D.ranking, cols, {
      defaultSort: 'pos', defaultDesc: false, search: 'player',
      rowClass: (r) => isBonus(r) ? 'bonus-row' : '',
    });
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
    let label = String(v);
    if (v === '🥇' || v === 1) { cls += ' gold'; label = '🥇'; }
    else if (v === '🥈' || v === 2) { cls += ' silver'; label = '🥈'; }
    else if (v === '🥉' || v === 3) { cls += ' bronze'; label = '🥉'; }
    return el('span', { class: cls }, label);
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
    const getVal = opts.getValue || ((r, k) => r[k]);
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
        const va = getVal(a, sortKey), vb = getVal(b, sortKey);
        const na = typeof va === 'number' ? va : parseFloat(va);
        const nb = typeof vb === 'number' ? vb : parseFloat(vb);
        let cmp;
        if (!Number.isNaN(na) && !Number.isNaN(nb)) cmp = na - nb;
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
        return sortDesc ? -cmp : cmp;
      });

      tbody.innerHTML = '';
      data.forEach((r, idx) => {
        const extraCls = opts.rowClass ? opts.rowClass(r) : '';
        const tr = el('tr', extraCls ? { class: extraCls } : {});
        cols.forEach((c) => {
          const td = el('td');
          const v = getVal(r, c.key);
          const node = c.render ? c.render(v, r, idx) : (v == null ? '' : String(v));
          if (typeof node === 'string') td.textContent = node;
          else td.appendChild(node);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
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

  // ============================================================
  // V2 — Visão de Clã (atividade, roster, war log, capital)
  // ============================================================
  const C = window.CLAN_DATA;

  function emptyState(text, icon = '⏳') {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'empty-icon' }, icon),
      el('div', { class: 'empty-text' }, text),
    ]);
  }

  // ---------- Atividade ----------
  function renderActivity() {
    const root = $('#panel-activity');
    root.innerHTML = '';
    if (!C) { root.appendChild(emptyState('Dados do clã ainda não foram coletados. Aguarde o próximo refresh do GitHub Actions.')); return; }

    const totals = {
      active: C.roster.filter((r) => r.activity.level === 'active').length,
      warm: C.roster.filter((r) => r.activity.level === 'warm').length,
      inactive: C.roster.filter((r) => r.activity.level === 'inactive').length,
    };
    root.appendChild(el('div', { class: 'activity-summary' }, [
      summaryCard('🟢 Ativos', totals.active, 'score ≥ 70', 'good'),
      summaryCard('🟡 Mornos', totals.warm, 'score 40–69', 'warn'),
      summaryCard('🔴 Sumidos', totals.inactive, 'score < 40', 'bad'),
      summaryCard('📊 Guerras na base', C.historyStats.warsRecorded, 'salvas no histórico'),
    ]));

    // Ordenado por score desc
    const sorted = [...C.roster].sort((a, b) => b.activity.score - a.activity.score);

    const cols = [
      { key: 'rank', label: '#', render: (_, r, i) => el('span', { class: 'pos' }, String(i + 1)) },
      { key: 'name', label: 'Jogador', render: (v, r) => el('span', {}, [
        el('strong', {}, v),
        ...(r.role && r.role !== 'member' ? [el('span', { class: 'role-tag' }, roleLabel(r.role))] : []),
      ]) },
      { key: 'th', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v ?? '?')) },
      { key: 'activity.level', label: 'Status', render: (_, r) => activityBadge(r.activity) },
      { key: 'activity.score', label: 'Score', render: (_, r) => activityBar(r.activity.score) },
      { key: 'warHistory.participation', label: 'Guerras', render: (_, r) => el('span', {}, [
        el('strong', {}, r.warHistory.attacks + ' '),
        el('span', { class: 'mono-mini' }, `(${r.warHistory.participation}%)`),
      ]) },
      { key: 'cwl.used', label: 'CWL', render: (_, r) => r.cwl ? el('span', {}, `${r.cwl.used}/${r.cwl.expected} · ★${r.cwl.stars}`) : el('span', { class: 'muted' }, '—') },
      { key: 'donations', label: 'Doações ↑', render: (v) => el('span', { class: 'mono-mini' }, fmt(v)) },
      { key: 'donationsReceived', label: 'Doações ↓', render: (v) => el('span', { class: 'mono-mini' }, fmt(v)) },
      { key: 'attackWinsSeason', label: 'Multi (atq)' },
      { key: 'warStarsLifetime', label: '★ Lifetime', render: (v) => el('span', { class: 'stars-cell' }, '★ ' + fmt(v)) },
      { key: 'warPreference', label: 'War', render: (v) => warPrefBadge(v) },
    ];

    const tbl = buildSortableTable(sorted, cols, {
      defaultSort: 'activity.score', defaultDesc: true, search: 'name',
      rowClass: (r) => 'act-' + r.activity.level,
      // suporte a chaves "a.b" no get
      getValue: (r, k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), r),
    });
    root.appendChild(tbl);

    // Legenda da fórmula
    root.appendChild(el('div', { class: 'formula-note' }, [
      el('strong', {}, 'Como calculamos: '),
      'Atividade = 40% participação em guerra · 25% doações · 15% vitórias multiplayer · 10% CWL · 10% war stars lifetime',
    ]));
  }

  function summaryCard(title, value, sub, kind = '') {
    return el('div', { class: 'sum-card ' + kind }, [
      el('div', { class: 'sum-title' }, title),
      el('div', { class: 'sum-value' }, String(value)),
      el('div', { class: 'sum-sub' }, sub),
    ]);
  }
  function activityBadge(a) {
    const map = { active: ['🟢', 'Ativo'], warm: ['🟡', 'Morno'], inactive: ['🔴', 'Sumido'] };
    const [emoji, label] = map[a.level] || ['⚪', '—'];
    return el('span', { class: 'act-badge act-' + a.level }, `${emoji} ${label}`);
  }
  function activityBar(score) {
    const wrap = el('span', {});
    const bar = el('span', { class: 'act-bar' });
    const pct = Math.max(0, Math.min(100, score));
    bar.appendChild(el('i', { style: `width:${pct}%` }));
    wrap.appendChild(bar);
    wrap.appendChild(el('span', { class: 'mono-mini' }, ' ' + score));
    return wrap;
  }
  function warPrefBadge(p) {
    if (p === 'in') return el('span', { class: 'pref pref-in' }, 'IN');
    if (p === 'out') return el('span', { class: 'pref pref-out' }, 'OUT');
    return el('span', { class: 'pref' }, '—');
  }
  function roleLabel(r) {
    return ({ leader: 'Líder', coLeader: 'Co-líder', admin: 'Veterano', member: 'Membro' })[r] || r;
  }

  // ---------- Clã (roster) ----------
  function renderClan() {
    const root = $('#panel-clan');
    root.innerHTML = '';
    if (!C) { root.appendChild(emptyState('Dados do clã ainda não foram coletados.')); return; }

    const c = C.clan;
    root.appendChild(el('div', { class: 'clan-header' }, [
      el('div', {}, [
        el('div', { class: 'clan-h-title' }, c.name + ' '),
        el('div', { class: 'clan-h-sub' }, `${c.tag} · Nível ${c.level} · ${c.members} membros · ${c.points} pts`),
        c.description ? el('div', { class: 'clan-h-desc' }, c.description) : null,
      ]),
      el('div', { class: 'clan-h-stats' }, [
        miniStat('Guerras vencidas', c.warWins ?? '—'),
        miniStat('Sequência', c.warWinStreak ?? '—'),
        miniStat('Frequência', c.warFrequency || '—'),
        miniStat('Capital', fmt(c.capitalPoints)),
      ]),
    ]));

    root.appendChild(el('div', { class: 'section-title' }, 'Membros'));
    const grid = el('div', { class: 'roster-grid' });
    const sorted = [...C.roster].sort((a, b) => (b.th || 0) - (a.th || 0) || b.trophies - a.trophies);
    sorted.forEach((m) => grid.appendChild(memberCard(m)));
    root.appendChild(grid);
  }

  function miniStat(label, value) {
    return el('div', { class: 'mini-stat' }, [
      el('div', { class: 'mini-lbl' }, label),
      el('div', { class: 'mini-val' }, String(value)),
    ]);
  }

  function memberCard(m) {
    const heroLine = (m.heroes.levels || []).map((h) => {
      const short = ({ 'Barbarian King': 'BK', 'Archer Queen': 'AQ', 'Grand Warden': 'GW', 'Royal Champion': 'RC', 'Minion Prince': 'MP' })[h.name] || h.name.slice(0, 2);
      const pct = h.max ? (h.level / h.max) : 0;
      const cls = pct >= 1 ? 'maxed' : pct >= 0.85 ? 'good' : pct >= 0.6 ? 'warn' : 'bad';
      return el('span', { class: 'hero ' + cls, title: `${h.name} ${h.level}/${h.max}` }, `${short} ${h.level}`);
    });

    return el('div', { class: 'member-card act-' + m.activity.level }, [
      el('div', { class: 'm-head' }, [
        el('div', {}, [
          el('div', { class: 'm-name' }, [
            el('strong', {}, m.name),
            m.role !== 'member' ? el('span', { class: 'role-tag' }, roleLabel(m.role)) : null,
          ]),
          el('div', { class: 'm-tag' }, m.tag),
        ]),
        el('div', { class: 'm-th' }, [
          el('span', { class: 'th-badge big' }, 'CV ' + (m.th ?? '?')),
        ]),
      ]),
      el('div', { class: 'm-row' }, [
        miniStat('🏆 Troféus', fmt(m.trophies)),
        miniStat('★ War lifetime', fmt(m.warStarsLifetime)),
        miniStat('War pref', m.warPreference === 'in' ? 'IN' : (m.warPreference === 'out' ? 'OUT' : '—')),
      ]),
      el('div', { class: 'm-row' }, [
        miniStat('Doações ↑', fmt(m.donations)),
        miniStat('Doações ↓', fmt(m.donationsReceived)),
        miniStat('Saldo', (m.donationBalance >= 0 ? '+' : '') + fmt(m.donationBalance)),
      ]),
      heroLine.length ? el('div', { class: 'heroes' }, heroLine) : null,
      el('div', { class: 'progress-row' }, [
        progressBar('Heróis', m.heroes.progress),
        progressBar('Tropas', m.troopsPct),
        progressBar('Feitiços', m.spellsPct),
      ]),
      el('div', { class: 'activity-row' }, [
        activityBadge(m.activity),
        el('span', { class: 'm-score' }, 'score ' + m.activity.score),
        m.warHistory.attacksAvailable > 0
          ? el('span', { class: 'mono-mini muted' }, `${m.warHistory.participation}% guerras (${m.warHistory.attacks})`)
          : el('span', { class: 'mono-mini muted' }, 'sem histórico'),
      ]),
    ]);
  }

  function progressBar(label, pct) {
    const cls = pct >= 95 ? 'maxed' : pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad';
    return el('div', { class: 'pb' }, [
      el('div', { class: 'pb-lbl' }, [el('span', {}, label), el('span', { class: 'mono-mini' }, pct + '%')]),
      el('div', { class: 'pb-bar ' + cls }, [el('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` })]),
    ]);
  }

  // ---------- War log ----------
  function renderWarlog() {
    const root = $('#panel-warlog');
    root.innerHTML = '';
    if (!C) { root.appendChild(emptyState('Dados do clã ainda não foram coletados.')); return; }
    if (!C.warlog.public) {
      root.appendChild(emptyState('O war log do clã está privado. Peça ao líder pra deixar público em Configurações do Clã para ver o histórico aqui.', '🔒'));
      return;
    }
    const { wins, losses, ties } = C.warlog.stats;
    const total = wins + losses + ties;
    const winRate = total ? Math.round((wins / total) * 100) : 0;

    root.appendChild(el('div', { class: 'activity-summary' }, [
      summaryCard('🏆 Vitórias', wins, 'guerras normais', 'good'),
      summaryCard('💀 Derrotas', losses, '', 'bad'),
      summaryCard('🤝 Empates', ties, ''),
      summaryCard('Win rate', winRate + '%', `de ${total} guerras`),
    ]));

    root.appendChild(el('div', { class: 'section-title' }, `Últimas ${C.warlog.summary.length} guerras`));

    const cols = [
      { key: 'endTime', label: 'Quando', render: (v) => el('span', { class: 'mono-mini' }, fmtWarDate(v)) },
      { key: 'opponent', label: 'Adversário', render: (v) => el('strong', {}, v) },
      { key: 'teamSize', label: 'Tam.' },
      { key: 'starsUs', label: '★ Nós', render: (v) => el('span', { class: 'stars-cell' }, '★ ' + v) },
      { key: 'starsThem', label: '★ Eles' },
      { key: 'destrUs', label: '% Nós', render: (v) => destBar(v) },
      { key: 'destrThem', label: '% Eles', render: (v) => destBar(v) },
      { key: 'result', label: 'Resultado', render: (v) => warResultBadge(v) },
    ];
    root.appendChild(buildSortableTable(C.warlog.summary, cols, {
      defaultSort: 'endTime', defaultDesc: true, search: 'opponent',
      rowClass: (r) => 'wl-' + r.result,
    }));
  }
  function fmtWarDate(s) {
    if (!s) return '';
    const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
    if (!m) return s;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  function warResultBadge(r) {
    const map = { win: ['result-win', 'VITÓRIA'], lose: ['result-loss', 'DERROTA'], tie: ['result-live', 'EMPATE'] };
    const [cls, label] = map[r] || ['', r];
    return el('span', { class: 'round-result ' + cls }, label);
  }

  // ---------- Capital ----------
  function renderCapital() {
    const root = $('#panel-capital');
    root.innerHTML = '';
    if (!C) { root.appendChild(emptyState('Dados do clã ainda não foram coletados.')); return; }
    if (!C.capital || !C.capital.seasons.length) {
      root.appendChild(emptyState('Sem dados de Capital Raid disponíveis.', '🏛'));
      return;
    }

    // Ranking de contribuição (consolidado no fetcher dentro de roster.capital.looted)
    const sorted = [...C.roster].sort((a, b) => (b.capital?.looted || 0) - (a.capital?.looted || 0));
    const topLoot = sorted[0]?.capital?.looted || 1;

    root.appendChild(el('div', { class: 'section-title' }, 'Top contribuintes (últimas temporadas)'));
    const grid = el('div', { class: 'capital-grid' });
    sorted.filter((m) => (m.capital?.looted || 0) > 0).slice(0, 30).forEach((m, i) => {
      const pct = Math.round(((m.capital?.looted || 0) / topLoot) * 100);
      grid.appendChild(el('div', { class: 'cap-card' }, [
        el('div', { class: 'cap-rank' }, '#' + (i + 1)),
        el('div', { class: 'cap-info' }, [
          el('div', { class: 'cap-name' }, m.name),
          el('div', { class: 'cap-stats mono-mini muted' }, `${m.capital.attacks} ataques`),
        ]),
        el('div', { class: 'cap-bar' }, [el('i', { style: `width:${pct}%` })]),
        el('div', { class: 'cap-val' }, fmt(m.capital.looted)),
      ]));
    });
    root.appendChild(grid);

    // Histórico de temporadas
    root.appendChild(el('div', { class: 'section-title' }, 'Temporadas recentes'));
    const seasonRows = C.capital.seasons.map((s) => ({
      season: fmtWarDate(s.startTime) + ' → ' + fmtWarDate(s.endTime),
      capitalTotalLoot: s.capitalTotalLoot, raidsCompleted: s.raidsCompleted,
      offensiveReward: s.offensiveReward, defensiveReward: s.defensiveReward,
    }));
    root.appendChild(buildSortableTable(seasonRows, [
      { key: 'season', label: 'Temporada' },
      { key: 'capitalTotalLoot', label: 'Loot total', render: (v) => fmt(v) },
      { key: 'raidsCompleted', label: 'Raids' },
      { key: 'offensiveReward', label: 'Recompensa atq.' },
      { key: 'defensiveReward', label: 'Recompensa def.' },
    ], { defaultSort: 'season', defaultDesc: true, search: 'season' }));
  }

  renderActivity();
  renderClan();
  renderWarlog();
  renderCapital();
})();
