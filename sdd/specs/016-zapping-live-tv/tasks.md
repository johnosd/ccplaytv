---
description: "Tasks de implementação — 016-zapping-live-tv"
---

# Tasks: Zapping por Cima do Vídeo em Live TV

**Input**: `sdd/specs/016-zapping-live-tv/{spec.md, plan.md, logic/zapping.md}`

**Prerequisites**: `plan.md` (obrigatório), `spec.md` (obrigatório),
`logic/zapping.md` (contrato de props/pseudocódigo — obrigatório para as
fases de implementação)

**Organization**: Tasks agrupadas por user story (US1 = P1, US2 = P2) para
permitir teste independente de cada uma, seguindo `logic/zapping.md` como
contrato estrito de "como".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 ou US2

## Path Conventions

- Componente compartilhado de reprodução: `tv-web/src/components/PlayerLayer.tsx` (+ `.test.tsx`)
- Tela de Live TV: `tv-web/src/features/live/LiveScreen.tsx` (+ `.test.tsx`, `.favorites.test.tsx`)
- CSS: `tv-web/src/features/screens.css`, `tv-web/src/index.css`
- E2E: `tv-web/e2e/zapping-live-tv.mjs`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: nenhuma infraestrutura nova — a feature reaproveita 100% do que
já existe (React Query, virtualização, `useRemoteNav`). Fase reduzida a
confirmar a base antes de tocar código.

- [X] T001 Rodar `npm run test` e `npm run build` em `tv-web/` para confirmar baseline verde antes de qualquer mudança (nenhuma alteração de código nesta task).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o mecanismo genérico de `PlayerLayer` (D-001 a D-004) — toda
user story depende dele, porque nem abrir o zapping nem fechá-lo
automaticamente funcionam sem ele.

**⚠️ CRITICAL**: nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T002 Em `tv-web/src/components/PlayerLayer.tsx`: adicionar as props novas `topLayer?`, `onIdleSelect?`, `onEnteredPlaying?`, `onSessionError?` à interface `PlayerLayerProps`, exatamente como definidas em `logic/zapping.md` § "Contrato novo de PlayerLayer". Exportar o tipo `PlayerLayerTopLayer`.
- [X] T003 [Story: fundação] Em `PlayerLayer.tsx`: refatorar o JSX de retorno para um único `return` (remover o `return` cedo do caminho de erro), com `isErrorScreen` decidindo o miolo internamente, mantendo `role`/`aria-label` condicionais — ver `logic/zapping.md` § 3 ("JSX — um único corpo"). Este é um pré-requisito estrutural: sem ele, `topLayer.content` não aparece durante uma falha de troca.
- [X] T004 Em `PlayerLayer.tsx`: desenhar `{topLayer && <div className="player-zap-scrim">{topLayer.content}</div>}` dentro de `.player-overlay`, depois do miolo normal/erro.
- [X] T005 Em `PlayerLayer.tsx`: rotear `useRemoteNav`'s `onDirection`/`onSelect`/`onBack` — quando `topLayer` está presente, chamar `topLayer.onDirection`/`topLayer.onSelect`/`topLayer.onBack` e retornar, antes do comportamento padrão (ver pseudocódigo em `logic/zapping.md` § "Roteamento do useRemoteNav").
- [X] T006 Em `PlayerLayer.tsx`: no ramo `onSelect` padrão (sem `topLayer`), quando `!controlsVisible` e `playerControlsActions(...).length === 0`, chamar `onIdleSelect?.()` em vez de `revealControls()`.
- [X] T007 Em `PlayerLayer.tsx`: dentro de `publish()`, disparar `onEnteredPlaying?.()` na primeira transição de `session.state` para `'playing'` (flag local `enteredPlayingFired`, resetada por sessão — ver pseudocódigo) e `onSessionError?.(message)` quando `session.state === 'error'`, com a mesma mensagem já sanitizada usada pela tela de erro nativa.
- [X] T008 Em `tv-web/src/index.css`: adicionar o token `--player-zap-scrim` (derivado de `--bg` com alpha, sem valor literal solto em `screens.css`).
- [X] T009 Em `tv-web/src/features/screens.css`: adicionar `.player-zap-scrim` (`position: absolute; inset: 0; display: flex; background: var(--player-zap-scrim);`) e `.player-zap-columns` (mesmas métricas de `.screen`+`.screen-row`: `position: absolute; inset: 0; padding: 80px 96px; display: flex; flex-direction: row; gap: 40px;`).

