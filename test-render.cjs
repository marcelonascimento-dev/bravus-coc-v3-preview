// Smoke test: carrega data/clan-data e valida cálculos chave do app.js
const fs = require('fs');
const path = require('path');

// Mock window
const window = {};
global.window = window;
global.document = { getElementById: () => null, querySelector: () => null };
global.localStorage = { getItem: () => null, setItem: () => {} };

eval(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'clan-data.js'), 'utf8'));

const D = window.DATA;
const C = window.CLAN_DATA;

const assert = (cond, msg) => { if (!cond) { console.error('❌', msg); process.exit(1); } else console.log('✅', msg); };

console.log('--- Smoke tests ---');
assert(D && D.info && D.ranking, 'DATA carregou (CWL)');
assert(C && C.clan && C.roster, 'CLAN_DATA carregou');
assert(C.clan.badgeUrls, 'badgeUrls presente: ' + JSON.stringify(Object.keys(C.clan.badgeUrls || {})));
assert(C.clan.level, 'clan level: ' + C.clan.level);
assert(C.clan.warWins != null, 'warWins: ' + C.clan.warWins);
assert(C.roster.length > 0, 'roster com ' + C.roster.length + ' membros');
assert(C.roster[0].activity, 'roster[0].activity presente');
assert(C.roster[0].heroes, 'roster[0].heroes presente');
assert(C.roster[0].warHistory, 'roster[0].warHistory presente');

// Composite participation
const enriched = C.roster.map((m) => {
  const cwlUsed = m.cwl?.used || 0, cwlExp = m.cwl?.expected || 0;
  const histUsed = m.warHistory?.attacksUsed || 0, histExp = m.warHistory?.attacksAvailable || 0;
  const used = cwlUsed + histUsed, exp = cwlExp + histExp;
  return { ...m, _used: used, _exp: exp, _part: exp ? (used / exp) * 100 : 0 };
});
console.log('Sample enriched:', enriched.slice(0, 3).map(m => ({ name: m.name, used: m._used, exp: m._exp, part: m._part.toFixed(1) })));

// Activity recompute (mesma fórmula do app.js)
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
  if (stats.warExpected > 0) comps.push({ value: clamp((stats.warUsed / stats.warExpected) * 100, 0, 100), weight: 0.40 });
  if (stats.cwlExpected > 0) {
    const v = clamp((stats.cwlUsed / stats.cwlExpected) * 80 + (stats.cwlStars / Math.max(stats.cwlExpected * 3, 1)) * 20, 0, 100);
    comps.push({ value: v, weight: 0.30 });
  }
  comps.push({ value: clamp((stats.donations / 1500) * 100, 0, 100), weight: 0.25 });
  comps.push({ value: clamp(((stats.attackWins + stats.defenseWins) / 200) * 100, 0, 100), weight: 0.15 });
  comps.push({ value: clamp((stats.warStarsLifetime / 1500) * 100, 0, 100), weight: 0.10 });
  const tw = comps.reduce((s, c) => s + c.weight, 0);
  return r1(comps.reduce((s, c) => s + c.value * c.weight, 0) / tw);
}
const scores = C.roster.map((m) => ({ name: m.name, score: recomputeActivity(m), oldScore: m.activity?.score }));
const top = scores.sort((a, b) => b.score - a.score).slice(0, 5);
console.log('\nTop 5 por atividade (recomputed):');
top.forEach((s, i) => console.log(`  ${i + 1}. ${s.name.padEnd(20)} novo=${s.score} (era ${s.oldScore})`));

// Distribuição
const lv = (s) => s >= 70 ? 'active' : s >= 40 ? 'warm' : 'inactive';
const dist = scores.reduce((acc, s) => { acc[lv(s.score)] = (acc[lv(s.score)] || 0) + 1; return acc; }, {});
console.log('\nDistribuição:', dist);

// Top atacantes
const attackers = enriched
  .map(m => ({ ...m, _stars: (m.cwl?.stars || 0) + (m.warHistory?.stars || 0), _cnt: m._used }))
  .filter(m => m._cnt > 0)
  .sort((a, b) => b._stars - a._stars).slice(0, 5);
console.log('\nTop 5 atacantes:');
attackers.forEach((m, i) => console.log(`  ${i + 1}. ${m.name.padEnd(20)} ★${m._stars} (${m._cnt} atq)`));

// Trophy evolution presence
const withEvo = C.roster.filter(m => m.trophyEvolution && (m.trophyEvolution.delta7d != null || m.trophyEvolution.deltaSinceFirst != null));
console.log('\nJogadores com evolução registrada:', withEvo.length, '/', C.roster.length);

// War log
console.log('\nWar log:', C.warlog?.summary?.length || 0, 'guerras', '·', C.warlog?.public ? 'PÚBLICO' : 'PRIVADO');
console.log('Capital:', C.capital?.seasons?.length || 0, 'temporadas');
console.log('Histórico de guerras:', C.historyStats?.warsRecorded || 0);

console.log('\n✅ Smoke test OK');
