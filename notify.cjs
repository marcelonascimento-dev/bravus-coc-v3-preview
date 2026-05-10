// Sistema de notificações WhatsApp via CallMeBot.
// Detecta transições de estado da guerra e ataques pendentes,
// e dispara mensagens individuais. Idempotente — usa marcadores
// em history/notifications/ para não enviar a mesma coisa duas vezes.
//
// Variáveis de ambiente:
//   COC_TOKEN              — token da API do CoC
//   CLAN_TAG               — tag do clã (default #2Q9RYP8QC)
//   WHATSAPP_REGISTRY      — JSON com [{tag, phone, apikey, optOut?}]
//                            phone no formato internacional sem '+', ex: 5562999999999
//   NOTIFY_DRY_RUN         — se "1", só faz log sem enviar (útil em testes)

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.COC_TOKEN;
const CLAN_TAG = (process.env.CLAN_TAG || '#2Q9RYP8QC').toUpperCase();
const BASE = process.env.COC_API || 'https://cocproxy.royaleapi.dev/v1';
const REGISTRY_RAW = process.env.WHATSAPP_REGISTRY || '[]';
const DRY = process.env.NOTIFY_DRY_RUN === '1';

const ROOT = __dirname;
const NOTIF_DIR = path.join(ROOT, 'history', 'notifications');
fs.mkdirSync(NOTIF_DIR, { recursive: true });

if (!TOKEN) { console.error('ERR: COC_TOKEN ausente'); process.exit(1); }

let registry;
try {
  registry = JSON.parse(REGISTRY_RAW);
  if (!Array.isArray(registry)) throw new Error('registry não é array');
} catch (e) {
  console.warn('WHATSAPP_REGISTRY inválido ou vazio — pulando notificações.', e.message);
  process.exit(0);
}
if (!registry.length) { console.log('Registry vazio — nada a notificar.'); process.exit(0); }

const byTag = Object.fromEntries(registry.map((r) => [r.tag.toUpperCase(), r]));