### Tests da Fase

- [X] T010 [P] Em `PlayerLayer.test.tsx`: teste novo — com `topLayer` definido, uma tecla de direção/SELECT/RETURN chama o handler de `topLayer` correspondente, e NUNCA o comportamento padrão de controles (usar o `driver`/`fakeFactory` já existente no arquivo).
- [X] T011 [P] Em `PlayerLayer.test.tsx`: teste novo — SELECT sem `topLayer`, sem controles disponíveis (capacidades de canal ao vivo — sem seek/pause), chama `onIdleSelect` em vez de `revealControls`.
- [X] T012 [P] Em `PlayerLayer.test.tsx`: teste novo — `onEnteredPlaying` dispara exatamente uma vez quando a sessão atinge `playing` pela primeira vez, e não dispara de novo num segundo ciclo buffering→playing do MESMO item (simular via `driver.callbacks.onStateChange`).
- [X] T013 [P] Em `PlayerLayer.test.tsx`: teste novo — `onSessionError` dispara com a mensagem sanitizada quando a sessão emite erro; com `topLayer` presente, o teste confirma que o conteúdo do `topLayer` continua no DOM (a tela de erro nativa não substitui a árvore do zapping).

**Critério de Conclusão**: `PlayerLayer` sustenta o modo `topLayer` de ponta a ponta, sem nenhuma tela consumi-lo ainda — `LiveScreen`, `MovieDetailScreen` e `SeriesDetailScreen` continuam se comportando exatamente como hoje (nenhum deles passa as props novas ainda).

**Checkpoint**: fundação pronta — User Story 1 pode começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T002 a T013
- Testes executados: `npm run test -- --run src/components/PlayerLayer.test.tsx` (verificado nesta revisão: 39 testes passando); `npm run build` (verificado nesta revisão, após correção — ver Fase 5)
- Pendências: Nenhuma

---

## Phase 3: User Story 1 - Trocar de canal sem perder o que já estava assistindo (Priority: P1) 🎯 MVP

**Objetivo**: abrir a lista por cima do vídeo com OK, navegar, trocar de
canal sem gap perceptível, ou fechar sem trocar — FR-001 a FR-009,
SC-001/SC-002/SC-003.

**Independent Test**: com um canal tocando, pressionar OK, navegar até
outro canal e selecioná-lo — o novo canal toca sem gap perceptível.
Reabrir e fechar (RETURN) sem trocar — o canal original nunca parou.

### Implementation

- [x] T014 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: extrair a JSX das três colunas (`.live-column-groups`, `.live-column-channels`, `.live-preview-panel`, sem o wrapper `<div className="screen screen-row">`) para uma função interna `renderColumns()` — ver `logic/zapping.md` § "JSX compartilhada". O retorno normal (`!playing`) passa a envolver `renderColumns()` com `<div className="screen screen-row">`, sem mudança de comportamento visível.
- [x] T015 [US1] Em `LiveScreen.tsx`: extrair `handleTrailDirection(dir)`/`handleTrailSelect()` do corpo atual do `useRemoteNav` (mesma lógica, sem a guarda `if (playing) return`) — o hook normal passa a chamá-las quando `!playing`, sem mudança de comportamento.
- [x] T016 [US1] Em `LiveScreen.tsx`: adicionar estado `const [zapOpen, setZapOpen] = useState(false)` e `const lastGoodChannelRef = useRef<CatalogItemOut | null>(null)`.
- [x] T017 [US1] Em `LiveScreen.tsx`: implementar `openZapping()` exatamente como em `logic/zapping.md` § "Abrir (via onIdleSelect)" — computa a categoria do canal tocando por `groupLabel(playing.original_group)`, entra nela se necessário, foca o canal, `setCol(1)`, `setZapOpen(true)`.
- [x] T018 [US1] Em `LiveScreen.tsx`: em `handleTrailSelect()`, adicionar o ramo `if (zapOpen)` — mesmo canal fecha (`setZapOpen(false)`) sem tocar `playing`; canal diferente grava `lastGoodChannelRef.current = playing` e chama `setPlaying(activeChannel)`, mantendo `zapOpen` (D-007/D-008).
- [x] T019 [US1] Em `LiveScreen.tsx`: passar ao `<PlayerLayer>` já renderizado (`{playing && <PlayerLayer .../>}`) as props novas: `onIdleSelect={openZapping}`, `onEnteredPlaying={() => setZapOpen(false)}`, `topLayer={zapOpen ? { content: <div className="player-zap-columns">{renderColumns()}</div>, onDirection: handleTrailDirection, onSelect: handleTrailSelect, onBack: () => setZapOpen(false) } : null}`.

