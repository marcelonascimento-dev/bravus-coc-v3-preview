// Experimental V3 data source.
// Produces clashking-data.js/json with historical/intelligence data from api.clashk.ing.
//
// Design: keep CoC official fetchers as the current-state source of truth. ClashKing is used
// as an additive intelligence source: previous wars, warhits, activity, donations, legends.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ClashKingClient, normalizeTag } = require('./lib/clashking-client.cjs');

const ROOT = __dirname;
const CLAN_TAG = normalizeTag(process.env.CLAN_TAG || '#2Q9RYP8QC');
const OUT_JSON = path.join(ROOT, 'clashking-data.json');
const OUT_JS = path.join(ROOT, 'clashking-data.js');

const todayIso = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const errors = [];

async function optional(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    const message = error?.message || String(error);
    errors.push({ label, message: message.slice(0, 500) });
    console.warn(`WARN ${label}: ${message.split('\n')[0]}`);
    return fallback;
  }
}

function readJsonIfExists(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function rosterFromOfficialSnapshot() {
  const snapshot = readJsonIfExists(path.join(ROOT, 'clan-data.json'));
  const roster = snapshot?.roster || [];
  return roster.map((m) => ({
    tag: normalizeTag(m.tag),
    name: m.name,
    th: m.th,
  }));
}

function rosterFromClashKingClan(clan) {
  return (clan?.memberList || []).map((m) => ({
    tag: normalizeTag(m.tag),
    name: m.name,
    th: m.townHallLevel || m.townhall,
  }));
}

function indexItems(items = [], key = 'tag') {
  const map = new Map();
  for (const item of items || []) {
    if (item?.[key]) map.set(normalizeTag(item[key]), item);
  }
  return map;
}

function summarizePreviousWars(wars = []) {
  return wars.map((entry) => entry.data || entry).filter(Boolean).map((w) => {
    const us = w.clan?.tag === CLAN_TAG ? w.clan : w.opponent;
    const them = w.clan?.tag === CLAN_TAG ? w.opponent : w.clan;
    const ourStars = us?.stars || 0;
    const theirStars = them?.stars || 0;
    const ourDest = us?.destructionPercentage || 0;
    const theirDest = them?.destructionPercentage || 0;
    let result = 'EMPATE';
    if (ourStars > theirStars || (ourStars === theirStars && ourDest > theirDest)) result = 'VITÓRIA';
    if (ourStars < theirStars || (ourStars === theirStars && ourDest < theirDest)) result = 'DERROTA';
    return {
      state: w.state,
      type: w.type || null,
      teamSize: w.teamSize,
      attacksPerMember: w.attacksPerMember,
      startTime: w.startTime,
      endTime: w.endTime,
      opponent: them?.name,
      opponentTag: them?.tag,
      starsFor: ourStars,
      starsAgainst: theirStars,
      destructionFor: round1(ourDest),
      destructionAgainst: round1(theirDest),
      attacksFor: us?.attacks || 0,
      result,
    };
  });
}

function pickPlayerInsights(roster, { donations, activity, warStats, capital }) {
  const donationsByTag = indexItems(donations?.items);
  const activityByTag = indexItems(activity?.items);
  const warByTag = indexItems(warStats?.items);
  const capitalByTag = indexItems(capital?.items);

  return roster.map((member) => {
    const d = donationsByTag.get(member.tag) || {};
    const a = activityByTag.get(member.tag) || {};
    const w = warByTag.get(member.tag) || {};
    const c = capitalByTag.get(member.tag) || {};
    return {
      tag: member.tag,
      name: member.name,
      th: member.th,
      donations: d.donations ?? null,
      donationsReceived: d.donationsReceived ?? null,
      activity: a.activity ?? null,
      lastOnline: a.last_online ?? null,
      war: {
        attacks: w.attacks ?? w.num_attacks ?? null,
        stars: w.stars ?? null,
        hitrate: w.hit_rates?.hitrate ?? w.hitrate ?? null,
        tripleRate: w.hit_rates?.triple_rate ?? w.triple_rate ?? null,
        avgStars: w.average_stars ?? w.avgStars ?? null,
        destruction: w.destruction ?? w.average_destruction ?? null,
      },
      capital: {
        raided: c.raided ?? null,
        donated: c.donated ?? null,
        attacks: c.attacks ?? null,
        medals: c.medals ?? null,
      },
    };
  });
}

function updateIndexHashes() {
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) return;

  const files = ['style.css', 'app.js', 'data.js', 'clan-data.js', 'clashking-data.js'];
  const versions = {};
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    versions[file] = crypto.createHash('md5').update(fs.readFileSync(full)).digest('hex').slice(0, 8);
  }

  let html = fs.readFileSync(indexPath, 'utf8');
  for (const [file, version] of Object.entries(versions)) {
    const escaped = file.replace('.', '\\.');
    const re = new RegExp(`(${escaped})\\?v=[^"'\\s]+`, 'g');
    html = html.replace(re, `$1?v=${version}`);
  }
  fs.writeFileSync(indexPath, html);
}

