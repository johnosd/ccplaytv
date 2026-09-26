---
description: "Tasks de implementação — 020-ciclo-vida-player"
---

# Tasks: Ciclo de Vida do Player na TV

**Input**: `sdd/specs/020-ciclo-vida-player/{spec.md, plan.md}`

**Prerequisites**: `plan.md`, `spec.md`, `contract-tests.lock` (definição de
pronto — **testes travados, nunca editar**). `tv-web/src/lib/player/
screenSaver.ts` já existe, escrito pelo `sdd-plan` (módulo trivial, sem
decisão de design pendente).

**Organization**: Fase 1 confirma a base; Fase 2 fecha US1 (proteção de
tela); Fase 3 fecha US2 (visibilitychange — depende de US1 só
tecnicamente por reaproveitar o mesmo arquivo, não conceitualmente); Fase 4
é Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 ou US2

## Path Conventions

- Frontend: `tv-web/src/` — lógica de baixo nível em `lib/player/`,
  orquestração em `components/PlayerLayer.tsx`
- Testes: ao lado do arquivo (`*.test.ts(x)`); contrato em
  `*.ciclo-vida-player.contract.test.tsx` (travado)
- E2E: `tv-web/e2e/*.mjs`

Comando dos contratos (em `tv-web/`):
`npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar a base antes de tocar `PlayerLayer.tsx`.

- [x] T001 Rodar em `tv-web/`: `npx tsc -b` (esperado: 0 erros — `screenSaver.ts` já existe e compila); `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` (esperado: 4 vermelhos pelo motivo certo, ver tabela de `plan.md` → Estratégia de Testes); `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 020-ciclo-vida-player` íntegro.

**Registro da Fase**:

- Status: Concluída
- Feito: T001
- Contrato: sem contrato nesta fase (os 4 contratos da feature são verificados como vermelhos, não como critério desta fase)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 4/4 vermelhos pelo motivo certo (asserção, nunca erro de import/tipo/sintaxe); `check-contract-tests.ps1` → trava íntegra (4/4)
- Pendências: Nenhuma

---

## Phase 2: User Story 1 — Proteção de tela nunca apaga durante reprodução (Priority: P1) 🎯 MVP

**Objetivo**: a TV não entra em modo de proteção de tela enquanto o player
está em reprodução ativa (`playing`), para os três tipos de mídia.

**Independent Test**: iniciar a reprodução de qualquer tipo de mídia,
confirmar (via mock/spy de `screenSaver.ts`, já que o comportamento real só
é observável na TV física) que `disableScreenSaver` é chamado ao entrar em
`playing` e `enableScreenSaver` ao sair desse estado por qualquer caminho.

### Contrato da Fase

- `desliga a proteção de tela ao entrar em playing; religa ao pausar` — FR-001/FR-002, US1 AC1-2
- Comando: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

### Implementation

- [x] T002 [US1] Em `tv-web/src/components/PlayerLayer.tsx`: importar `disableScreenSaver`/`enableScreenSaver` de `../lib/player/screenSaver`. Adicionar um `useEffect` novo, keyed em `phase.kind === 'session' && phase.state === 'playing'` (D-004 do plano) — chama `disableScreenSaver()` ao entrar nesse estado, e o cleanup do próprio efeito chama `enableScreenSaver()` (cobre pausar, completar, erro, fechar e desmontar num só lugar) → contrato: "desliga a proteção de tela...".

### Testes da Fase

- [x] T003 [P] [US1] Teste adicional em `tv-web/src/components/PlayerLayer.test.tsx` (ou arquivo próprio, se preferir não misturar): confirmar que a proteção de tela permanece desligada durante o zapping (feature 016) — o canal continua tocando por baixo da lista sobreposta, sem uma segunda pausa/religamento (US1 AC3, D-004 "de graça").

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 1/4 relevante verde (o teste de screensaver) e `check-contract-tests.ps1` íntegro; `npx vitest run src/components` sem regressão; `npx tsc -b` limpo.

**Checkpoint**: proteção de tela controlada corretamente pelo estado de reprodução — US1 completa.

**Registro da Fase**:

- Status: Concluída
- Feito: T002, T003
- Contrato: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx -t "proteção de tela"` → 1/1 verde; `check-contract-tests.ps1` → trava íntegra (4/4)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/components/PlayerLayer.test.tsx` → 40/40 (T003 incluído); `npx vitest run src/components` → 63 passed + 3 ainda vermelhos como esperado (os 3 contratos de US2, Fase 3, ainda não implementados)
- Pendências: Nenhuma

---

## Phase 3: User Story 2 — Ocultar o app pausa a reprodução sem deixar rastro (Priority: P1)

**Objetivo**: ocultar o app pausa (filme/episódio) ou fecha (canal, D-002) a
reprodução sem áudio residual; voltar a ficar visível revalida a URL antes
de qualquer nova tentativa de retomar, caindo no erro já existente se a
revalidação falhar.

**Independent Test**: iniciar a reprodução, disparar `visibilitychange`
para oculto, confirmar pausa (filme/episódio) ou fechamento (canal) sem
áudio; disparar `visibilitychange` para visível, confirmar a chamada de
revalidação e o comportamento correto em sucesso/falha.

### Contrato da Fase

- `app oculto pausa um filme (capaz de pausar) sem fechar a sessão` — FR-003, US2 AC1, D-002
- `app oculto fecha a sessão de canal ao vivo, que não tem pausa real` — FR-003/FR-007, D-002
- `app volta a ficar visível: revalida a URL e mostra o erro existente se falhar` — FR-004/FR-005, US2 AC2-3, D-003
- Comando: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

### Implementation

- [x] T004 [US2] Em `tv-web/src/components/PlayerLayer.tsx`, dentro do `useEffect` de ciclo de vida da sessão já existente (o que faz `start()`/`teardown()`): registrar `document.addEventListener('visibilitychange', onVisibilityChange)` logo após a sessão ser criada, e removê-lo no `teardown()` já existente (D-006 do plano — nunca um efeito novo, reaproveita o cleanup já existente).
- [x] T005 [US2] Implementar `onVisibilityChange` (função local dentro do efeito, com acesso a `session`/`onClose`): se `document.visibilityState === 'hidden'` e a sessão ainda está aberta — se `session.capabilities.canPause`, chama `session.togglePause()` (pausa real, D-002 ramo filme/episódio) → contrato: "app oculto pausa um filme..."; senão (canal, `canPause=false`), chama `session.close()` e depois `onClose()` (D-002 ramo canal) → contrato: "app oculto fecha a sessão de canal...". Guardado por `isActive = state==='playing'||'buffering'` — achado durante a implementação (não previsto em prosa no plano, mas decorre direto do FR-003 "reprodução ATIVA"): sem esse guard, uma sessão já pausada manualmente ganharia uma segunda chamada de `togglePause()`, que a RETOMARIA (o toggle olha o estado atual) — exatamente o edge case que a spec já citava ("uma reprodução já pausada manualmente... não tem uma segunda transição visível de pausar").
- [x] T006 [US2] No mesmo `onVisibilityChange`: se `document.visibilityState === 'visible'` e `sessionRef.current` ainda existe (só acontece pra filme/episódio pausado — canal já fechou em T005; a checagem de `sessionRef.current` é o que garante FR-008, revalidação nunca fora de uma sessão aberta), chama `fetchPlayback(itemId)` de novo (D-003) — em sucesso, não faz nada (a sessão pausada existente permanece intocada); em falha, seta `phase` pro mesmo estado de erro que o `catch` de `start()` já usa (extraído para uma função `applyFetchError` compartilhada, reaproveitando a lógica de distinguir 409/`unavailableMessage` de outros erros/`genericErrorMessage`, e chamando `onSessionError?.(...)`) → contrato: "app volta a ficar visível...".

### Testes da Fase

- [x] T007 [P] [US2] Teste adicional em `tv-web/src/components/PlayerLayer.test.tsx`: ocultar e mostrar o app repetidamente em sucessão rápida nunca acumula múltiplos listeners nem múltiplas chamadas de `fetchPlayback` por ciclo (edge case da spec).
- [x] T008 [P] [US2] Teste adicional confirmando FR-006 (conclusão detectada ao voltar de oculto é tratada como conclusão normal) — não é contrato (`plan.md` já explica por quê: o mecanismo de conclusão em `publish()` já é agnóstico de visibilidade), mas vale uma cobertura explícita nomeando o cenário, para não depender só de inferência.

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 4/4 verdes e `check-contract-tests.ps1` íntegro; `npx vitest run src/components src/features/live src/features/movies src/features/series` sem regressão; `npx tsc -b` limpo.

**Checkpoint**: as duas user stories fecham o item 10 do backlog — Fase 1 do backlog inteira completa.

**Registro da Fase**:

- Status: Concluída
- Feito: T004–T008
- Contrato: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 4/4 verdes; `check-contract-tests.ps1` → trava íntegra (4/4)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/components/PlayerLayer.test.tsx` → 42/42; `npx vitest run src/components src/features/live src/features/movies src/features/series` → 231/233 sob paralelismo total (2 falhas em `SeriesScreen.favorites.test.tsx`, confirmadas 233/233 passando isoladas com `--no-file-parallelism` — mesma flakiness pré-existente documentada nas features 016/017/018/019, nada novo desta feature)
- Pendências: Bug pequeno na escrita do próprio T007 (não no código de produção) corrigido inline dentro da task, conforme passo 6 do sdd-execute: o teste assumia que o fake adaptador reportaria a pausa de volta sozinho, mas o driver de teste (assim como o resto da suíte) só atualiza `session.state` quando o teste chama `driver.callbacks?.onStateChange(...)` explicitamente — corrigido simulando esse callback antes da segunda ocultação.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T009 Criar `tv-web/e2e/ciclo-vida-player.mjs`: cenário end-to-end disparando `visibilitychange` via `page.evaluate` (força `document.visibilityState` com `Object.defineProperty` e dispara o evento, já que Playwright não tem uma API nativa de "ocultar aba" equivalente a minimizar a TV) — confirma pausa de filme e fechamento de canal ao ocultar, e a revalidação ao voltar. Adicionar ao `test:e2e` em `tv-web/package.json`.
- [x] T010 Rodar `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev`) em `tv-web/` — todos limpos (ou documentar honestamente o que não está, seguindo o padrão já usado pelas features 017/018/019 para os scripts pré-existentes quebrados nesta máquina Windows).
- [x] T011 Atualizar `CLAUDE.md` com o parágrafo da feature 020 (proteção de tela controlada pelo estado de reprodução; pausa automática ao ocultar o app, com fechamento em vez de pausa para canal ao vivo; revalidação da URL ao voltar a ficar visível).