### Tests da Fase

- [x] T020 [P] [US1] Em `LiveScreen.test.tsx`: `onIdleSelect` (simulado via o `createAdapter`/props do `PlayerLayer` de teste, ou diretamente chamando a função exposta) abre o zapping com foco no canal tocando, na categoria correta (D-006) — cobre FR-003/SC-002.
- [x] T021 [P] [US1] Em `LiveScreen.test.tsx`: selecionar outro canal dentro do zapping chama `setPlaying` para o novo canal e mantém `topLayer` até `onEnteredPlaying` — cobre FR-005/FR-006.
- [x] T022 [P] [US1] Em `LiveScreen.test.tsx`: selecionar o mesmo canal que já está tocando fecha o zapping sem chamar `setPlaying` de novo — cobre FR-007/cenário 4 da US1.
- [x] T023 [P] [US1] Em `LiveScreen.test.tsx`: RETURN com o zapping aberto fecha só ele (`zapOpen` volta a `false`), sem chamar `onBack` da tela — cobre FR-008/cenário 5.
- [x] T024 [P] [US1] Em `LiveScreen.test.tsx`: trocar de categoria dentro do zapping (setas) navega exatamente como fora dele — cobre FR-004/cenário 6.
- [x] T025 [P] [US1] Em `LiveScreen.test.tsx`: selecionar um canal, e antes de `onEnteredPlaying` disparar, selecionar outro — só a última seleção sobrevive (`lastGoodChannelRef`/`playing` refletem só a última escolha) — cobre FR-009/cenário 7.

**Critério de Conclusão**: os 7 cenários de aceite da US1 passam em teste automatizado (exceto a ausência de gap perceptível em si, que é só verificável manualmente — constitution); `npm run test` limpo.

**Checkpoint**: User Story 1 funcional e testável isoladamente — MVP do zapping.

**Registro da Fase**:

- Status: Concluída
- Feito: T014 a T025
- Testes executados: `npm run test -- --run src/features/live/LiveScreen.test.tsx` (verificado nesta revisão, após correção de 3 erros de tipo encontrados em `npm run build` — ver "Achados desta revisão" abaixo)
- Pendências: Nenhuma

---

## Phase 4: User Story 2 - Recuperação automática quando o canal escolhido falha (Priority: P2)

**Objetivo**: reverter automaticamente para o canal anterior com aviso
quando a troca falha — FR-010 a FR-012, SC-004.

**Independent Test**: escolher, na lista de zapping, um canal cuja fonte
falha propositalmente — a reprodução volta ao canal anterior, com aviso
visível, e a pessoa pode escolher outro canal imediatamente.

### Implementation

- [x] T026 [US2] Em `LiveScreen.tsx`: implementar `onSessionError` no `<PlayerLayer>` exatamente como em `logic/zapping.md` § "Fechar automaticamente quando a troca terminar" — se `lastGoodChannelRef.current` existir, reverte (`setPlaying(fallback)`, limpa o ref, `showToast(...)`, mantém `zapOpen`); se não existir (falha da entrada normal, fora de zapping), não faz nada (delega ao comportamento nativo do `PlayerLayer`).

### Tests da Fase

- [x] T027 [P] [US2] Em `LiveScreen.test.tsx`: simular a sessão nova caindo em erro (via `driver.callbacks.onError` do `createAdapter` fake) durante uma troca de zapping — `playing` reverte para o canal anterior, toast aparece, `zapOpen` continua `true` — cobre US2 cenários 1-3.
- [x] T028 [P] [US2] Em `LiveScreen.test.tsx`: uma falha na entrada NORMAL (sem zapping aberto, `lastGoodChannelRef.current` nulo) não dispara reversão nenhuma — a tela de erro nativa do `PlayerLayer` continua aparecendo como hoje (R-003 do `plan.md`).

