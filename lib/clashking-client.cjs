const DEFAULT_BASE = 'https://api.clashk.ing';

function normalizeTag(tag) {
  if (!tag) throw new Error('Tag is required');
  const clean = String(tag).trim().toUpperCase();
  return clean.startsWith('#') ? clean : `#${clean}`;
}

function encodeTag(tag) {
  return encodeURIComponent(normalizeTag(tag));
}

function appendList(params, key, values = []) {
  for (const value of values.filter(Boolean)) params.append(key, normalizeTag(value));
}

class ClashKingClient {
  constructor({ baseUrl = process.env.CLASHKING_API || DEFAULT_BASE, fetchImpl = global.fetch } = {}) {
    if (!fetchImpl) throw new Error('fetch is not available');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  async request(path, { query, allow404 = false } = {}) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value == null || value === '') continue;
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, item);
        } else {
          url.searchParams.set(key, value);
        }
      }
    }

    const res = await this.fetch(url, { headers: { Accept: 'application/json' } });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ClashKing HTTP ${res.status} ${url.pathname}${url.search}\n${text.slice(0, 300)}`);
    }
    return res.json();
  }

  clanBasic(clanTag) {
    return this.request(`/clan/${encodeTag(clanTag)}/basic`);
  }

  previousWars(clanTag, { limit = 50, timestampStart, timestampEnd } = {}) {
    return this.request(`/war/${encodeTag(clanTag)}/previous`, {
      query: {
        limit,
        timestamp_start: timestampStart,
        timestamp_end: timestampEnd,
      },
    });
  }

  basicWar(clanTag) {
    return this.request(`/war/${encodeTag(clanTag)}/basic`, { allow404: true });
  }

  cwlGroup(clanTag) {
    return this.request(`/cwl/${encodeTag(clanTag)}/group`, { allow404: true });
  }

  cwlSeason(clanTag, season) {
    return this.request(`/cwl/${encodeTag(clanTag)}/${season}`, { allow404: true });
  }

  stats(endpoint, { players = [], clans = [], season, seasonOrTimestamp, limit = 50 } = {}) {
    const params = new URLSearchParams();
    appendList(params, 'players', players);
    appendList(params, 'clans', clans);
    if (season) params.set('season', season);
    if (seasonOrTimestamp) params.set('season_or_timestamp', seasonOrTimestamp);
    params.set('limit', String(limit));
    return this.request(`/${endpoint}?${params.toString()}`);
  }

  donationStats(options = {}) {
    return this.stats('donations', options);
  }

  activityStats(options = {}) {
    return this.stats('activity', options);
  }

  warStats(options = {}) {
    return this.stats('war-stats', options);
  }

  capitalStats(options = {}) {
    return this.stats('capital', options);
  }

  playerStats(playerTag) {
    return this.request(`/player/${encodeTag(playerTag)}/stats`, { allow404: true });
  }

  playerWarhits(playerTag) {
    return this.request(`/player/${encodeTag(playerTag)}/warhits`, { allow404: true });
  }

  playerHistorical(playerTag, season) {
    return this.request(`/player/${encodeTag(playerTag)}/historical/${season}`, { allow404: true });
  }

  legendsClan(clanTag, date) {
    return this.request(`/legends/clan/${encodeTag(clanTag)}/${date}`, { allow404: true });
  }
}

module.exports = {
  ClashKingClient,
  normalizeTag,
};
