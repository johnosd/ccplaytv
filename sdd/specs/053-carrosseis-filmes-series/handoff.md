# Handoff — 053-carrosseis-filmes-series

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite em `tv-web/`, alvo Tizen 9 (`chrome108` não remover).
- Próximo comando: `/sdd-execute 053-carrosseis-filmes-series`. Backlog: **Planejada** (0/48). Modo sugerido: **pausado por fase**; validar no localhost ao fim da Fase 3 (MVP).
- **Fora desta sessão** (reler antes de depender): a árvore tem muito trabalho **sem commit** de outras features (048–052: `VodShowcaseScreen`, `vod.css`, E2E, `CCPlayTv/` etc.). **Não** reverter nem "consertar". Pedido do usuário usa "vitrine" = a **grade** (`VodCategoryScreen`), que **não pode ser tocada**; esta feature mexe só na tela hero (hero + lista lateral + fileiras).

## O que a feature entrega

- **US1 (P1)**: um carrossel por categoria da fonte, um sob o outro, cada um com "Ver tudo" (cartão final `.vod-see-all-card`) que abre a grade; conteúdo é **prévia lida só do disco**, na janela de foco, nunca ao focar.
- **US2 (P1)**: lista lateral recolhível para faixa de ícones/iniciais; **← com o foco na lista alterna** recolher/expandir; escolha por seção em `localStorage`.
- **US3 (P2)**: formatos por papel (pôster alto grande, compacto, Top 10 com número, `wide` só com backdrop real já em cache — quase nunca ativa, aceito).
- **US4 (P2)**: 3 slots **"Em breve"** soft-disabled (Top 10 filmes/séries da semana, Bem avaliados, Porque você assistiu) no formato final; **nenhum** código de TMDB nesta feature.
- **Decisões do usuário que contrariam o óbvio**: TMDB só **reservado** (não ligar); Top 10 de **Séries** em Séries; sugestões extras = Bem avaliados (escolha dele) + **Porque você assistiu** (assumida por mim, trocável); fileiras em ordem **Continue → Top 10 → Favoritos → Recentes → sugestões → categorias**; carrosséis de **todas** as categorias, ordem da fonte, obtidas ao se aproximar.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo, FR-001..016, SC, Assumptions (2ª sugestão assumida).
2. `plan.md` — D-001..D-011 (o "como"), R-001..R-009, Constitution Check.
3. `logic/carrosseis-e-foco.md` — **fonte do "como"**: tabela de fileiras (§1), foco puro (§2), entradas (§3), prévia/janela (§4), recolher (§5), virtualização e medidas (§6), hero (§7).
4. `tasks.md` — T001..T040 por fase.
5. `quickstart.md` — verificação ponta a ponta.
6. `.planning/memory/constitution.md` — foco, voltar por id, dado real.
7. Código-base: `tv-web/src/features/vod/VodShowcaseScreen.tsx` (a evoluir), `components/Rail.tsx`, `lib/focus/useIdFocus.ts`, `useVirtualFocusSync.ts`, `features/catalog/prefetchApi.ts`, `sdd/specs/052-vitrine-filmes-series/logic/vitrine-e-foco.md`.

## Testes de contrato

- Travados (5 testes, 3 arquivos) em `tv-web/src/features/vod/`: `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` (1, Fase 2), `vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts` (1, Fase 2), `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (3: carrosséis+voltar e slots → Fase 3; recolher → Fase 4).
- Rodar (de `tv-web/`): `npx vitest run src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series`
- Seletores fixados (criar **exatamente**): `.vod-showcase`, `section.vod-row[aria-label]` (todas as fileiras, inclusive slots e categorias; rótulos "Continue assistindo", "Top 10 filmes da semana"/"Top 10 séries da semana", "★ Favoritos", "Adicionados recentemente", "Bem avaliados", "Porque você assistiu", nome exibido da categoria), `.content-card`, `.vod-see-all-card`, `.vod-slot-card` (`aria-disabled="true"`, texto "Em breve"), `.vod-side-panel.is-collapsed`, `.side-category-nav-item` (continuam no DOM recolhido), `.vod-hero-band`.
- **Trava de outra feature que esta DEVE substituir (aprovado, FR-016/D-011)**: `052` → `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (ordem das 3 fileiras e percurso de teclas quebram por construção). T021: trocar o arquivo por equivalente, regravar **só** a trava 052 e anotar `R-020` no plan da 052. **Não podem quebrar**: 018, 019, 022 (Rail), 023/024 (`appNav`), 026 (Início/`SeeAllCard`), 046, 049 e o contrato da `VodCategoryScreen` (052).

## Stubs criados

- `tv-web/src/features/vod/vodShowcaseRows.ts` — tipos e constantes **finais** (`SEE_ALL_ID`, `SLOT_ENTRY_ID`, `ShowcaseRowSpec`…); `buildShowcaseRows` lança `not implemented` (T004).
- `tv-web/src/features/vod/vodShowcaseFocus.ts` — tipos **finais**; as 5 funções lançam `not implemented` (T005).
- `useCategoryPreviews` + `CategoryPreview` em `tv-web/src/features/catalog/catalogApi.ts` (antes de `FavoritesContent`) — lança `not implemented`; os contratos de tela o **mockam** (T007).

