# Handoff — 036-limpar-historico

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Stack: `tv-web/` React 19 + TS + Vite + Dexie (IndexedDB), client-first (ADR-008).
- Próximo comando: `/sdd-execute 036-limpar-historico`. Status no backlog: **Planejada** (0/43).
- Mudou em disco nesta sessão, fora dos docs da feature: `tv-web/src/lib/catalog/db.ts` (campo `historyHiddenAt` em `UserStateRecord` — definitivo) e o stub `tv-web/src/lib/catalog/historyRemoval.ts`. `db.ts` também tem mudanças **não commitadas da feature 034** (campos de conta da fonte) — não mexer nelas.

## O que a feature entrega

- **P1 (US1)** — tirar um título do `↺ Histórico` pela **tecla vermelha** na grade (Filmes/Séries) ou pela ação **"Remover do histórico"** no detalhe. A confirmação deixa a pessoa escolher: só tirar do Histórico (**a retomada fica e o título continua em "Continuar assistindo"** — DS §13.3, contrariando o texto antigo do backlog) ou tirar e apagar o progresso. Série = todos os episódios dela.
- **P2 (US2)** — aba nova **Privacidade** em Configurações: limpar Filmes / Séries / ambos da **lista ativa**, mesma escolha sobre o progresso, contagens incluindo registros "indisponíveis".
- Nunca muda favoritos nem "assistido"; nunca toca outra lista; Home só reflete (sem remoção na rail).

## Leitura obrigatória, em ordem

1. `sdd/specs/036-limpar-historico/spec.md` — FR-001..FR-028, Clarifications (todas as escolhas do usuário).
2. `plan.md` — Decisões Invariantes D-001..D-010, riscos R-001..R-004.
3. `tasks.md` — 5 fases, T001..T033.
4. `logic/remocao-historico.md` — **as regras**: §1 `isInHistory`, §2–§5 funções de dados, §6 modal, §7 tecla vermelha, §8 grade, §9 detalhe, §10 invalidação, §11 aba Privacidade.
5. `data-model.md` — o campo novo e o que cada leitura passa a ver.
6. `quickstart.md` — roteiro manual + comandos.
7. `.planning/memory/constitution.md` — foco sem becos sem saída, voltar restaura foco, caminho completo por controle.

## Testes de contrato

- `tv-web/src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts` — 4 testes (C1–C4), Fase 1.
- `tv-web/src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx` — 1 teste (C5), Fase 2.
- Rodar (em `tv-web/`): `npx vitest run src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx`
- Integridade (raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 036-limpar-historico`
- Vermelho confirmado: C1–C4 `Error: not implemented`; C5 `Unable to find role="dialog" and name /histórico/i` (a grade carrega e o foco está em "Filme B" — o teste chega até a tecla vermelha).
- Travas de **outras** features que esta pode quebrar: 025 (`history.filmes-series-ds-v14.contract.test.ts` — `listPlayed` muda), 019 (`userStateRepository.historico.contract.test.ts`, `progressRecorder.historico.contract.test.ts`), 026 (`SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`), 032/033/035 (contratos de `MovieDetailScreen`/`SeriesDetailScreen`).

## Stubs criados

- `tv-web/src/lib/catalog/historyRemoval.ts` — tipos `HistoryRemovalMode`, `HistoryClearScope`, `HistoryScopeSummary`, `HistorySummary` (definitivos) e `isInHistory`, `removeMovieFromHistory`, `removeSeriesFromHistory`, `clearHistory`, `summarizeHistory` com `throw new Error('not implemented')`. Assinaturas presas pelos contratos (inclusive o parâmetro `database` no fim).
- `db.ts` — `historyHiddenAt?: number` em `UserStateRecord` (definitivo).

## Armadilhas já mapeadas

- **Não apagar `lastWatched`** para tirar do Histórico: "Continuar assistindo" (`getContinueWatching`) ordena por ele. Esconder com `historyHiddenAt` (D-001) e filtrar **só** em `listPlayed` (D-002).
- **Sem bump do Dexie** (continua v12): o campo não é indexado. Se alguém sugerir índice, reabrir o design.
- `isInHistory` usado em `userStateRepository.ts` pode criar import circular com `historyRemoval.ts` (que importa de `userStateRepository`) — T002 diz como resolver.
- C2 depende de `updateProgress` gravar `lastWatched = Date.now()` **maior** que `historyHiddenAt` — por isso `historyHiddenAt = max(now, lastWatched)` e comparação estrita.
- Tecla não mapeada **não** é capturada pelo `Modal`: se a tela passar `onRemoveKey` com o modal aberto, a tecla vermelha chega à tela de baixo. Não passe o handler enquanto o modal estiver aberto (§8).
- `registerRemoveColorKey` é **estrito** (como `registerMediaKeys`), não leniente como a amarela. No navegador não registra → a dica **não** aparece; o E2E prova a dica com `tizen.tvinputdevice` falso via `page.addInitScript`.
- `focusedIndexHint` do snapshot da grade é gravado desde a 025 mas **nunca lido** — T021 passa a usá-lo (voltar do detalhe depois de remover).
- `computeNeighbor` hoje é privada em `useFavoriteToggle.ts` — extrair (T011), não duplicar.
- A ação nova do detalhe vai **por último** no array: o índice 0 é sempre a ação primária (contratos 025/033).
- A aba Privacidade muda a captura de Configurações em `e2e/paridade-limpeza.mjs` (R-003) — atualizar só essa linha de base.
- E2E: `executablePath` dos `e2e/*.mjs` aponta para o Chromium do sandbox Linux; no Windows precisa do override temporário, como nos outros scripts. Reiniciar `npm run dev` antes do `test:e2e`.
- Flakes conhecidos da suíte cheia: `*.favorites.test.tsx` e `LiveScreen.test.tsx` sob paralelismo — confirmar isolados.
- Os contratos da **034** (`sourceAccount`, `accountCheck`, `importPipeline` `.fontes-estado.contract.test.*`) estão vermelhos por design (feature não executada) — não são regressão desta.

## Pendências do Analyze

- A1 (MEDIUM) — Item escondido com retomada mantida só sai de "Continuar" pela Privacidade ("…e apagar progresso") ou reproduzindo de novo (R-001). Recomendação: aceitar como está (Home fora de escopo pela spec) e registrar na convergência.
- A2 (LOW) — Em Séries, "indisponíveis" conta **episódios**, não séries (herdado da 025). Recomendação: manter o texto "registros indisponíveis", nunca "séries".
- A3 (LOW) — SC-003 (≤ 1 s) não tem medição dedicada. Recomendação: o E2E (T030) cronometra tecla → grade atualizada e registra o número.

## Gate de pronto

- Contratos 5/5 verdes + `check-contract-tests.ps1 -Slug 036-limpar-historico` íntegro + travas das features listadas acima íntegras.
- Em `tv-web/`: `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build:tizen`, `npm run test:e2e` (com `e2e/limpar-historico.mjs` incluído).
- `quickstart.md` executado no navegador.
- Docs no Polish: `CLAUDE.md` (parágrafo da 036), item 57 do backlog, nota da tecla vermelha no item 58.
- TV física: **recomendada, não gate** (R-002 — nome/`keyCode` da tecla vermelha).
