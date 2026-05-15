// Coleta dados completos do clã (membros, war log, capital raid, guerra atual)
// e mantém histórico de guerras normais em history/wars/<endTime>.json.
// Saída: clan-data.js / clan-data.json + atualização de hash em index.html.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.COC_TOKEN;
const CLAN_TAG = (process.env.CLAN_TAG || '#2Q9RYP8QC').toUpperCase();
const BASE = process.env.COC_API || 'https://cocproxy.royaleapi.dev/v1';
const ROOT = __dirname;
const HIST_DIR = path.join(ROOT, 'history', 'wars');

if (!TOKEN) { console.error('ERR: COC_TOKEN não definido.'); process.exit(1); }

const enc = (t) => encodeURIComponent(t.startsWith('#') ? t : '#' + t);
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDt = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

async function api(p, { allow404 = false } = {}) {
  const res = await fetch(BASE + p, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (res.status === 404 && allow404) return null;
  if (res.status === 403 && allow404) return null; // war log privado etc.
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${p}\n${t.slice(0, 200)}`);
  }
  return res.json();
}

// ----- Histórico de guerras normais -----
function ensureHistDir() { fs.mkdirSync(HIST_DIR, { recursive: true }); }
function loadHistory() {
  ensureHistDir();
  const files = fs.readdirSync(HIST_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8')));
}
function saveWarSnapshot(war) {
  // Persiste apenas guerras encerradas (warEnded) e somente uma vez.
  if (war.state !== 'warEnded' || !war.endTime) return false;
  const id = war.endTime.replace(/[^0-9]/g, '');
  const file = path.join(HIST_DIR, id + '.json');
  if (fs.existsSync(file)) return false;
  ensureHistDir();
  fs.writeFileSync(file, JSON.stringify(war, null, 2));
  return true;
}

// ----- Helpers de derivação -----
function heroSummary(player) {
  const heroes = (player.heroes || []).filter((h) => h.village === 'home');
  if (!heroes.length) return { progress: 0, levels: [], maxed: 0, total: 0 };
  const total = heroes.length;
  const sumLvl = heroes.reduce((s, h) => s + (h.level || 0), 0);
  const sumMax = heroes.reduce((s, h) => s + (h.maxLevel || 0), 0);
  const progress = sumMax ? round1((sumLvl / sumMax) * 100) : 0;
  const maxed = heroes.filter((h) => h.level >= h.maxLevel).length;
  const levels = heroes.map((h) => ({ name: h.name, level: h.level, max: h.maxLevel }));
  return { progress, levels, maxed, total };
}
function troopProgress(player) {
  const home = (player.troops || []).filter((t) => t.village === 'home' && !t.superTroopIsActive);
  if (!home.length) return 0;
  const sum = home.reduce((s, t) => s + (t.level || 0), 0);
  const max = home.reduce((s, t) => s + (t.maxLevel || 0), 0);
  return max ? round1((sum / max) * 100) : 0;
}
function spellProgress(player) {
  const home = (player.spells || []).filter((s) => s.village === 'home');
  if (!home.length) return 0;
  const sum = home.reduce((s, x) => s + (x.level || 0), 0);
  const max = home.reduce((s, x) => s + (x.maxLevel || 0), 0);
  return max ? round1((sum / max) * 100) : 0;
}
function achievementValue(p, name) {
  const a = (p.achievements || []).find((x) => x.name === name);
  return a ? a.value : 0;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function leagueTierOrder(leagueTier) {
  const id = Number(leagueTier?.id) || 0;
  if (id >= 105000000) return id - 105000000;
  return 0;
}
function leagueTierKey(leagueTier) {
  const name = String(leagueTier?.name || '').toLowerCase();
  const match = name.match(/^[a-z.]+/i);
  return match ? match[0].replace(/[^a-z]/g, '') : 'unknown';
}
function currentRankedFromProfile(player) {
  if (!player?.leagueTier) return null;
  return {
    leagueTierId: player.leagueTier.id,
    league: player.leagueTier.name,
    leagueKey: leagueTierKey(player.leagueTier),
    leagueOrder: leagueTierOrder(player.leagueTier),
    trophies: player.legendStatistics?.currentSeason?.trophies ?? player.trophies ?? 0,
    iconUrls: player.leagueTier.iconUrls || null,
    currentLeagueGroupTag: player.currentLeagueGroupTag || null,
    currentLeagueSeasonId: player.currentLeagueSeasonId || null,
    previousLeagueGroupTag: player.previousLeagueGroupTag || null,
    previousLeagueSeasonId: player.previousLeagueSeasonId || null,
  };
}

// ----- Score de atividade (pesos adaptativos: componentes sem dado saem da conta) -----
function activityScore(stats) {
  const components = [];
  // Participação em guerra normal: só conta se já temos histórico coletado
  if (stats.warExpected > 0) {
    const v = clamp((stats.warUsed / stats.warExpected) * 100, 0, 100);
    components.push({ key: 'warPart', value: v, weight: 0.40 });
  }
  // CWL atual: peso maior (sobe pra 0.30 quando ativo, vs 0.10 fora de CWL)
  if (stats.cwlExpected > 0) {
    const partPct = (stats.cwlUsed / stats.cwlExpected) * 80;
    const starsPct = (stats.cwlStars / Math.max(stats.cwlExpected * 3, 1)) * 20;
    const v = clamp(partPct + starsPct, 0, 100);
    components.push({ key: 'cwl', value: v, weight: 0.30 });
  }
  // Doações da temporada (1500+ = 100)
  components.push({ key: 'donations', value: clamp((stats.donations / 1500) * 100, 0, 100), weight: 0.25 });
  // Vitórias multiplayer da temporada
  components.push({ key: 'multi', value: clamp(((stats.attackWins + stats.defenseWins) / 200) * 100, 0, 100), weight: 0.15 });
  // ★ war stars lifetime (1500+ = 100)
  components.push({ key: 'veteran', value: clamp((stats.warStarsLifetime / 1500) * 100, 0, 100), weight: 0.10 });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = round1(components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight);
  let level = 'inactive';
  if (score >= 70) level = 'active';
  else if (score >= 40) level = 'warm';

  const breakdown = {};
  for (const c of components) breakdown[c.key] = round1(c.value);
  breakdown._weights = Object.fromEntries(components.map((c) => [c.key, round1((c.weight / totalWeight) * 100)]));
  return { score, level, breakdown };
}

(async () => {
  console.log('Buscando clã', CLAN_TAG);
  const clan = await api(`/clans/${enc(CLAN_TAG)}`);

  // War log (se público)
  const warlog = await api(`/clans/${enc(CLAN_TAG)}/warlog`, { allow404: true });
  const warlogPublic = clan.isWarLogPublic !== false;

  // Guerra atual
  const currentWar = await api(`/clans/${enc(CLAN_TAG)}/currentwar`, { allow404: true });
  if (currentWar && currentWar.state === 'warEnded') {
    if (saveWarSnapshot(currentWar)) console.log('+1 snapshot de guerra encerrada salvo');
  }

  // Capital raid seasons
  const capital = await api(`/clans/${enc(CLAN_TAG)}/capitalraidseasons?limit=10`, { allow404: true });

  // Perfil de cada membro (heróis, war stars, war pref)
  const members = clan.memberList || [];
  console.log(`Buscando perfil de ${members.length} membros…`);
  const players = [];
  const leagueHistoryByTag = {};
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    try {
      const p = await api(`/players/${enc(m.tag)}`);
      players.push(p);
      if (p.leagueTier) {
        try {
          leagueHistoryByTag[m.tag] = await api(`/players/${enc(m.tag)}/leaguehistory`, { allow404: true });
        } catch (e) {
          console.warn('skip leaguehistory', m.tag, e.message);
        }
      }
    } catch (e) {
      console.warn('skip player', m.tag, e.message);
    }
    if (i < members.length - 1) await sleep(120);
  }

  // ----- Agrega histórico (incluindo guerra atual se em curso) -----
  const history = loadHistory();
  // Se a guerra atual está acontecendo, incluímos como "ao vivo" para participação
  const ongoing = currentWar && (currentWar.state === 'inWar' || currentWar.state === 'warEnded') ? currentWar : null;

  // Nas snapshots o lado "clan" é sempre o nosso? Não — a API retorna ambos com tags. Detecta o nosso pela tag.
  const ourSide = (w) => (w.clan?.tag === CLAN_TAG ? w.clan : (w.opponent?.tag === CLAN_TAG ? w.opponent : null));
  const enemySide = (w) => (w.clan?.tag === CLAN_TAG ? w.opponent : w.clan);

  // Map por tag de jogador → estatísticas históricas
  const histStats = new Map();
  const ensureH = (tag, name, th) => {
    if (!histStats.has(tag)) histStats.set(tag, {
      name, th, warsParticipated: 0, attacksUsed: 0, attacksAvailable: 0,
      stars: 0, destruction: 0, missed: 0,
    });
    const x = histStats.get(tag);
    if (name) x.name = name;
    if (th) x.th = Math.max(x.th, th);
    return x;
  };
  const accumulateWar = (w) => {
    const us = ourSide(w); if (!us) return;
    const teamSize = w.teamSize || (us.members?.length ?? 0);
    const attacksPerMember = w.attacksPerMember || 2; // CWL = 1 mas isso só ocorre em CWL wars
    for (const m of us.members || []) {
      const s = ensureH(m.tag, m.name, m.townhallLevel);
      s.warsParticipated += 1;
      const used = (m.attacks || []).length;
      s.attacksUsed += used;
      s.attacksAvailable += attacksPerMember;
      s.missed += Math.max(0, attacksPerMember - used);
      for (const a of m.attacks || []) {
        s.stars += a.stars || 0;
        s.destruction += a.destructionPercentage || 0;
      }
    }
  };
  for (const w of history) accumulateWar(w);
  if (ongoing) accumulateWar(ongoing);

  // ----- Capital raid: total contribuído por membro (somando últimas N temporadas) -----
  const capitalAgg = new Map();
  if (capital && Array.isArray(capital.items)) {
    for (const season of capital.items) {
      for (const m of season.members || []) {
        const cur = capitalAgg.get(m.tag) || { name: m.name, capitalLooted: 0, attacks: 0 };
        cur.capitalLooted += m.capitalResourcesLooted || 0;
        cur.attacks += m.attacks || 0;
        capitalAgg.set(m.tag, cur);
      }
    }
  }

  // ----- Membros consolidados -----
  const playersByTag = Object.fromEntries(players.map((p) => [p.tag, p]));
  const roster = members.map((m) => {
    const p = playersByTag[m.tag] || {};
    const ranked = currentRankedFromProfile(p);
    if (ranked) {
      ranked.history = (leagueHistoryByTag[m.tag]?.items || []).map((h) => ({
        leagueSeasonId: h.leagueSeasonId,
        leagueTrophies: h.leagueTrophies,
        leagueTierId: h.leagueTierId,
        leagueOrder: leagueTierOrder({ id: h.leagueTierId }),
        placement: h.placement,
        attackWins: h.attackWins,
        attackLosses: h.attackLosses,
        attackStars: h.attackStars,
        defenseWins: h.defenseWins,
        defenseLosses: h.defenseLosses,
        defenseStars: h.defenseStars,
        maxBattles: h.maxBattles,
      }));
    }
    const heroes = heroSummary(p);
    const troopsPct = troopProgress(p);
    const spellsPct = spellProgress(p);
    const cap = capitalAgg.get(m.tag) || { capitalLooted: 0, attacks: 0 };
    const h = histStats.get(m.tag) || { warsParticipated: 0, attacksUsed: 0, attacksAvailable: 0, stars: 0, destruction: 0, missed: 0 };

    const stats = {
      warExpected: h.attacksAvailable,
      warUsed: h.attacksUsed,
      donations: m.donations || 0,
      attackWins: p.attackWins || 0,
      defenseWins: p.defenseWins || 0,
      cwlExpected: 0, cwlUsed: 0, cwlStars: 0, // preenchido depois pelo merge com data CWL
      warStarsLifetime: p.warStars || 0,
    };
    const activity = activityScore(stats);

    return {
      tag: m.tag,
      name: m.name,
      role: m.role,
      th: p.townHallLevel || m.townHallLevel || null,
      trophies: p.trophies ?? m.trophies,
      league: p.league?.name || m.league?.name || null,
      ranked,
      donations: m.donations || 0,
      donationsReceived: m.donationsReceived || 0,
      donationBalance: (m.donations || 0) - (m.donationsReceived || 0),
      warStarsLifetime: p.warStars || 0,
      warPreference: p.warPreference || 'unknown',
      attackWinsSeason: p.attackWins || 0,
      defenseWinsSeason: p.defenseWins || 0,
      heroes,
      troopsPct,
      spellsPct,
      labels: (p.labels || []).map((l) => l.name),
      capital: { looted: cap.capitalLooted, attacks: cap.attacks },
      warHistory: {
        wars: h.warsParticipated,
        attacks: `${h.attacksUsed}/${h.attacksAvailable}`,
        attacksUsed: h.attacksUsed,
        attacksAvailable: h.attacksAvailable,
        stars: h.stars,
        avgDestr: h.attacksUsed ? round1(h.destruction / h.attacksUsed) : 0,
        missed: h.missed,
        participation: h.attacksAvailable ? round1((h.attacksUsed / h.attacksAvailable) * 100) : 0,
      },
      activity,
    };
  });

  // ----- Merge com dados da CWL (se data.json existir) -----
  try {
    if (fs.existsSync(path.join(ROOT, 'data.json'))) {
      const cwl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
      const cwlByName = Object.fromEntries((cwl.ranking || []).map((r) => [r.player, r]));
      for (const r of roster) {
        const c = cwlByName[r.name];
        if (!c) continue;
        const [used, expected] = String(c.attacks || '').split('/').map((n) => parseInt(n, 10) || 0);
        const stats = {
          warExpected: r.warHistory.attacksAvailable,
          warUsed: r.warHistory.attacksUsed,
          donations: r.donations,
          attackWins: r.attackWinsSeason,
          defenseWins: r.defenseWinsSeason,
          cwlExpected: expected, cwlUsed: used, cwlStars: c.starsTotal || 0,
          warStarsLifetime: r.warStarsLifetime,
        };
        r.activity = activityScore(stats);
        r.cwl = { used, expected, stars: c.starsTotal, avgDestr: c.avgDestr, score: c.score, pos: c.pos };
      }
    }
  } catch (e) { console.warn('merge cwl failed', e.message); }

  // ----- War log resumido -----
  const warlogSummary = (warlog?.items || []).map((w) => ({
    result: w.result, // win, lose, tie
    endTime: w.endTime,
    teamSize: w.teamSize,
    attacksPerMember: w.attacksPerMember,
    starsUs: w.clan?.stars,
    starsThem: w.opponent?.stars,
    destrUs: round1(w.clan?.destructionPercentage),
    destrThem: round1(w.opponent?.destructionPercentage),
    opponent: w.opponent?.name,
  }));

  const wins = warlogSummary.filter((w) => w.result === 'win').length;
  const losses = warlogSummary.filter((w) => w.result === 'lose').length;
  const ties = warlogSummary.filter((w) => w.result === 'tie').length;

  const out = {
    generatedAt: fmtDt(),
    clan: {
      name: clan.name, tag: clan.tag, level: clan.clanLevel, points: clan.clanPoints,
      capitalPoints: clan.clanCapitalPoints, members: clan.members, type: clan.type,
      description: clan.description, location: clan.location?.name,
      requiredTrophies: clan.requiredTrophies, warFrequency: clan.warFrequency,
      warWinStreak: clan.warWinStreak, warWins: clan.warWins, warTies: clan.warTies, warLosses: clan.warLosses,
      isWarLogPublic: clan.isWarLogPublic !== false,
      badgeUrls: clan.badgeUrls || null,
    },
    roster,
    warlog: { public: warlogPublic, summary: warlogSummary, stats: { wins, losses, ties } },
    historyStats: { warsRecorded: history.length, ongoing: !!ongoing },
    capital: capital ? { seasons: (capital.items || []).map((s) => ({
      startTime: s.startTime, endTime: s.endTime, state: s.state,
      capitalTotalLoot: s.capitalTotalLoot, raidsCompleted: s.raidsCompleted,
      defensiveReward: s.defensiveReward, offensiveReward: s.offensiveReward,
    })) } : null,
  };

  // ----- Snapshot diário de jogadores (para cálculo de evolução de troféus) -----
  const today = new Date().toISOString().slice(0, 10);
  const playerSnapDir = path.join(ROOT, 'history', 'players');
  fs.mkdirSync(playerSnapDir, { recursive: true });
  const snapshotToday = {
    date: today,
    members: roster.map((r) => ({
      tag: r.tag, name: r.name,
      trophies: r.trophies, league: r.league, th: r.th,
      donations: r.donations, donationsReceived: r.donationsReceived,
      attackWins: r.attackWinsSeason, defenseWins: r.defenseWinsSeason,
    })),
  };
  fs.writeFileSync(path.join(playerSnapDir, today + '.json'), JSON.stringify(snapshotToday));

  // Calcula evolução de troféus comparando com snapshots anteriores
  const snapFiles = fs.readdirSync(playerSnapDir).filter((f) => f.endsWith('.json')).sort();
  const findSnap = (daysAgo) => {
    const target = new Date(); target.setDate(target.getDate() - daysAgo);
    const targetStr = target.toISOString().slice(0, 10);
    // pega o snapshot mais próximo de `daysAgo` (ou mais antigo se não houver exato)
    let best = null;
    for (const f of snapFiles) {
      const d = f.replace('.json', '');
      if (d <= targetStr) best = f;
    }
    return best ? JSON.parse(fs.readFileSync(path.join(playerSnapDir, best), 'utf8')) : null;
  };
  const snap7 = findSnap(7);
  const snap30 = findSnap(30);
  const oldest = snapFiles.length > 0 ? JSON.parse(fs.readFileSync(path.join(playerSnapDir, snapFiles[0]), 'utf8')) : null;

  for (const r of roster) {
    const find = (snap) => snap?.members?.find((m) => m.tag === r.tag);
    const t7 = find(snap7)?.trophies;
    const t30 = find(snap30)?.trophies;
    const tOldest = find(oldest)?.trophies;
    r.trophyEvolution = {
      delta7d: t7 != null ? r.trophies - t7 : null,
      delta30d: t30 != null ? r.trophies - t30 : null,
      deltaSinceFirst: tOldest != null ? r.trophies - tOldest : null,
      firstSnapshotDate: oldest?.date || null,
    };
  }

  fs.writeFileSync(path.join(ROOT, 'clan-data.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ROOT, 'clan-data.js'), 'window.CLAN_DATA = ' + JSON.stringify(out) + ';');

  // Cache busting do index.html
  const h = (rel) => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  const versions = {
    'style.css': h('style.css'),
    'app.js': h('app.js'),
    'data.js': h('data.js'),
    'clan-data.js': h('clan-data.js'),
  };
  if (fs.existsSync(path.join(ROOT, 'clashking-data.js'))) versions['clashking-data.js'] = h('clashking-data.js');
  const idx = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  for (const [f, v] of Object.entries(versions)) {
    const re = new RegExp(`(${f.replace('.', '\\.')})\\?v=[^"'\\s]+`, 'g');
    html = html.replace(re, `$1?v=${v}`);
  }
  fs.writeFileSync(idx, html);

  console.log('OK', {
    members: roster.length, warlog: warlogSummary.length,
    historyWars: history.length, capital: capital?.items?.length || 0,
  });
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
