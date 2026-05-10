// Busca dados da CWL via API oficial do Clash of Clans (através do proxy RoyaleAPI)
// e regrava data.json / data.js / index.html (com cache-busting).
//
// Variáveis de ambiente:
//   COC_TOKEN  (obrigatório) — token criado em https://developer.clashofclans.com
//                              com IP 45.79.218.79 liberado.
//   CLAN_TAG   (opcional)    — default: #2Q9RYP8QC (Bravus)
//   COC_API    (opcional)    — default: https://cocproxy.royaleapi.dev/v1

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.COC_TOKEN;
const CLAN_TAG = (process.env.CLAN_TAG || '#2Q9RYP8QC').toUpperCase();
const BASE = process.env.COC_API || 'https://cocproxy.royaleapi.dev/v1';
const ROOT = __dirname;

if (!TOKEN) {
  console.error('ERR: defina COC_TOKEN. Crie um token em https://developer.clashofclans.com com IP 45.79.218.79 liberado.');
  process.exit(1);
}

const enc = (t) => encodeURIComponent(t.startsWith('#') ? t : '#' + t);
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const starString = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const stateLabel = (s) => (
  { inWar: 'Em Guerra', preparation: 'Preparação', warEnded: 'Encerrada', notInWar: 'Sem Guerra' }[s] || s || ''
);
const fmtDt = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