const enc = (t) => encodeURIComponent(t.startsWith('#') ? t : '#' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, { allow404 = false } = {}) {
  const res = await fetch(BASE + p, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if ((res.status === 404 || res.status === 403) && allow404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${p}`);
  return res.json();
}

async function sendWhats(phone, apikey, text) {
  if (DRY) { console.log(`[DRY] -> ${phone}: ${text}`); return true; }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url);
  const body = await res.text().catch(() => '');
  // CallMeBot retorna 200 com texto "Message queued..." mesmo em sucesso, ou 209/200 com erro no body
  const ok = res.status < 400 && /queued|sent|success/i.test(body);
  if (!ok) console.warn(`✗ ${phone}: status=${res.status} body="${body.slice(0, 200)}"`);
  else console.log(`✓ ${phone}`);
  return ok;
}

function alreadySent(eventId) {
  return fs.existsSync(path.join(NOTIF_DIR, eventId + '.json'));
}
function markSent(eventId, payload) {
  fs.writeFileSync(path.join(NOTIF_DIR, eventId + '.json'), JSON.stringify({ when: new Date().toISOString(), ...payload }, null, 2));
}

// CoC API trabalha com timestamps formato 20260510T120000.000Z
function parseCocTime(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

function eligible() {
  return registry.filter((r) => !r.optOut && r.phone && r.apikey && r.tag);
}

// Notifica só quem está escalado na guerra E está no cadastro
async function notifyWarParticipants(warMemberTags, text, eventId) {
  if (alreadySent(eventId)) return console.log('· já enviado:', eventId);
  const setTags = new Set(warMemberTags.map((t) => t.toUpperCase()));
  const targets = eligible().filter((r) => setTags.has(r.tag.toUpperCase()));
  if (!targets.length) return console.log('· nenhum target em', eventId);
  console.log('▶', eventId, '-', targets.length, '/', warMemberTags.length, 'escalados');
  let ok = 0;
  for (const r of targets) {
    const personal = (r.name ? `Olá ${r.name}! ` : '') + text;
    const success = await sendWhats(r.phone, r.apikey, personal);
    if (success) ok++;
    await sleep(1500);
  }
  markSent(eventId, { sent: ok, total: targets.length });
}

(async () => {
  const ourTag = CLAN_TAG;
  const usOf = (w) => (w.clan?.tag === ourTag ? w.clan : w.opponent);
  const themOf = (w) => (w.clan?.tag === ourTag ? w.opponent : w.clan);

  // ===== Guerra normal =====
  const cw = await api(`/clans/${enc(CLAN_TAG)}/currentwar`, { allow404: true });

  if (cw && cw.state && cw.state !== 'notInWar') {
    const ours = usOf(cw); const theirs = themOf(cw);
    const startTs = parseCocTime(cw.startTime);
    const endTs = parseCocTime(cw.endTime);
    const now = new Date();
    const opp = theirs?.name || 'adversário';
    const ourMembers = ours?.members || [];
    const allWarTags = ourMembers.map((m) => m.tag);

    // 1) WAR DAY iniciou — manda 1x pra todos escalados quando detectamos transição
    if (cw.state === 'inWar' && startTs) {
      const dayId = cw.startTime.slice(0, 8);
      await notifyWarParticipants(allWarTags,
        `⚔ Bravus: a GUERRA contra *${opp}* começou! Você está escalado — vê seu alvo no jogo. Boa sorte!`,
        `war_started_${dayId}`
      );

      // 2) Lembretes de ataques pendentes — 4h e 1h antes do fim
      if (endTs) {
        const hrsLeft = (endTs - now) / 3600000;
        const attacksPerMember = cw.attacksPerMember || 2;
        const pendingTags = ourMembers
          .filter((m) => (m.attacks || []).length < attacksPerMember)
          .map((m) => m.tag);

        if (hrsLeft <= 4 && hrsLeft > 1) {
          await notifyWarParticipants(pendingTags,
            `⏰ Restam ~4h da guerra contra *${opp}* e você ainda tem ataque pendente!`,
            `war_4h_${cw.endTime.slice(0, 12)}`
          );
        }
        if (hrsLeft <= 1 && hrsLeft > 0) {
          await notifyWarParticipants(pendingTags,
            `🚨 ÚLTIMA HORA da guerra contra *${opp}* — você ainda não atacou!`,
            `war_1h_${cw.endTime.slice(0, 12)}`
          );
        }
      }
    }
  }

  // ===== CWL (rodadas) =====
  // Detecta transição de cada rodada para inWar e dispara aviso pros membros
  const lg = await api(`/clans/${enc(CLAN_TAG)}/currentwar/leaguegroup`, { allow404: true });
  if (lg && lg.rounds) {
    for (let i = 0; i < lg.rounds.length; i++) {
      const round = lg.rounds[i];
      for (const wt of round.warTags || []) {
        if (!wt || wt === '#0') continue;
        const w = await api(`/clanwarleagues/wars/${enc(wt)}`, { allow404: true });
        if (!w || (w.clan?.tag !== ourTag && w.opponent?.tag !== ourTag)) continue;
        const ours = usOf(w); const theirs = themOf(w);
        const opp = theirs?.name || '?';
        const roundLabel = `Rodada ${i + 1}`;
        const id = (w.endTime || w.startTime || ('round' + i)).slice(0, 12);

        const ourMembers = ours?.members || [];
        const allWarTags = ourMembers.map((m) => m.tag);

        // Início da rodada — notifica só os escalados
        if (w.state === 'inWar') {
          await notifyWarParticipants(allWarTags,
            `📜 CWL ${roundLabel}: Bravus × *${opp}* — começou! Você está escalado, 1 ataque, vê seu alvo.`,
            `cwl_started_r${i + 1}_${id}`
          );

          // Pendentes 4h / 1h antes do fim
          const endTs = parseCocTime(w.endTime);
          if (endTs) {
            const hrsLeft = (endTs - new Date()) / 3600000;
            const pendingTags = ourMembers
              .filter((m) => (m.attacks || []).length < 1)
              .map((m) => m.tag);

            if (hrsLeft <= 4 && hrsLeft > 1) {
              await notifyWarParticipants(pendingTags,
                `⏰ CWL ${roundLabel} — ~4h pro fim e você ainda não atacou contra ${opp}!`,
                `cwl_4h_r${i + 1}_${id}`
              );
            }
            if (hrsLeft <= 1 && hrsLeft > 0) {
              await notifyWarParticipants(pendingTags,
                `🚨 CWL ${roundLabel} — ÚLTIMA HORA pra atacar contra ${opp}!`,
                `cwl_1h_r${i + 1}_${id}`
              );
            }
          }
        }
      }
    }
  }

  console.log('done');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
