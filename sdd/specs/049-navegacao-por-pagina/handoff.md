# Handoff — 049 Navegação por página nas listas

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend React 19 + TS + Vite em `tv-web/` (Tizen, client-first).
- Próximo comando: `/sdd-execute 049-navegacao-por-pagina` (o usuário pediu **modo contínuo**). Backlog: **Planejada**.
- Base: a 048 (paridade visual da Live) está "Em Execução" com T031/T033 abertas; esta feature remove os 3 botões do destaque que a 048 criou. Larguras reais da Live: 280/400px (decisão R-009 da 048).
- Arquivos criados fora de `sdd/`: `tv-web/src/lib/focus/paging.ts` (stub) e os 3 arquivos de contrato.

## O que a feature entrega

- **US1 (P1)** → = próxima página, ← = página anterior na trilha e na lista de canais da Live (também Favoritos/Todos/busca) e no zapping; para nas bordas; foco na mesma linha da tela.
- **US2 (P1)** OK entra na categoria e toca o canal; RETURN volta da lista à trilha. Nenhuma tecla de seta troca de coluna.
- **US3 (P2)** o destaque vira só informação (sem botões, sem foco); OK toca, Segurar OK favorita, ícone de Guia (`.live-guide-button`) ao lado da lupa.
- **US4 (P3)** só a **trilha** de Filmes/Séries pagina; **a grade não muda**.

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001..FR-014, Clarifications (decisões do usuário).
2. `plan.md` — Decisões Invariantes D-001..D-010, Constitution Check, Riscos R-001..R-007, tabela de contratos.
3. `tasks.md` — 8 fases; a Fase 7 (emenda/migração) é a maior.
4. `logic/paginacao.md` — funções puras, tamanho de página, âncora de rolagem, tabela de teclas, topo (lupa+Guia), Vod.
5. `quickstart.md`; `.planning/memory/constitution.md` (foco, voltar, controle remoto).

## Testes de contrato (5 de 5)

- `tv-web/src/lib/focus/paging.navegacao-por-pagina.contract.test.ts` — 1 — Fase 2.
- `tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx` — 3 — Fases 3 (1) e 4 (2).
- `tv-web/src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx` — 1 — Fase 5.
- Rodar (de `tv-web/`): `npx vitest run src/lib/focus/paging.navegacao-por-pagina.contract.test.ts src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 049-navegacao-por-pagina`
- Travas de **outras** features que esta **vai** quebrar de propósito (emenda pré-aprovada, D-010; regravar a trava de cada uma): **018** (`LiveScreen.busca-categoria`), **024** (`LiveScreen.live-tv-ds-v14`…), **030** (`LiveScreen.epg-dados-agora`), **031** (`LiveScreen.epg-guia-completo`), **046** (`LiveScreen.memoria-foco`), **048** (`LiveScreen.live-paridade-v14`), **025** (`MoviesScreen.filmes-series-ds-v14`) e `VodCatalogScreen.limpar-historico`. Só emendar onde o teste assume "→ entra"/"→ vai às ações"; registrar `R-0NN` no `plan.md` da 049.

## Stubs criados

- `tv-web/src/lib/focus/paging.ts`: `pageSizeFor`, `pagedIndex` com `throw new Error('not implemented')` — implementar na T002.
- `usePageScrollAnchor.ts` **não existe** (T003).

## Armadilhas já mapeadas

- Página de canais = `floor(clientHeight / 84)`, **constante** 84 (`LIVE_ITEM_ROW_HEIGHT`): a lista é virtualizada, não medir linhas. Trilha: passo medido (`offsetTop`), fallback 56 — os contratos (jsdom, `offsetTop = 0`, `clientHeight` 640) dependem desse fallback: 7 canais e 11 categorias por página.
- Para cair na **mesma linha da tela** é preciso rolar a lista também (`pageSize*84` antes do commit, ou âncora por offset); só mudar o índice deixa o item na borda (`logic/paginacao.md` §3).
- A coluna 2 some de verdade: `previewAction`, `PREVIEW_ACTION_COUNT`, `setCol: 0|1|2` e o ramo do RETURN/OK. O contrato exige `.live-preview-panel` **sem** `button`/`[tabindex]`.
- `←/→` com o campo de busca com foco DOM real são do cursor (guarda de alvo editável do `useRemoteNav`, já existe); a paginação só vale com `topFocused` falso.
- `topFocused` hoje é "o ícone da lupa/campo"; agora há 2 ícones: `topIcon` em `useLiveSearch` (resetar em `resetSearchState`). O Guia some com a busca aberta e nunca existe no zapping (`zapOpen`).
- A lista de canais só monta a janela virtual (~13 linhas): testes não podem contar 20 `.live-item-name`.
- OK curto = `keyup`; os helpers `tap` disparam `keydown`+`keyup`. `Escape` = RETURN.
- Contratos emendados da 048 têm orçamento de 5 casos por feature: ao reescrever "ações em linha", **substituir**, não acrescentar.
- E2E: 5173 fixa; `npm run test:e2e -- --only` não funciona no PowerShell → `node e2e/run.mjs --only a,b --jobs 1`; `innerText` traz a caixa alta do CSS (comparar com `/i`).
- `docs/guia-praticas-app-tv/` (input/foco) não foi consultado no plano — olhar antes da Fase 3.

## Pendências do Analyze

- **A-001 (HIGH)** FR-012 (dicas do rodapé) é vago: `HintBar` pode não aceitar dica por foco. Decidir na T014: lista única `OK Entrar/Assistir · ← → Página · Segurar OK Favoritar · RETURN Voltar`.
- **A-002 (HIGH)** T023 pode estourar o orçamento de 5 casos ao reescrever a trava da 048: o teste "ações em linha" tem de ser **substituído** (não somado); se a trava recusar, reduzir casos e registrar em `R-0NN`.
- **A-003 (MEDIUM)** "mesma linha da tela" (FR-002) não é provada por contrato (jsdom sem layout); só o E2E da T028 mede. Aceito.
- **A-004 (MEDIUM)** Contrariar a Spec V14 §13/§33 exige a nota na ADR-011 (T033); sem ela a divergência não fica canônica.
- **A-005 (LOW)** "Ícone de Guia" × "Guia completo": nome acessível é "Guia completo"; seletor `.live-guide-button`.

## Gate de pronto

- 5/5 contratos verdes; `check-contract-tests.ps1` íntegro para 049 e para cada slug regravado.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` limpos; `npm run test:e2e` completo (conferir quem escuta a 5173); `quickstart.md` executado.
- Docs no Polish: `plan.md` (Estado Atual, Execution Notes), backlog via `update-feature-status.ps1`, nota na ADR-011, notas nos planos 048/024/031. Não acrescentar parágrafo de status no `CLAUDE.md`.
- TV física: **recomendação**, não gate.
