# Bravus · CWL Dashboard

Dashboard estático com os dados da Liga de Guerra de Clãs do clã **Bravus**.

Site online: https://marcelonascimento-dev.github.io/bravus-cwl/

## Estrutura
- `index.html`, `style.css`, `app.js` — interface (SPA estático, sem build).
- `data.js` / `data.json` — dados gerados a partir da planilha.
- `build-data.cjs` — script Node que lê o `.xlsx` e regera os dados.

## Atualizar dados
1. Substitua o caminho da planilha em `build-data.cjs` se necessário.
2. `npm install`
3. `node build-data.cjs`
4. `git commit -am "update CWL data" && git push`
