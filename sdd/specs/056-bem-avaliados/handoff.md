# Handoff — 056 Fileira "Bem avaliados" em Filmes e Séries

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite em `tv-web/`, Dexie/IndexedDB, vitest + Playwright.
- Próximo comando: `/sdd-execute 056-bem-avaliados`. Status no backlog: **Planejada**.
- Arquivos que mudaram em disco durante o plan (releia antes de editar): `tv-web/src/features/vod/{vodShowcase,vodShowcaseRows,vodSort}.ts`,
  `tv-web/src/features/catalog/catalogApi.ts`, `tv-web/src/lib/i18n/messages/{vodCategory,vodShowcase}.ts` (stubs/textos) e
  `.planning/backlog.md` (item 68 removido de `## Ideias Futuras`).

## O que a feature entrega

- **US1 (P1)**: fileira real "Bem avaliados" em Filmes e Séries (≤ 12 títulos de maior nota do provedor entre os obtidos), selo `★ 8,4` nos
  cards, `★ 8,4 Provedor` no destaque, aviso "Com base em X de Y categorias" enquanto parcial. Substitui o slot "Em breve" `vod-rated`.
- **US2 (P2)**: "Ver tudo" abre "Todos" ordenado por nota. **A ordenação por nota não entra no menu de Ordenar** (decisão do usuário/FR-008).
- **US3 (P2)**: com < 5 títulos de nota válida a fileira **some** (nem slot nem fileira vazia) e reaparece sozinha quando mais categorias chegam.
- Decisões do usuário que contrariam o óbvio: sem nota ⇒ ausente (não "Em breve"); empate pelo mais recente; cobertura parcial **é aceita e sinalizada**;
  emendar os 3 contratos travados de 052/053 foi **aprovado** (R-001).

## Leitura obrigatória, em ordem

1. `sdd/specs/056-bem-avaliados/spec.md` — 14 FR, 6 SC, edge cases.
2. `plan.md` — Decisões Invariantes D-001..D-008, Constitution Check, riscos R-001..R-007.
3. `logic/bem-avaliados.md` — **as regras e as 3 armadilhas de `VodCategoryScreen`**; leia inteiro antes de codar.
4. `tasks.md` — 27 tasks em 6 fases; T011 é a emenda dos contratos de 052/053.
5. `quickstart.md` — roteiro de verificação.
6. `.planning/memory/constitution.md` (v1.7.0).

## Testes de contrato

- Travados (5 casos): `tv-web/src/features/vod/vodShowcase.bem-avaliados.contract.test.ts` (3, Fase 2) e
  `tv-web/src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx` (2, Fase 3).
- Rodar: `cd tv-web; npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx`
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 056-bem-avaliados`
- **Travas de outras features que esta QUEBRA de propósito** (emenda aprovada, T011/R-001): `052-vitrine-filmes-series`
  (`VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`), `053-carrosseis-filmes-series` (`vodShowcaseRows.carrosseis-filmes-series.contract.test.ts`
  e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`). Edite só as linhas de `rated`/"Bem avaliados" e regrave cada trava com `-Write -Paths`
  (todos os arquivos daquele lock). Registre `R-008` no plan. Não é um "5b": já está autorizado.

## Stubs criados

- `vodShowcase.ts`: `RATED_MIN = 5` (definitivo) e `topRated` (lança). `pickTopRated` ainda **não existe** — crie (T003).
- `vodSort.ts`: `'rating'` em `VodSortOption`/`VOD_SORT_LABEL_KEYS` (definitivo); `sortVodItems('rating')` lança (T004).
- `vodShowcaseRows.ts`: `hasRated?` só no tipo; o slot `rated` ainda é gerado (T005).
- `catalogApi.ts`: `useTopRated` lança (T007).
- i18n pronto nos 3 idiomas: `vod.sort.rating`, `showcase.ratedCoverage`.

## Armadilhas já mapeadas

- **`effectiveSortOption`** (`VodCategoryScreen.tsx` ~l.271) rebaixa tudo que não está em `availableOptions` para `'source'`: `'rating'` precisa de regra própria
  (só em `enteredAll`) ou o "Ver tudo" abre sem ordenar. Também `sortFocusIdx` fica `-1` se o índice vier de `availableOptions`.
- **Não mapear o catálogo inteiro** para `CatalogItemOut` (43 mil filmes): `pickTopRated` sobre `entry.record`, `toItemOut` só nos 12.
- **Mesma `queryKey`** de `useRecentlyAdded` (`['catalog-search-index', sourceId, kind]`): a pré-carga já a invalida (`prefetchApi.ts:53`). `select` precisa ser estável.
- **Arquivos CRLF/mistos** (`catalogApi.ts`, `vodSort.ts`, `VodShowcaseScreen.tsx`, `comingSoon.ts`, `vodShowcase.ts`): use Edit ou binário; confira `git diff --stat`.
  O `.gitattributes`/autocrlf avisa "LF will be replaced by CRLF", é normal. Nunca Python regravando o arquivo.
- **Foco inicial**: sem nenhum card elegível nas fileiras o foco começa na lista lateral — por isso os contratos de tela dão 1 favorito ao cenário.
- **Selo**: `RatingBadge` já é usado pelo card `portrait`; não criar variante. O selo não é focável.
- **E2E**: `tv-web/e2e/lib/vod.mjs` (~l.130) e `carrosseis-filmes-series.mjs` (~l.165) citam "Bem avaliados" como slot — atualizar (T023). Nunca `taskkill /IM chrome.exe`.
- `comingSoon.test.ts` lista `vod-rated`; remova (T010).

## Pendências do Analyze

- **A-1 (MEDIUM)** T018 está vaga sobre onde testar o retorno do "Ver tudo": escolha o teste de integração do `App` se já existir; senão `VodShowcaseScreen.bem-avaliados.test.tsx`.
- **A-2 (LOW)** SC-002/SC-006 (sem rede / sem "IMDb"/"TMDB") são cobertos por asserção de `fetch` no contrato de tela e por E2E; SC-006 não tem asserção textual dedicada — adicione um `expect(document.body.textContent).not.toMatch(/IMDb|TMDB/)` no teste T014.
- **A-3 (LOW)** SC-004 depende de lista real e das credenciais do `.env`; sem elas, registre "não medido" em vez de aprovar.

## Gate de pronto

- 5 contratos verdes + travas íntegras (056, 052 e 053).
- `cd tv-web; npx tsc -b; npm run lint; npm run test; npm run test:e2e` (com `npm run dev`).
- `quickstart.md` executado; medição de SC-004 antes/depois registrada.
- Docs no Polish: `.planning/backlog.md` (item 68), `README.md` se couber.
- TV física: **recomendação**, não gate (constitution, "Validação em hardware real").
