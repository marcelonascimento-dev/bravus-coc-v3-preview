# Bravus · Clã Dashboard

Dashboard estático com visão completa do clã **Bravus** (membros, atividade,
guerras, capital, CWL) com dados ao vivo da API oficial do Clash of Clans.

🔗 **Site:** https://marcelonascimento-dev.github.io/bravus-coc/

## Como funciona

- Site 100% estático (HTML/CSS/JS), hospedado no GitHub Pages.
- Um **GitHub Action** roda a cada 30 minutos, busca os dados via API do CoC,
  regrava `data.json`/`data.js` e dá `git push`. O Pages republica sozinho.
- O navegador do time só lê o JSON local — sem tokens expostos, sem CORS.

## Configuração inicial (uma vez só)

A API do Clash of Clans exige um **token vinculado a um IP fixo**. Como os
runners do GitHub têm IP dinâmico, usamos o proxy gratuito do RoyaleAPI
(`cocproxy.royaleapi.dev`), cujo IP fixo é `45.79.218.79`.

1. Acesse https://developer.clashofclans.com e faça login com sua conta de
   Supercell ID.
2. Em **My Account → Create New Key**, crie uma chave com:
   - **Name:** `bravus-coc`
   - **IP Addresses:** `45.79.218.79`
3. Copie o token gerado.
4. No repositório do GitHub: **Settings → Secrets and variables → Actions →
   New repository secret**:
   - **Name:** `COC_TOKEN`
   - **Value:** o token copiado.
5. (Opcional) Se quiser apontar para outro clã, crie uma **variable** (não
   secret) chamada `CLAN_TAG` com a tag (ex.: `#2Q9RYP8QC`).
6. Vá em **Actions → Refresh CWL data → Run workflow** para forçar a primeira
   atualização. Depois disso roda sozinho a cada 30 min.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html`, `style.css`, `app.js` | Interface (SPA estático sem build). |
| `data.js` / `data.json` | Snapshot dos dados da CWL. |
| `fetch-coc.cjs` | Pega dados na API e regrava os arquivos acima. |
| `.github/workflows/refresh.yml` | Cron de 30 min + atualização manual. |
| `build-data.cjs` | Fallback: gera os dados a partir da planilha original. |

## Atualização manual

```bash
# definir token localmente (não commitar)
export COC_TOKEN=seu_token
node fetch-coc.cjs
git commit -am "update" && git push
```

## Cache

O `index.html` traz `?v=<hash>` em cada asset. Sempre que o conteúdo de
`app.js`/`style.css`/`data.js` muda, o hash muda e o navegador baixa a versão
nova automaticamente — ninguém precisa apertar Ctrl+F5.
