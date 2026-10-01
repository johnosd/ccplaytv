# Handoff — 039-catalogo-em-blocos

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. React 19 + TS + Vite + Dexie em `tv-web/`, app Tizen client-first.
- Próximo comando: `/sdd-execute 039-catalogo-em-blocos`. Backlog: **Planejada**.
- Depende da 038 (pré-carga por seção, commits `c15c2e1`/`4663e8e`), que continua **Em Execução** (falta o gate na TV).
- Na árvore há mudanças sem commit de outra sessão (035/037, `CCPlayTv/assets`, logs); não mexa nelas.

## O que a feature entrega

- **P1 US1**: abrir qualquer categoria em ≤ 300 ms na TV, inclusive a de 11 mil filmes.
- **P1 US2**: catálogo inteiro (~43 mil itens) pronto em ≤ 60 s na TV.
- **P1 US4**: conversão automática e em segundo plano das listas já guardadas, **sem perder** favoritos, progresso, "assistido" e histórico.
- **P2 US3**: "Todos" (≤ 1 s para 31 mil filmes), buscas, ★, ↺, Início e Semelhantes leem os blocos.
- **P2 US5**: ~300 mil itens sem a TV fechar o app.
- **Decisões do usuário**: episódios **ficam como estão**; M3U entra; **nenhuma mudança visual**; o gate na TV é **obrigatório**.

## Leitura obrigatória, em ordem

1. `spec.md`: FR-001..FR-014, SC-001..SC-007.
2. `plan.md`: D-001..D-008, R-001..R-006, Complexity Tracking (dois formatos lidos juntos).
3. `logic/blocos-e-identidade.md`: **o documento central**. Bloco, id negativo, identidade, escrita, leitura com reserva, conversão, episódios, gerações.
4. `data-model.md`: Dexie v14 (`categoryBlocks`).
5. `tasks.md`, `quickstart.md`.
6. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts`: 5 testes (4 fecham na Fase 2, o de conversão na Fase 3).
- Rodar (em `tv-web/`): `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts`
- Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 039-catalogo-em-blocos`
- **A trava da 038 foi regravada** com a emenda aprovada (`catalogRepository.carga-listas.contract.test.ts`: `storeSeriesEpisodes`/`getChannel` no lugar de escrita direta). Ela precisa continuar verde.
- **Travas de outras features que gravam linhas direto em `channels`** e dependem da leitura de reserva: 017 `catalogSearch.contract`, 025 `history.filmes-series-ds-v14.contract`, 026 `homeHero…contract`, 032/033/035 `titleMetadata.*.contract` e `localTitleMatch.semelhantes.contract`, 036 `historyRemoval…` e `VodCatalogScreen.limpar-historico…` (essas duas **já vermelhas**: 036 não executada; só precisam continuar compilando).

## Stubs criados

- `tv-web/src/lib/catalog/categoryBlocks.ts`: `BLOCK_ID_SPACE`, e lançando `not implemented`: `blockItemId`, `categoryIdOfBlockItem`, `convertLegacyCategories`. Todo o resto (tabela v14, `writeBlock`, leituras) está por fazer.

## Armadilhas já mapeadas

- **Não mude nome nem assinatura das funções públicas de `catalogRepository.ts`** (D-002). As telas e 10 travas dependem delas.
- **Ids de bloco são negativos**: nada no app pode assumir `id > 0`. `String(record.id)` e `Number(itemId)` continuam valendo. Confira `if (id)` e `id ?? 0` em ordenação.
- **Uma categoria é ou bloco ou linhas**: escrever o bloco apaga as linhas daquela `[kind, groupOrder]` (não episódios) **na mesma transação**, senão a leitura de reserva duplica itens.
- `renewWithin` (038) já tem a identidade e a assinatura: reuse, não duplique.
- `localTitleMatch.ts` tem uma varredura própria (`.each`, ~linha 45). Confira a tabela; se for `channels`, passe a ler por blocos (T008).
- `channels` **não tem índice em `kind`**. Nos testes, use `.filter`, não `where('kind')`.
- A conversão preserva `itemsFetchedAt`. Não a deixe marcar a categoria como recém-renovada.
- Ids mudam uma vez na conversão (R-003). Por isso a conversão só roda com o portão aberto.
- Flakes conhecidos: `*.favorites.test.tsx` / `LiveScreen.test.tsx` sob paralelismo; confira isolado. Rode vitest **de dentro de `tv-web/`**.
- Os `e2e/*.mjs` têm `executablePath` Linux com fallback; reinicie o dev server antes do E2E.

## Pendências do Analyze

- A1 (MEDIUM): SC-004 não tem orçamento de memória numérico. A T021/T022 fixa pela medição; registre em R-005.
- A2 (MEDIUM): SC-005 no navegador simula o formato antigo semeando linhas (não há build anterior no E2E). A prova real é na TV: instalar o build anterior, usar, instalar este.
- A3 (LOW): a varredura de `localTitleMatch.ts` não foi confirmada como leitura de `channels` (T008 confere).

## Gate de pronto

- 5/5 contratos da 039 verdes + trava íntegra; travas de 017/018/024/025/026/027/029/030/031/032/033/034/035/036/038 íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen`, `npm run test:e2e` (com `e2e/catalogo-em-blocos.mjs`), `node e2e/paridade-limpeza.mjs`.
- `quickstart.md`; docs no Polish (`CLAUDE.md`, backlog).
- **TV física é gate obrigatório** (SC-007).