## Armadilhas já mapeadas

- **A pilha vertical é virtualizada**: os contratos verificam a ordem das fileiras **pelo foco ao descer**, não contando `section.vod-row` no DOM; uma implementação que renderize tudo também passa, mas **não** faça isso (centenas de categorias, R-001).
- **Prévia nunca chama `ensureCategory`/rede** (D-008): quem busca é a pré-carga 038 (`prioritizeCategory`, debounce 300 ms). `usePrefetchHint` e `useCategoryFocusPrefetch` (E-5 da 052) **permanecem**; o E2E `carga-listas` detecta se sumirem.
- **Slot nunca é foco inicial** e categoria `pending` também não (§2): sem itens reais o foco inicial é a **lista lateral**. Slot/pendente têm 1 cartão focável (`SLOT_ENTRY_ID` / `SEE_ALL_ID`).
- **`VodShowcaseRow` precisa alargar** (T009): `Record<VodShowcaseRow,…>` e `ROW_ORDER` no componente atual quebram o `tsc` até serem reescritos. `row: 'categories'` continua valendo para a lista lateral (restore da 052/App).
- `SideCategoryNav`: prop `collapsed` **opt-in**; o texto/rótulo **fica no DOM** (testes existentes e o contrato usam `textContent`); Live/Configurações idênticas.
- **Chaves de categoria usam `groupLabel(nome)`**, título usa `vodGroupDisplay`; nome repetido → só a primeira fileira.
- `Rail` exige `itemHeight` explícito e itens de largura fixa (F-001/R-007 da 022): formatos têm **uma** tabela (`vodRowFormats.ts`), CSS lê por variável inline; nenhum literal duplicado (FR-014).
- Anel de foco: meça contra todos os ancestrais que recortam (R-009 da 050); cartões de texto/“Ver tudo” sem escala (Spec §11.2).
- `Stage.tsx` estica o palco em janelas largas: larguras por fração do contêiner; rodar o E2E também em 2200×1000 (`E2E_W`/`E2E_H`).
- Instabilidades **conhecidas e não da 053**: `LiveScreen.paginacao.test.tsx` (falha na suíte cheia, passa isolada) e `epg-guia-completo` (perto da meia-noite). Reexecutar isolado antes de culpar a feature; registrar em Pendências.
- `npm run build:tizen` regenera `CCPlayTv/` (versionado): `git checkout -- CCPlayTv` se não fizer parte da entrega. Nunca commitar `docs/m3u/dados.md` nem credenciais; nenhuma URL de stream em log/DOM.
- Windows PowerShell 5.1 (sem `&&`); o shell pode estar em `tv-web/` — scripts SDD rodam da raiz.

## Pendências do Analyze

- **A-001 (MEDIUM)**: FR-011 pede ↑↓ ao "card visualmente mais próximo"; o plano usa memória por fileira (como Home/052) — R-005. Recomendação: aceitar (precedente) ou emendar o texto de FR-011 na spec antes do converge.
- **A-002 (MEDIUM)**: US3 (formatos) não tem contrato (visual) e o `wide` quase nunca ativa (R-004). Recomendação: o converge deve conferir pelas capturas do E2E (T036) e não declarar `wide` "demonstrado" sem um caso com backdrop em cache.
- **A-003 (MEDIUM)**: SC-005 (centenas de categorias sem congelar) só é medido de verdade na TV física. Recomendação: E2E com fixture de ~300 categorias (T036) e passada na TV física recomendada.
- **A-004 (LOW)**: ↑ da 1ª fileira → topbar e a rolagem vertical não estão nos contratos de tela (sem `shell`); só `'top'` no contrato puro. Recomendação: cobrir em T036/E2E e não aceitar a Fase 3 sem essa verificação.
- **A-005 (LOW)**: SC-002 (≤ 2 teclas além do deslocamento) não é testável por contrato; medir na T036.
- **A-006 (LOW)**: a 2ª sugestão ("Porque você assistiu") foi assumida; se o usuário preferir outra, só muda `buildShowcaseRows` (título/slotId) e o registro em `comingSoon.ts`.
- **A-007 (LOW)**: `docs/guia-praticas-app-tv/` não foi consultado neste plano (T037 cobre).

## Gate de pronto

- 5 contratos da 053 verdes **e** `check-contract-tests.ps1` íntegro para 053, 052 (regravada), 018, 019, 022, 023, 024, 026, 046, 049.
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo (porta 5173 conferida); `quickstart.md` executado; capturas de grade/detalhes/player/Live/Configurações/Busca idênticas (SC-006).
- Docs no Polish: `update-feature-status.ps1 … -Status Implementada`, `plan.md` (Estado Atual/Execution Notes/PRÓXIMO), `R-020` no plan da 052; **não** editar o `CLAUDE.md`; itens 67–69 em `## Ideias Futuras`.
- Passada na TV física: **recomendação** (prévias + pilha virtualizada), não gate.