**Critério de Conclusão**: os 3 cenários de aceite da US2 passam em teste automatizado; `npm run test` limpo.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T026, T027, T028
- Testes executados: `npm run test -- --run src/features/live/LiveScreen.test.tsx` (inclui T027/T028, verificado nesta revisão)
- Pendências: Nenhuma
- Notas: reversão automática (`onSessionError`) cobre tanto a falha da sessão já aberta (`session.state === 'error'`) quanto a falha do próprio `fetchPlayback` na troca (rejeição da promise, antes de existir sessão) — extensão além do pseudocódigo original de `logic/zapping.md`, correta e mais completa: qualquer falha durante uma troca de zapping reverte, não só a que já chegou a abrir sessão.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: E2E, regressão de favoritar dentro do zapping, e os gates da
constitution.

- [x] T029 Em `tv-web/src/features/live/LiveScreen.favorites.test.tsx`: teste novo — segurar OK (ou tecla amarela) sobre um canal dentro do zapping favorita/desfavorita normalmente, sem disparar troca de canal (edge case da spec — distinção por tempo de tecla já usada em todo o app).
- [x] T030 [P] Criar `tv-web/e2e/zapping-live-tv.mjs` (mesmo padrão dos scripts existentes — `chromium.launch` direto, fixture HTTP local): cenário 1 — OK abre a lista sobre o vídeo tocando; cenário 2 — trocar de canal fecha a lista e o novo toca; cenário 3 — RETURN fecha sem interromper; cenário 4 — canal com URL de reprodução inválida reverte automaticamente com aviso.
- [x] T031 Adicionar `zapping-live-tv.mjs` ao script `test:e2e` em `tv-web/package.json` (mesmo padrão de `favoritos.mjs`/`capa-real.mjs`/`m3u-sob-demanda.mjs`).
- [x] T032 Rodar `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev` rodando) em `tv-web/` — todos limpos.
- [x] T033 Atualizar `CLAUDE.md` — parágrafo da feature 016 (mesmo padrão das features 014/015 já documentadas), movendo a menção de "planejada" para "em execução"/"código-completo" conforme o estado real ao final desta fase.

### Checklist de Release

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (User Story 1) concluída
- [x] Fase 4 (User Story 2) concluída
- [x] `npm run test` limpo (679/679, verificado nesta revisão)
- [x] `npm run lint` limpo (só warnings pré-existentes, sem relação com esta feature)
- [x] `npm run build` limpo
- [x] `npm run test:e2e` limpo para o script desta feature (`zapping-live-tv.mjs`, 11 asserções, verificado ponta a ponta num Chromium real — ver nota abaixo); os 4 scripts irmãos já existentes não foram alterados
- [x] Verificação manual — **parcial, na TV física real (2026-09-25)**: com um canal tocando, OK trouxe a trilha por cima do vídeo (que continuou tocando) — FR-001/FR-002; selecionar outro canal trocou a sessão — FR-005; **SC-001 (nenhum instante perceptível de tela preta/muda/congelada na troca) confirmado explicitamente pelo usuário na TV física** — é o requisito central da feature e o único que a constitution reconhece como estruturalmente improvável de provar fora de hardware real. Não confirmados nesta sessão (cobertos só por teste automatizado até aqui): fechar sem trocar (RETURN/cenário 5), selecionar o próprio canal tocando (cenário 4), foco inicial explícito no canal certo (SC-002), trocar de categoria dentro do zapping (cenário 6), sequência rápida de trocas (cenário 7/SC-003), e os 3 cenários de US2 (falha reverte automaticamente)

