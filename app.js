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

  // Aplica escudo do clã (badge oficial vindo da API) no ícone do header e favicon
  if (window.CLAN_DATA?.clan?.badgeUrls) {
    const b = window.CLAN_DATA.clan.badgeUrls;
    const badgeBig = b.large || b.medium || b.small;
    const badgeSmall = b.small || b.medium;
    const iconEl = document.querySelector('.brand-icon');
    if (iconEl && badgeBig) {
      iconEl.innerHTML = '';
      iconEl.classList.add('has-badge');
      iconEl.appendChild(el('img', { src: badgeBig, alt: 'escudo do clã' }));
      const lvl = window.CLAN_DATA.clan.level;
      if (lvl) iconEl.appendChild(el('span', { class: 'badge-level' }, String(lvl)));
    }
    const fav = document.getElementById('favicon');
    if (fav && badgeSmall) fav.href = badgeSmall;
  }

  // Hero — prioriza dados do clã (CLAN_DATA), com CWL como info secundária
  const C0 = window.CLAN_DATA;
  const clanName = C0?.clan?.name || D.info.clanName;
  $('#clan-title').textContent = clanName;
  if (C0?.clan) {
    const c = C0.clan;
    const subParts = [
      `Nível ${c.level}`,
      `${c.members}/50 membros`,
      c.location ? c.location : null,
      c.warFrequency ? `Guerra: ${warFreqPt(c.warFrequency)}` : null,
    ].filter(Boolean);
    $('#clan-sub').textContent = subParts.join(' · ');
  } else {
    $('#clan-sub').textContent = D.info.subtitle || '';
  }
  $('#hero-meta').appendChild(buildHeroMeta());
  $('#hero-stats').appendChild(buildHeroStats());
  $('#generated').textContent = (C0?.generatedAt || D.info.generatedAt) ? `Atualizado em ${C0?.generatedAt || D.info.generatedAt}` : '';
  document.title = `${clanName} · Clã & CWL`;

  function warFreqPt(s) {
    return ({ always: 'sempre', moreThanOncePerWeek: 'mais de 1×/sem', oncePerWeek: '1×/semana', lessThanOncePerWeek: 'rara', never: 'nunca', any: 'qualquer', unknown: '—' })[s] || s;
  }

  function buildHeroMeta() {
    const wrap = el('div', { class: 'hero-meta' });
    const clanTag = C0?.clan?.tag || D.info.tag;
    if (clanTag) wrap.appendChild(el('span', { class: 'chip tag' }, clanTag));
    if (D.info.season && D.info.state) {
      const isLive = /guerra/i.test(D.info.state);
      wrap.appendChild(el('span', { class: 'chip ' + (isLive ? 'live' : '') }, `🏆 CWL ${D.info.season} · ${D.info.state}`));
    }
    if (C0?.warlog?.stats) {
      const total = C0.warlog.stats.wins + C0.warlog.stats.losses + C0.warlog.stats.ties;
      const wr = total ? Math.round((C0.warlog.stats.wins / total) * 100) : 0;
      wrap.appendChild(el('span', { class: 'chip' }, `⚔ ${wr}% win rate`));
    }
    return wrap;
  }

  function buildHeroStats() {
    const wrap = el('div', { class: 'hero-stats' });
    const cards = [];

    if (C0?.clan) {
      const c = C0.clan;
      cards.push({ label: '👥 Membros', value: `${c.members}/50`, sub: `Nível ${c.level}`, cls: 'gold' });
      cards.push({ label: '🏆 Pontos do Clã', value: fmtNum(c.points), sub: 'troféus' });
      cards.push({ label: '⚔ Guerras vencidas', value: fmtNum(c.warWins ?? 0), sub: `${c.warTies ?? 0} empates · ${c.warLosses ?? 0} derrotas`, cls: 'win' });
      if ((c.warWinStreak ?? 0) > 0) {
        cards.push({ label: '🔥 Sequência atual', value: c.warWinStreak, sub: 'vitórias seguidas', cls: 'gold' });
      }
      cards.push({ label: '🏛 Capital', value: fmtNum(c.capitalPoints), sub: 'pontos' });
    }

    // Resumo da CWL atual (sempre visível, com destaque menor)
    cards.push({
      label: '🏆 CWL atual',
      value: `${wins}V – ${losses}D` + (live ? ` · ${live}↻` : ''),
      sub: `★${totalStars} · ${totalDestr}% destr.`,
      cls: wins > losses ? 'win' : losses > wins ? 'loss' : '',
    });

    if (C0?.roster?.length) {
      const active = C0.roster.filter((m) => m.activity?.level === 'active').length;
      const inactive = C0.roster.filter((m) => m.activity?.level === 'inactive').length;
      cards.push({
        label: '🟢 Atividade',
        value: `${active} ativos`,
        sub: `${inactive} sumidos · ${C0.roster.length - active - inactive} mornos`,
        cls: active > inactive ? 'win' : 'loss',
      });
    }

    if (!C0) {
      // fallback (sem dados de clã ainda) — usa stats CWL
      cards.push(
        { label: 'Vitórias / Derrotas', value: `${wins} – ${losses}`, sub: live ? `${live} em andamento` : 'CWL atual', cls: wins > losses ? 'win' : losses > wins ? 'loss' : '' },
        { label: '★ Totais', value: totalStars, sub: `em ${D.rounds.length} rodadas`, cls: 'gold' },
        { label: '% Destruição média', value: `${totalDestr}%`, sub: 'média por rodada' },
      );
    }

    for (const c of cards) {
      wrap.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label' }, c.label),
        el('div', { class: 'stat-value ' + (c.cls || '') }, String(c.value)),
        el('div', { class: 'stat-sub' }, c.sub || ''),
      ]));
    }
    return wrap;
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }

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

  // ---------- Overview panel (clean) ----------
  function renderOverview() {
    const root = $('#panel-overview');
    root.innerHTML = '';

    // 🔥 Top atacantes + participação (foco da página inicial)
    if (window.CLAN_DATA?.roster?.length) {
      root.appendChild(buildMonthHighlights());
    } else {
      // Sem clan-data ainda: pódio CWL como fallback
      root.appendChild(el('div', { class: 'section-title' }, '🏆 Pódio dos atacantes'));
      const podium = el('div', { class: 'podium' });
      const medals = ['🥇', '🥈', '🥉'];
      D.ranking.slice(0, 3).forEach((p, i) => {
        podium.appendChild(el('div', { class: 'podium-card ' + (i === 0 ? 'gold' : '') }, [
          el('div', { class: 'podium-medal' }, medals[i]),
          el('div', { class: 'podium-name' }, p.player),
          el('div', { class: 'podium-score' }, fmt(p.score)),
          el('div', { class: 'podium-meta' }, `★ ${p.starsTotal} · ${p.avgDestr}% · CV ${p.th} · ${p.attacks}`),
        ]));
      });
      root.appendChild(podium);
    }
  }

  // Strip compacto de bônus CWL — substitui o megabanner
  function buildBonusStrip() {
    const winners = bonusWinners();
    const wrap = el('section', { class: 'bonus-strip' });
    wrap.appendChild(el('div', { class: 'bonus-strip-head' }, [
      el('div', {}, [
        el('span', { class: 'bonus-eyebrow' }, '🎖 BÔNUS CWL'),
        el('span', { class: 'bonus-strip-sub' }, ` · top ${BONUS_N} levam o bônus`),
      ]),
      buildBonusControl(),
    ]));
    const list = el('div', { class: 'bonus-chips' });
    winners.forEach((p, i) => {
      list.appendChild(el('span', { class: 'bonus-chip-mini' + (i < 3 ? ' top' : '') }, [
        el('span', { class: 'bcm-rank' }, '#' + (i + 1)),
        el('span', { class: 'bcm-name' }, p.player),
        el('span', { class: 'bcm-meta' }, `★${p.starsTotal} · ${p.avgDestr}%`),
      ]));
    });
    wrap.appendChild(list);
    return wrap;
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

  // Recalcula atividade no frontend com pesos adaptativos
  // (corrige imediatamente sem esperar o próximo refresh do Action)
  function recomputeActivity(m) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r1 = (n) => Math.round(n * 10) / 10;
    const stats = {
      warExpected: m.warHistory?.attacksAvailable || 0,
      warUsed: m.warHistory?.attacksUsed || 0,
      cwlExpected: m.cwl?.expected || 0,
      cwlUsed: m.cwl?.used || 0,
      cwlStars: m.cwl?.stars || 0,
      donations: m.donations || 0,
      attackWins: m.attackWinsSeason || 0,
      defenseWins: m.defenseWinsSeason || 0,
      warStarsLifetime: m.warStarsLifetime || 0,
    };
    const comps = [];
    if (stats.warExpected > 0) comps.push({ key: 'warPart', value: clamp((stats.warUsed / stats.warExpected) * 100, 0, 100), weight: 0.40 });
    if (stats.cwlExpected > 0) {
      const v = clamp((stats.cwlUsed / stats.cwlExpected) * 80 + (stats.cwlStars / Math.max(stats.cwlExpected * 3, 1)) * 20, 0, 100);
      comps.push({ key: 'cwl', value: v, weight: 0.30 });
    }
    comps.push({ key: 'donations', value: clamp((stats.donations / 1500) * 100, 0, 100), weight: 0.25 });
    comps.push({ key: 'multi', value: clamp(((stats.attackWins + stats.defenseWins) / 200) * 100, 0, 100), weight: 0.15 });
    comps.push({ key: 'veteran', value: clamp((stats.warStarsLifetime / 1500) * 100, 0, 100), weight: 0.10 });
    const tw = comps.reduce((s, c) => s + c.weight, 0);
    const score = r1(comps.reduce((s, c) => s + c.value * c.weight, 0) / tw);
    let level = 'inactive';
    if (score >= 70) level = 'active';
    else if (score >= 40) level = 'warm';
    return { score, level };
  }
  if (C?.roster) C.roster.forEach((m) => { m.activity = recomputeActivity(m); });

  // Combina CWL + histórico de guerras para cada jogador
  function combineWarStats(m) {
    const cwlUsed = m.cwl?.used || 0;
    const cwlExp = m.cwl?.expected || 0;
    const cwlStars = m.cwl?.stars || 0;
    const cwlAvg = m.cwl?.avgDestr || 0;
    const histUsed = m.warHistory?.attacksUsed || 0;
    const histExp = m.warHistory?.attacksAvailable || 0;
    const histStars = m.warHistory?.stars || 0;
    const histAvg = m.warHistory?.avgDestr || 0;
    const totalUsed = cwlUsed + histUsed;
    const totalExp = cwlExp + histExp;
    const totalStars = cwlStars + histStars;
    const avgDestr = totalUsed
      ? ((cwlAvg * cwlUsed) + (histAvg * histUsed)) / totalUsed
      : 0;
    const partPct = totalExp ? (totalUsed / totalExp) * 100 : 0;
    return {
      used: totalUsed, expected: totalExp, stars: totalStars,
      avgDestr: Math.round(avgDestr * 10) / 10,
      participation: Math.round(partPct * 10) / 10,
    };
  }

  function buildMonthHighlights() {
    const wrap = el('section', {});

    const enriched = window.CLAN_DATA.roster.map((m) => ({ ...m, _w: combineWarStats(m) }));

    // Máximos no clã (para normalizar componentes 0-100)
    const maxOf = (key, fn) => {
      const max = Math.max(0, ...enriched.map((m) => fn(m) || 0));
      return max || 1;
    };
    const maxDonSent = maxOf('d', (m) => m.donations);
    const maxDonRecv = maxOf('dr', (m) => m.donationsReceived);
    const maxAtkWins = maxOf('aw', (m) => m.attackWinsSeason);

    // Score composto de participação: ataques de guerra + doações ↑↓ + ataques multi
    enriched.forEach((m) => {
      const wars = m._w.expected ? (m._w.used / m._w.expected) * 100 : 0;
      const dSent = (m.donations / maxDonSent) * 100;
      const dRecv = (m.donationsReceived / maxDonRecv) * 100;
      const atk = ((m.attackWinsSeason || 0) / maxAtkWins) * 100;
      m._partScore = Math.round(((wars + dSent + dRecv + atk) / 4) * 10) / 10;
      m._partBreakdown = {
        wars: Math.round(wars), dSent: Math.round(dSent), dRecv: Math.round(dRecv), atk: Math.round(atk),
      };
    });

    // Top atacantes — mais ★ (CWL + guerras), tiebreaker destruição
    const attackers = enriched
      .filter((m) => m._w.used > 0)
      .sort((a, b) => (b._w.stars - a._w.stars) || (b._w.avgDestr - a._w.avgDestr))
      .slice(0, 10);

    // Mais participativos — score composto
    const participators = [...enriched]
      .sort((a, b) => b._partScore - a._partScore)
      .slice(0, 10);

    // Top push — evolução de troféus
    const pushes = [...enriched]
      .filter((m) => m.trophyEvolution && (m.trophyEvolution.deltaSinceFirst != null || m.trophyEvolution.delta7d != null))
      .sort((a, b) => (b.trophyEvolution.delta7d || b.trophyEvolution.deltaSinceFirst || 0) - (a.trophyEvolution.delta7d || a.trophyEvolution.deltaSinceFirst || 0))
      .slice(0, 10);

    wrap.appendChild(el('div', { class: 'highlights-grid' }, [
      buildHighlightCard('🔥', 'Top atacantes', 'CWL + guerras normais', attackers, (m) => ({
        primary: '★ ' + m._w.stars,
        secondary: m._w.avgDestr + '% · ' + m._w.used + ' atq',
      })),
      buildHighlightCard('✅', 'Mais participativos', 'guerra + doações + ataques multi', participators, (m) => ({
        primary: m._partScore,
        secondary: `🛡${m._partBreakdown.wars} ↑${m._partBreakdown.dSent} ↓${m._partBreakdown.dRecv} ⚔${m._partBreakdown.atk}`,
      })),
      buildHighlightCard('📈', 'Top push', 'evolução de troféus', pushes, (m) => {
        const d7 = m.trophyEvolution?.delta7d;
        const dAll = m.trophyEvolution?.deltaSinceFirst;
        const main = d7 != null ? d7 : (dAll || 0);
        const arrow = main > 0 ? '+' : '';
        return {
          primary: arrow + main,
          secondary: `${m.trophies} 🏆${m.league ? ' · ' + m.league : ''}`,
        };
      }),
    ]));

    if (!pushes.length) {
      wrap.appendChild(el('div', { class: 'formula-note' },
        '📈 Evolução de troféus aparece após o segundo dia de coleta. Os snapshots começaram a ser salvos agora.'));
    }

    return wrap;
  }

  function buildHighlightCard(icon, title, subtitle, items, formatter) {
    const card = el('div', { class: 'hl-card' });
    card.appendChild(el('div', { class: 'hl-card-head' }, [
      el('div', { class: 'hl-card-icon' }, icon),
      el('div', {}, [
        el('div', { class: 'hl-card-title' }, title),
        el('div', { class: 'hl-card-sub' }, subtitle),
      ]),
    ]));
    if (!items.length) {
      card.appendChild(el('div', { class: 'hl-empty' }, 'Sem dados ainda.'));
      return card;
    }
    const list = el('ol', { class: 'hl-list' });
    items.forEach((m, i) => {
      const f = formatter(m);
      const li = el('li', { class: 'hl-item' + (i === 0 ? ' first' : '') }, [
        el('span', { class: 'hl-pos' }, i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '#' + (i + 1)))),
        el('span', { class: 'hl-player' }, [
          el('span', { class: 'hl-player-name' }, m.name),
          el('span', { class: 'hl-player-th' }, 'CV ' + (m.th ?? '?')),
        ]),
        el('span', { class: 'hl-primary' }, f.primary),
        el('span', { class: 'hl-secondary' }, f.secondary),
      ]);
      list.appendChild(li);
    });
    card.appendChild(list);
    return card;
  }
  function emptyInline(text) {
    return el('div', { class: 'hl-empty' }, text);
  }

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
    // Pré-calcula stats combinadas para sort funcionar
    const sorted = [...C.roster]
      .map((r) => ({ ...r, _warParticipation: combineWarStats(r).participation }))
      .sort((a, b) => b.activity.score - a.activity.score);

    const cols = [
      { key: 'rank', label: '#', render: (_, r, i) => el('span', { class: 'pos' }, String(i + 1)) },
      { key: 'name', label: 'Jogador', render: (v, r) => el('span', {}, [
        el('strong', {}, v),
        ...(r.role && r.role !== 'member' ? [el('span', { class: 'role-tag' }, roleLabel(r.role))] : []),
      ]) },
      { key: 'th', label: 'CV', render: (v) => el('span', { class: 'th-badge' }, String(v ?? '?')) },
      { key: 'activity.level', label: 'Status', render: (_, r) => activityBadge(r.activity) },
      { key: 'activity.score', label: 'Score', render: (_, r) => activityBar(r.activity.score) },
      { key: '_warParticipation', label: 'Guerras', render: (_, r) => {
        const w = combineWarStats(r);
        const txt = w.expected ? `${w.used}/${w.expected}` : '—';
        const pct = w.expected ? ` (${w.participation}%)` : '';
        return el('span', {}, [
          el('strong', {}, txt),
          el('span', { class: 'mono-mini muted' }, pct),
        ]);
      } },
      { key: 'cwl.stars', label: '★ CWL', render: (_, r) => r.cwl ? el('span', { class: 'stars-cell' }, '★ ' + r.cwl.stars) : el('span', { class: 'muted' }, '—') },
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

    // Toolbar com busca + filtros
    const toolbar = el('div', { class: 'roster-toolbar' });
    const search = el('input', { class: 'search', type: 'search', placeholder: '🔎 Buscar jogador…' });
    const fRole = el('select', { class: 'select' });
    [['', 'Todos · Função'], ['leader', 'Líder'], ['coLeader', 'Co-líder'], ['admin', 'Veterano'], ['member', 'Membro']]
      .forEach(([v, l]) => fRole.appendChild(el('option', { value: v }, l)));
    const fAct = el('select', { class: 'select' });
    [['', 'Todos · Status'], ['active', '🟢 Ativo'], ['warm', '🟡 Morno'], ['inactive', '🔴 Sumido']]
      .forEach(([v, l]) => fAct.appendChild(el('option', { value: v }, l)));
    const fWar = el('select', { class: 'select' });
    [['', 'Todos · War pref'], ['in', 'IN'], ['out', 'OUT']]
      .forEach(([v, l]) => fWar.appendChild(el('option', { value: v }, l)));
    toolbar.appendChild(search); toolbar.appendChild(fRole); toolbar.appendChild(fAct); toolbar.appendChild(fWar);
    root.appendChild(toolbar);

    const grid = el('div', { class: 'roster-grid' });
    root.appendChild(grid);

    const all = [...C.roster].sort((a, b) => (b.th || 0) - (a.th || 0) || b.trophies - a.trophies);
    const renderGrid = () => {
      const q = search.value.trim().toLowerCase();
      const filtered = all.filter((m) => {
        if (q && !String(m.name || '').toLowerCase().includes(q) && !String(m.tag || '').toLowerCase().includes(q)) return false;
        if (fRole.value && m.role !== fRole.value) return false;
        if (fAct.value && m.activity?.level !== fAct.value) return false;
        if (fWar.value && m.warPreference !== fWar.value) return false;
        return true;
      });
      grid.innerHTML = '';
      if (!filtered.length) {
        grid.appendChild(emptyInline('Nenhum jogador encontrado.'));
        return;
      }
      filtered.forEach((m) => grid.appendChild(memberCard(m)));
    };
    [search, fRole, fAct, fWar].forEach((e) => e.addEventListener('input', renderGrid));
    renderGrid();
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

    const search = el('input', { class: 'search', type: 'search', placeholder: '🔎 Buscar jogador…', style: 'margin-bottom:10px' });
    root.appendChild(search);

    const grid = el('div', { class: 'capital-grid' });
    root.appendChild(grid);

    const eligible = sorted.filter((m) => (m.capital?.looted || 0) > 0);
    const renderCapList = () => {
      const q = search.value.trim().toLowerCase();
      const filtered = q ? eligible.filter((m) => String(m.name).toLowerCase().includes(q)) : eligible;
      grid.innerHTML = '';
      filtered.slice(0, 50).forEach((m, i) => {
        const pct = Math.round(((m.capital?.looted || 0) / topLoot) * 100);
        const realRank = eligible.indexOf(m) + 1;
        grid.appendChild(el('div', { class: 'cap-card' }, [
          el('div', { class: 'cap-rank' }, '#' + realRank),
          el('div', { class: 'cap-info' }, [
            el('div', { class: 'cap-name' }, m.name),
            el('div', { class: 'cap-stats mono-mini muted' }, `${m.capital.attacks} ataques`),
          ]),
          el('div', { class: 'cap-bar' }, [el('i', { style: `width:${pct}%` })]),
          el('div', { class: 'cap-val' }, fmt(m.capital.looted)),
        ]));
      });
      if (!filtered.length) grid.appendChild(emptyInline('Nenhum jogador encontrado.'));
    };
    search.addEventListener('input', renderCapList);
    renderCapList();

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