async function api(p) {
  const url = BASE + p;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${p}\n${t.slice(0, 300)}`);
  }
  return res.json();
}

(async () => {
  console.log('Tag do clã:', CLAN_TAG);
  const clan = await api(`/clans/${enc(CLAN_TAG)}`);
  const lg = await api(`/clans/${enc(CLAN_TAG)}/currentwar/leaguegroup`);

  // Coleta todas as guerras em que estamos
  const wars = [];
  for (let i = 0; i < lg.rounds.length; i++) {
    const round = lg.rounds[i];
    for (const wt of round.warTags || []) {
      if (!wt || wt === '#0') continue;
      try {
        const w = await api(`/clanwarleagues/wars/${enc(wt)}`);
        if (w.clan?.tag === CLAN_TAG || w.opponent?.tag === CLAN_TAG) {
          wars.push({ ...w, _round: i + 1 });
        }
      } catch (e) {
        console.warn('skip war', wt, e.message);
      }
    }
  }
  wars.sort((a, b) => a._round - b._round);

  const usOf = (w) => (w.clan?.tag === CLAN_TAG ? w.clan : w.opponent);
  const themOf = (w) => (w.clan?.tag === CLAN_TAG ? w.opponent : w.clan);

  // ----- info -----
  const stateNow = stateLabel(lg.state);
  const info = {
    clanName: clan.name,
    title: `⚔  ${clan.name}  ⚔`,
    subtitle: `Liga de Guerra de Clãs · Temporada ${lg.season || ''} · ${stateNow} · ${lg.rounds.length} rodadas`,
    tag: clan.tag,
    season: lg.season,
    state: stateNow,
    totalRounds: lg.rounds.length,
    groupSize: lg.clans.length,
    generatedAt: fmtDt(),
  };

  // ----- groupClans -----
  const groupClans = lg.clans.map((c) => ({
    name: c.name,
    tag: c.tag,
    level: c.clanLevel,
    members: (c.members || []).length,
    isUs: c.tag === CLAN_TAG,
  }));

  // ----- rounds -----
  const rounds = wars.map((w) => {
    const ours = usOf(w), theirs = themOf(w);
    const st = stateLabel(w.state);
    let result = '';
    if (st === 'Encerrada') {
      if (ours.stars > theirs.stars) result = 'VITÓRIA';
      else if (ours.stars < theirs.stars) result = 'DERROTA';
      else if (ours.destructionPercentage > theirs.destructionPercentage) result = 'VITÓRIA (destr.)';
      else if (ours.destructionPercentage < theirs.destructionPercentage) result = 'DERROTA';
      else result = 'EMPATE';
    } else if (st === 'Em Guerra') {
      if (ours.stars > theirs.stars) result = 'Liderando';
      else if (ours.stars < theirs.stars) result = 'Atrás';
      else result = 'Empatado';
    } else if (st === 'Preparação') {
      result = 'Preparando';
    }
    return {
      round: 'Rodada ' + w._round,
      opponent: theirs.name,
      state: st,
      starsUs: ours.stars || 0,
      starsThem: theirs.stars || 0,
      destrUs: round1(ours.destructionPercentage),
      destrThem: round1(theirs.destructionPercentage),
      result,
    };
  });

  // ----- attacks / defenses -----
  const attacks = [];
  const defenses = [];
  for (const w of wars) {
    const round = 'Rodada ' + w._round;
    const opponent = themOf(w).name;
    const ourMembers = usOf(w).members || [];
    const theirMembers = themOf(w).members || [];
    const ourBy = Object.fromEntries(ourMembers.map((m) => [m.tag, m]));
    const themBy = Object.fromEntries(theirMembers.map((m) => [m.tag, m]));

    for (const m of ourMembers) {
      for (const a of m.attacks || []) {
        const def = themBy[a.defenderTag];
        attacks.push({
          round, opponent,
          attacker: m.name, attackerTh: m.townhallLevel, attackerPos: m.mapPosition,
          defender: def?.name || '?', defenderTh: def?.townhallLevel ?? null, defenderPos: def?.mapPosition ?? null,
          stars: a.stars, starsRaw: starString(a.stars),
          destruction: round1(a.destructionPercentage), duration: a.duration,
        });
      }
    }
    for (const m of theirMembers) {
      for (const a of m.attacks || []) {
        const def = ourBy[a.defenderTag];
        if (!def) continue;
        defenses.push({
          round, opponent,
          defender: def.name, defenderTh: def.townhallLevel, defenderPos: def.mapPosition,
          attacker: m.name, attackerTh: m.townhallLevel, attackerPos: m.mapPosition,
          stars: a.stars, starsRaw: starString(a.stars),
          destruction: round1(a.destructionPercentage), duration: a.duration,
        });
      }
    }
  }

  // ----- ranking (agregado por jogador) -----
  const agg = new Map();
  for (const w of wars) {
    if (stateLabel(w.state) === 'Preparação') continue; // ainda não há ataques
    for (const m of usOf(w).members || []) {
      let p = agg.get(m.tag);
      if (!p) { p = { name: m.name, th: m.townhallLevel, attacks: [], expected: 0 }; agg.set(m.tag, p); }
      p.expected += 1;
      for (const a of m.attacks || []) p.attacks.push(a);
      // mantém TH mais alto registrado (caso melhore)
      if (m.townhallLevel > p.th) p.th = m.townhallLevel;
      p.name = m.name;
    }
  }
  const ranking = Array.from(agg.values()).map((p) => {
    const used = p.attacks.length;
    const expected = p.expected;
    const missed = Math.max(0, expected - used);
    const starsTotal = p.attacks.reduce((s, a) => s + a.stars, 0);
    const triples = p.attacks.filter((a) => a.stars === 3).length;
    const twoStars = p.attacks.filter((a) => a.stars === 2).length;
    const oneStar = p.attacks.filter((a) => a.stars === 1).length;
    const avgDestr = used ? round1(p.attacks.reduce((s, a) => s + a.destructionPercentage, 0) / used) : 0;
    const avgTime = used ? Math.round(p.attacks.reduce((s, a) => s + (a.duration || 0), 0) / used) : 0;
    const totalDestr = p.attacks.reduce((s, a) => s + a.destructionPercentage, 0);
    const lateness = p.attacks.reduce((s, a) => s + Math.max(0, (a.duration || 0) - 60), 0);
    const score = round1(starsTotal * 50 + totalDestr - lateness - missed * 100);
    return {
      pos: 0,
      player: p.name,
      th: p.th,
      attacks: `${used}/${expected}`,
      starsTotal,
      triples, twoStars, oneStar,
      avgDestr,
      avgTime: avgTime + 's',
      missed,
      score,
    };
  }).sort((a, b) => {
    // ★ → % destruição média → tempo médio (menor é melhor)
    if (b.starsTotal !== a.starsTotal) return b.starsTotal - a.starsTotal;
    if (b.avgDestr !== a.avgDestr) return b.avgDestr - a.avgDestr;
    return parseInt(a.avgTime) - parseInt(b.avgTime);
  });

  ranking.forEach((p, i) => { p.pos = i + 1; });

  const data = { info, groupClans, rounds, attacks, defenses, ranking };
  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(ROOT, 'data.js'), 'window.DATA = ' + JSON.stringify(data) + ';');

  // Cache busting
  const h = (rel) => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  const versions = { 'style.css': h('style.css'), 'app.js': h('app.js'), 'data.js': h('data.js') };
  const idx = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  for (const [f, v] of Object.entries(versions)) {
    const re = new RegExp(`(${f.replace('.', '\\.')})\\?v=[^"'\\s]+`, 'g');
    html = html.replace(re, `$1?v=${v}`);
  }
  fs.writeFileSync(idx, html);

  console.log('OK', {
    wars: wars.length, rounds: rounds.length, attacks: attacks.length,
    defenses: defenses.length, players: ranking.length, versions,
  });
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
