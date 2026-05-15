# Bravus CoC V3 — ClashKing API

Branch: `codex/clashking-api-v3`

## Decisão

Usar a ClashKing API como uma fonte **aditiva de inteligência histórica**, não como substituta total da API oficial do Clash of Clans.

Motivo: nos testes de 2026-05-15, `https://api.clashk.ing/clan/%232Q9RYP8QC/basic` retornou o clã Bravus, mas com roster diferente do snapshot oficial local. Para evitar decisões erradas de escalação, o estado atual do clã continua vindo da API oficial, enquanto o ClashKing entra com dados que a API oficial não entrega bem: histórico, warhits, activity, last online aproximado, legends e estatísticas agregadas.

## Fontes

- API oficial CoC: estado atual, roster canônico, guerra corrente, CWL corrente e perfis completos.
- ClashKing API: histórico e inteligência agregada.
- Snapshots locais `history/`: persistência própria para dados que precisam de idempotência e comparação temporal.

## Endpoints úteis do ClashKing

Base URL: `https://api.clashk.ing`

| Área | Endpoint | Uso na V3 |
|---|---|---|
| Clã | `/clan/{clan_tag}/basic` | Metadados rápidos do clã e fallback de roster |
| Guerras | `/war/{clan_tag}/previous?limit=50` | Últimas guerras salvas pelo ClashKing |
| Guerra | `/war/{clan_tag}/basic` | Guerra recente/atual quando disponível |
| CWL | `/cwl/{clan_tag}/group` | Grupo atual da CWL |
| CWL | `/cwl/{clan_tag}/{season}` | Temporada específica `yyyy-mm` |
| Doações | `/donations?players=...` | Ranking histórico/temporada por jogador |
| Atividade | `/activity?players=...` | Activity score e `last_online` coletado pelo ClashKing |
| Guerra por jogador | `/war-stats?players=...` | Estatísticas agregadas de guerra |
| Capital | `/capital?players=...` | Raid + doações de capital |
| Warhits | `/player/{tag}/warhits` | Ataques e defesas históricas individuais |
| Player stats | `/player/{tag}/stats` | Histórico agregado do jogador |
| Legends | `/legends/clan/{clan_tag}/{date}` | Push/Legends do clã por data |

## Boundary pro código

`lib/clashking-client.cjs`

- Responsável só por HTTP, tags e URLs.
- Não conhece UI, score ou arquivos.
- Não usa `COC_TOKEN`.

`fetch-clashking.cjs`

- Orquestra chamadas ClashKing.
- Lê `clan-data.json` quando existe para reaproveitar o roster oficial.
- Escreve `clashking-data.json` e `clashking-data.js`.
- Ainda experimental: não conectado à UI por padrão.

UI (`app.js`)

- Deve continuar lendo `DATA` e `CLAN_DATA`.
- Quando a V3 for ativada, lerá `CLASHKING_DATA` como enriquecimento opcional.
- Regra: se `CLASHKING_DATA` faltar, a UI não quebra.

## Próximos passos

1. Rodar `node fetch-clashking.cjs` no workflow em modo experimental.
2. Adicionar `<script src="clashking-data.js?v=..."></script>` no `index.html`.
3. Criar uma seção discreta de crédito para ClashKing.
4. Substituir rankings de participação por métricas híbridas:
   - guerra/CWL oficial atual;
   - `war-stats` e `warhits` do ClashKing;
   - `activity` e `last_online`;
   - doações enviadas/recebidas;
   - capital;
   - push/Legends.
5. Só depois promover ClashKing para fluxo principal do dashboard.

## Nota sobre Ranked Battles

Ranked Battles não é a antiga Trophy League. É um modo semanal separado com
ligas próprias (Skeleton, Barbarian, Archer, Wizard, Valkyrie, Witch, Golem,
P.E.K.K.A, Titan, Dragon, Electro e Legend).

Implicações para o dashboard:

- Não inferir Ranked League a partir de troféus comuns.
- "Unranked" vindo de `league.name` no perfil oficial pode representar a liga
  comum/trophy league ausente, não necessariamente o estado real em Ranked
  Battles.
- O card "Top push" deve mostrar apenas evolução de troféus até termos uma
  fonte confiável para Ranked Battles.
- Se uma API expuser Ranked Battles no futuro, o ranking correto deve usar:
  trophies da temporada semanal, média de destruição por ataque, média de
  destruição sofrida por defesa e tempo médio de ataque como desempates.

### Implementação no preview

A API oficial do Clash já expõe Ranked Battles no perfil do jogador:

- `leagueTier.id`
- `leagueTier.name`
- `leagueTier.iconUrls`
- `/leaguetiers` como dicionário canônico de ID → nome/ícone
- `legendStatistics.currentSeason.trophies`
- `/players/{tag}/leaguehistory`

A UI ordena por:

1. `leagueOrder` decrescente;
2. `trophies` decrescente;
3. nome.

Isso replica a lógica visual do jogo: liga ranqueada tem prioridade sobre
troféus. O ícone da liga usa `leagueTier.iconUrls` da API oficial.