**Nota sobre `npm run test:e2e` nesta sessão**: todos os `e2e/*.mjs` do
projeto (não só o novo) usam `executablePath: '/opt/pw-browsers/chromium'`
hardcoded — um caminho de sandbox Linux que não existe neste ambiente
Windows local. Isso não é uma regressão desta feature: `favoritos.mjs`
(já existente, intocado) falha da mesma forma pelo mesmo motivo quando
rodado aqui. `zapping-live-tv.mjs` foi validado ponta a ponta com uma
cópia temporária apontando pro Chromium local do Windows (11/11
asserções verdes, incluindo os 4 cenários da spec) e depois descartada —
o arquivo definitivo mantém o mesmo padrão dos scripts irmãos. Também foi
preciso `page.route('**/stream/**', () => {})` para deixar as URLs
fictícias de stream pendentes (sem isso, o evento `error` nativo do
Chromium — conexão recusada, já que nada serve essas URLs — competia
com os eventos sintéticos `playing`/`error` que o script dispara para
avançar a máquina de estados sem decodificação de vídeo real, mesma
limitação documentada em `htmlVideoAdapter.ts`). `e2e.mjs` (o script mais
antigo, não relacionado a esta feature) falha por um bug pré-existente já
conhecido e fora de escopo (R-009 da feature 014, backlog).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories (é o mecanismo genérico de `PlayerLayer` que ambas as stories consomem)
- **User Story 1 (Phase 3)**: depende do Foundational
- **User Story 2 (Phase 4)**: depende do Foundational E da Phase 3 (reaproveita `lastGoodChannelRef`/`zapOpen` que a US1 introduz — não é paralelizável com ela na prática, apesar de nominalmente P2 depois de P1)
- **Polish (Phase 5)**: depende de US1 e US2 completas

### Parallel Opportunities

- T010-T013 (testes de `PlayerLayer`, Phase 2) podem rodar em paralelo entre si.
- T020-T025 (testes de `LiveScreen`, Phase 3) podem rodar em paralelo entre si, depois de T014-T019.
- T027-T028 (Phase 4) podem rodar em paralelo entre si.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (mecanismo genérico de `PlayerLayer`)
3. Completar Fase 3: User Story 1
4. **PARAR E VALIDAR**: testar US1 isoladamente (trocar de canal sem gap, fechar sem trocar)

### Incremental Delivery

1. Setup + Foundational → mecanismo pronto, nenhuma tela ainda o usa
2. User Story 1 → zapping funcional, sem recuperação de erro → considerar MVP
3. User Story 2 → recuperação automática
4. Polish → E2E, regressão de favoritos, gates da constitution

## Notes

- `[P]` = arquivos diferentes ou testes independentes dentro do mesmo arquivo, sem dependência de estado entre eles
- `[Story]` mapeia a task para US1 ou US2
- Commitar após cada fase fechada
- `logic/zapping.md` é o contrato de "como" — qualquer desvio dele durante a implementação deve voltar para `plan.md` → Riscos e Decisões, não só para o código

## Achados desta revisão (2026-09-25)

A implementação das Fases 1-4 (T001-T028) foi conduzida por outro agente e
revisada nesta sessão contra `spec.md`/`plan.md`/`logic/zapping.md`. A
arquitetura está fiel ao contrato (roteamento de `topLayer`, `onIdleSelect`,
`onEnteredPlaying`/`onSessionError`, extração de `handleTrailDirection`/
`handleTrailSelect`/`renderColumns`, CSS/token novos) — sem desvio de design.
Dois problemas reais foram encontrados e corrigidos nesta revisão:

1. **`npm run build` quebrava** (`tsc -b`) com 3 erros em
   `LiveScreen.test.tsx`: um campo `method` inexistente em
   `CatalogItemPlayback` usado em 3 mocks de `fetchPlayback` (T021/T025), e
   `renderLive(undefined, onBack)` (T023) chamando a função helper de teste
   com um segundo argumento que ela não aceitava — o `onBack` passado ao
   `<LiveScreen>` dentro do helper estava hardcoded, então o teste nunca
   verificava de fato o que alegava verificar. Corrigido: os mocks agora
   usam a forma completa de `CatalogItemPlayback` (mesmo padrão já usado
   mais acima no arquivo), e `renderLive` ganhou um segundo parâmetro
   opcional `onBack`. O outro agente só tinha rodado `vitest` (transform via
   esbuild, mais permissivo) e nunca chegou a rodar `npm run build` de
   verdade antes de marcar as fases como concluídas — por isso o problema
   não tinha sido percebido.
2. Os blocos "Registro da Fase" da Fase 2 e da Fase 3 estavam preenchidos
   com o conteúdo um do outro (deslocados por uma fase). Corrigido.

Fase 5 (Polish, T029-T033) **não tinha sido executada** apesar de o
trabalho ter sido reportado como concluído — nenhum dos 5 itens estava
feito (confirmado por leitura direta do código/arquivos, não só pelos
checkboxes): sem teste de favoritar dentro do zapping, sem
`e2e/zapping-live-tv.mjs`, sem entrada em `test:e2e` do `package.json`, sem
rodar o gate completo, sem atualizar `CLAUDE.md`.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