(async () => {
  const ck = new ClashKingClient();
  console.log(`Fetching ClashKing intelligence for ${CLAN_TAG}`);

  const clan = await ck.clanBasic(CLAN_TAG);
  const officialRoster = rosterFromOfficialSnapshot();
  const ckRoster = rosterFromClashKingClan(clan);
  const roster = officialRoster.length ? officialRoster : ckRoster;
  const tags = roster.map((m) => m.tag);

  if (!roster.length) throw new Error('No roster found from clan-data.json or ClashKing clan/basic');
  console.log(`Roster source: ${officialRoster.length ? 'official snapshot' : 'ClashKing clan/basic'} (${roster.length} players)`);

  const [
    previousWars,
    basicWar,
    cwlGroup,
    donations,
    activity,
    warStats,
    capital,
    legends,
  ] = await Promise.all([
    optional('previousWars', () => ck.previousWars(CLAN_TAG, { limit: 50 }), { items: [] }),
    optional('basicWar', () => ck.basicWar(CLAN_TAG)),
    optional('cwlGroup', () => ck.cwlGroup(CLAN_TAG)),
    optional('donations', () => ck.donationStats({ players: tags, limit: Math.max(tags.length, 50) }), { items: [] }),
    optional('activity', () => ck.activityStats({ players: tags, limit: Math.max(tags.length, 50) }), { items: [] }),
    // ClashKing's player-filtered war-stats/capital endpoints can return 500 for large rosters.
    // Clan-filtered calls are stable, so keep them here until we decide whether to chunk/player-drilldown.
    optional('warStats', () => ck.warStats({ clans: [CLAN_TAG], limit: Math.max(tags.length, 50) }), { items: [] }),
    optional('capital', () => ck.capitalStats({ clans: [CLAN_TAG], limit: Math.max(tags.length, 50) }), { items: [] }),
    optional('legends', () => ck.legendsClan(CLAN_TAG, todayIso())),
  ]);

  const playerWarhits = {};
  const playerStats = {};
  const sampleTags = tags.slice(0, Number(process.env.CLASHKING_PLAYER_DETAIL_LIMIT || 0));
  for (const tag of sampleTags) {
    playerWarhits[tag] = await optional(`playerWarhits:${tag}`, () => ck.playerWarhits(tag));
    await sleep(80);
    playerStats[tag] = await optional(`playerStats:${tag}`, () => ck.playerStats(tag));
    await sleep(80);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    provider: {
      name: 'ClashKing API',
      baseUrl: ck.baseUrl,
      creditUrl: 'https://clashk.ing',
      note: 'ClashKing provides public historical Clash of Clans data. Current roster remains canonical from the official CoC API snapshot when available.',
    },
    clan: {
      tag: clan.tag || CLAN_TAG,
      name: clan.name,
      level: clan.level || clan.clanLevel,
      members: clan.members,
      openWarLog: clan.openWarLog,
      active: clan.active,
      warWins: clan.warWins,
      warWinStreak: clan.warWinStreak,
    },
    rosterSource: officialRoster.length ? 'official-clan-data.json' : 'clashking-clan-basic',
    metadata: {
      rosterCount: roster.length,
      sampledPlayerDetails: sampleTags.length,
      currentDate: todayIso(),
      previousWarsCount: previousWars?.items?.length || 0,
      errors,
    },
    intelligence: {
      players: pickPlayerInsights(roster, { donations, activity, warStats, capital }),
      previousWars: summarizePreviousWars(previousWars?.items || []),
      basicWar,
      cwlGroup,
      legends,
      playerWarhits,
      playerStats,
      rawMetadata: {
        donations: donations?.metadata,
        activity: activity?.metadata,
        warStats: warStats?.metadata,
      },
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  fs.writeFileSync(OUT_JS, 'window.CLASHKING_DATA = ' + JSON.stringify(payload) + ';\n');
  updateIndexHashes();

  console.log(`Wrote ${path.basename(OUT_JSON)} and ${path.basename(OUT_JS)}`);
})();