### Checklist de Release

- [x] Fase 2 (US1 — Proteção de tela) concluída
- [x] Fase 3 (US2 — Visibilitychange) concluída
- [x] Testes de contrato todos verdes na suíte completa (4/4) e `check-contract-tests.ps1` íntegro
- [x] `npm run test` / `lint` / `build` limpos; `test:e2e` — script novo desta feature limpo (cadeia completa pode seguir com as limitações pré-existentes já documentadas)
- [ ] Verificação na TV física do comportamento real de `tizen.power` (recomendada, não bloqueante — spec, Assumptions)

**Registro da Fase**:

- Status: Concluída
- Feito: T009–T011
- Contrato: `npx vitest run src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 4/4 verdes; `check-contract-tests.ps1` → trava íntegra (4/4)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run` (suíte completa, paralela — comando real do plano) → 737/739 (2 falhas em `SeriesScreen.favorites.test.tsx`, confirmadas 3/3 passando isoladas com `--no-file-parallelism` — mesma flakiness pré-existente documentada nas features 016/017/018/019); `npm run lint` → 0 erros (só warnings pré-existentes, nenhum em arquivo tocado por esta feature); `npm run build` → limpo; `npm run test:e2e` (cadeia completa) → bloqueada logo no primeiro script (`e2e.mjs`, bug pré-existente já registrado no backlog: testa um diálogo de saída que não existe mais em `AddSourceScreen`) — rodando o restante da cadeia individualmente: `favoritos.mjs`/`zapping-live-tv.mjs` falham por limitação pré-existente já documentada (executablePath fixo do Linux sandbox, precisa de override local no Windows); `m3u-sob-demanda.mjs`/`capa-real.mjs`/`busca-por-categoria.mjs` verdes; `historico-continuar-assistindo.mjs` flakou uma vez sob carga pesada de execuções consecutivas nesta sessão, confirmado 11/11 verde em execução isolada logo depois (não uma regressão desta feature — os cenários que tocam `PlayerLayer.tsx` diretamente, A e B, passaram em toda tentativa); **`ciclo-vida-player.mjs` (script novo desta feature)** → 8/8 asserções verdes, confirmado estável em 3 execuções consecutivas isoladas mais 1 dentro da cadeia
- Pendências: Verificação na TV física do comportamento real de `tizen.power` (recomendada, não bloqueante). Achado real durante T009 (registrado como R-005 em `plan.md`): o adaptador `<video>` de desenvolvimento nunca chega a tocar de verdade quando a URL fica com requisição de rede pendente pra sempre (padrão usado por todos os scripts E2E deste repositório) — `.paused` nasce `true` e o evento nativo `pause` nunca dispara, tornando checagens por `.paused` inúteis para provar pausa/retomada real de filme em E2E; o script passou a verificar pausa/fechamento pela presença/ausência da camada de player no DOM, um sinal confiável e já usado por todos os outros scripts do projeto.

---

## Dependencies & Execution Order

- **Setup (1)** bloqueia tudo.
- **Fase 2 (US1)** depende só da 1.
- **Fase 3 (US2)** depende só da 1 — tecnicamente independente da Fase 2 (arquivos/efeitos diferentes dentro do mesmo `PlayerLayer.tsx`), mas a ordem sugerida evita dois efeitos novos em paralelo no mesmo arquivo.
- **Polish (4)** por último.

### Parallel Opportunities

- Tasks `[P]` dentro de cada fase, entre si.

---

## Implementation Strategy

### MVP First

1. Fase 1 (Setup).
2. Fase 2 (US1 — Proteção de tela) → **parar e validar**: screensaver controlado corretamente.

### Incremental Delivery

1. Setup → fundação confirmada.
2. Fase 2 (US1) → testar isoladamente → valor entregável.
3. Fase 3 (US2) → testar isoladamente → valor entregável, fecha o item 10.
4. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task para a user story correspondente.
- Commitar após cada fase ou grupo lógico coerente.
- Parar em qualquer checkpoint para validar a story isoladamente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
