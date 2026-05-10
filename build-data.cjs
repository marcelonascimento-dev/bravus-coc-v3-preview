const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('C:/Users/marce/Downloads/BRAVUS CWL MAIO finale.xlsx');
const sheet = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null });

const overview = sheet('Visão Geral');
const rounds = sheet('Resumo das Rodadas');
const attacks = sheet('Ataques');
const defenses = sheet('Defesas');
const ranking = sheet('Ranking');

const info = {
  clanName: 'Bravus',
  title: overview[0][0],
  subtitle: overview[1][0],
  tag: overview[4][0],
  season: overview[4][1],
  state: overview[4][2],
  totalRounds: Number(overview[4][3]),
  groupSize: Number(overview[4][4]),
  generatedAt: overview[4][5],
};

const groupClans = [];
for (let i = 8; i < overview.length; i++) {
  const r = overview[i];
  if (!r || !r[1]) continue;
  groupClans.push({ name: r[1], tag: r[2], level: r[3], members: r[4], isUs: r[5] === 'Nosso clã' });
}

const roundsData = [];
for (let i = 4; i < rounds.length; i++) {
  const r = rounds[i];
  if (!r || !r[0]) continue;
  roundsData.push({
    round: r[0], opponent: r[2], state: r[3],
    starsUs: r[4], starsThem: r[5], destrUs: r[6], destrThem: r[7], result: r[8],
  });
}

const parseStars = (s) => (s || '').split('').filter((c) => c === '★').length;

const attacksData = [];
for (let i = 4; i < attacks.length; i++) {
  const r = attacks[i];
  if (!r || !r[0]) continue;
  attacksData.push({
    round: r[0], opponent: r[1], attacker: r[2], attackerTh: r[3], attackerPos: r[4],
    defender: r[5], defenderTh: r[6], defenderPos: r[7],
    starsRaw: r[8], stars: parseStars(r[8]), destruction: r[9], duration: r[10],
  });
}

const defensesData = [];
for (let i = 4; i < defenses.length; i++) {
  const r = defenses[i];
  if (!r || !r[0]) continue;
  defensesData.push({
    round: r[0], opponent: r[1], defender: r[2], defenderTh: r[3], defenderPos: r[4],
    attacker: r[5], attackerTh: r[6], attackerPos: r[7],
    starsRaw: r[8], stars: parseStars(r[8]), destruction: r[9], duration: r[10],
  });
}

const rankingData = [];
for (let i = 4; i < ranking.length; i++) {
  const r = ranking[i];
  if (!r || (r[0] === null && !r[2])) continue;
  rankingData.push({
    pos: r[0], player: r[2], th: r[3], attacks: r[4], starsTotal: r[5],
    triples: r[6], twoStars: r[7], oneStar: r[8],
    avgDestr: r[9], avgTime: r[10], missed: r[11], score: r[12],
  });
}

const data = { info, groupClans, rounds: roundsData, attacks: attacksData, defenses: defensesData, ranking: rankingData };
fs.writeFileSync('C:/dev/coc-clan-view/data.json', JSON.stringify(data, null, 2));
fs.writeFileSync('C:/dev/coc-clan-view/data.js', 'window.DATA = ' + JSON.stringify(data) + ';');
console.log('OK');
