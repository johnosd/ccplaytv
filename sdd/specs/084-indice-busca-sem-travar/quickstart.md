# Quickstart: verificação da feature 084

## Pré-requisitos

- `tv-web/` com dependências instaladas; `npm run dev` de pé para o E2E.
- TV de referência ligada, com Developer Mode e o Host PC IP apontando para o PC (só nos passos 4 e 5, **sempre com
  autorização do usuário antes de instalar**).
- Lista real no `.env` (`CCPLAY_PROBE_*`) para gerar as amostras sanitizadas da sonda, se `.amostras/` não existir.

## 1. Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts src/features/vod/vodSort.indice-sem-travar.contract.test.ts src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts
..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 084-indice-busca-sem-travar
npx tsc -b
npm run lint            # inclui o ratchet: catalogApi.ts ≤ 2 187, VodCategoryScreen.tsx ≤ 949, SearchScreen.tsx ≤ 345
npm run test
npm run build
npm run test:e2e        # com npm run dev de pé
```

## 2. Regressão de resultados (SC-004)

- Busca global: mesmos resultados para "ma", "acao", "the" e "007" antes e depois (teste unitário de `searchGlobal` sobre o
  índice em fatias).
- "Todos" de Filmes: mesma ordem em A–Z, Ano, Adicionados e Nota (contrato FR-005 + teste do hook).

## 3. Cenário no navegador do PC (diagnóstico)

`npm run dev` → abrir uma lista grande → Busca e "Todos" A–Z → o foco anda durante o carregando; os resultados aparecem
iguais. No PC tudo roda a ~60 fps: **não aprova nada**.

## 4. Sonda na TV (gate: SC-001, SC-002, SC-003)

Da raiz, depois de atualizar `sonda-tv/memoria/entrada.ts` para o caminho novo (T015):

```powershell
node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/empacotar.mjs
node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/coletor.mjs <ip-da-tv>      # em segundo plano
.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -TvIp <ip> -App app2 -AppId ccpSondaV2.Capacidades -Only quadrosIndice
```

Aprovado: nenhum quadro > 100 ms na busca global, em "Todos" A–Z (e nas outras ordenações) e na remontagem por 10 s
(≥ 50 fps), em ≥ 2 medições (desinstalar e reinstalar entre elas). Ao fim: desinstalar a sonda, parar o coletor e
conferir que o `applist` mostra só o CCPlayTV. Evidência em `evidencias/quadros-tv-AAAA-MM-DD.md`, só com números.

## 5. App real na TV (SC-005; leitura do usuário)

`$env:VITE_CCPLAY_PERF = "1"; npm run build:tizen` → `deploy-tv.ps1 -SkipBuild -TvIp <ip>`, **com autorização**. O
usuário abre a Busca e "Todos" A–Z com a lista real e informa do `PerfOverlay`: `quadros>100ms` e o tempo até os
resultados. Ao final: build normal e reinstalação, avisando (`build:tizen` reescreve `CCPlayTv/assets`).

## Itens cross-cutting da constitution

- Foco: o estado carregando da Busca e de "Todos" tem elemento focável (já existe; conferir que o `pending` novo usa o
  mesmo estado).
- Voltar restaura foco por id: entrar no detalhe a partir de "Todos" A–Z e voltar → mesmo item.
- Nenhum texto novo de interface; se surgir, vai para o i18n (pt/en/es) e para `e2e/legibilidade-tv.mjs`.
- Nenhum log com URL ou credencial (a feature não toca rede).
