# Tasks: tarefas longas fora do caminho de navegação das vitrines

**Slug**: `089-tarefas-longas-fora-navegacao`

## Format: `[ID] [P?] [Story] Description`

- `[P]` = pode rodar em paralelo com outras `[P]` da mesma fase.
- `[US1]`/`[US2]`/`[US3]` = a user story que a task serve.

## Path Conventions

| O quê | Onde |
| --- | --- |
| Medição | `tv-web/src/lib/perf/` |
| Painel e componentes | `tv-web/src/components/` |
| Vitrine | `tv-web/src/features/vod/` |
| Sonda e coletor | `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/` |
| Evidências | `sdd/specs/089-tarefas-longas-fora-navegacao/evidencias/` |
| Config de teste | `tv-web/vite.config.ts` (`TESTES_TS_COM_DOM`) |

## Phase 1: Setup

**Objetivo**: confirmar o ponto de partida antes de escrever qualquer linha.

### Implementation

- [ ] T001 Rodar os 5 contratos travados e confirmar que estão **vermelhos pelos motivos** da tabela em `plan.md` →
      `## Estratégia de Testes`. Nenhum pode falhar por import, sintaxe ou tipo.
- [ ] T002 Conferir as **nove** travas (089 + 052, 053, 057, 082, 085, 086, 087, 088) → **SC-010**. Qualquer `FAIL`
      aqui é mexida fora do fluxo: parar e reportar.

### Critério de Conclusão

Os 5 contratos vermelhos pelo motivo certo e as nove travas íntegras.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 2: Foundational — a sonda consertada e o instrumento pronto

**Objetivo**: ter as quatro janelas de cada rodada valendo, e a medida do atraso funcionando, **antes** de gastar a
primeira instalação na TV.

### Contrato da Fase

Os 5 testes travados ficam verdes nesta fase:

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts
```

### Implementation

- [ ] T010 [US3] `tv-web/src/lib/perf/autopilot.ts`: substituir o literal `12` de `irPara` por um limite derivado do
      pior caso (`JANELA_MS / CADENCIA_MS` descidas, com margem — ~60). Ler `logic/atraso-e-sonda.md` §2 **antes**:
      a trava do `Enter` não muda → contrato: *volta à topbar de 25 fileiras abaixo* e *não aciona nada quando o foco
      nunca alcança a topbar*.
- [ ] T011 [US1] `tv-web/src/lib/perf/keyDelay.ts`: implementar `summarizeKeyDelays` a partir do stub, pelas faixas e
      chaves de `logic/atraso-e-sonda.md` §1. Arredondar **só na saída**; faixa vazia é **omitida** → **FR-002**,
      contrato: os 3 testes de `keyDelay`.
- [ ] T012 [US1] `tv-web/src/lib/perf/keyDelay.ts`: implementar `createKeyDelayTracker` — guarda os instantes de
      `keydown` (em `performance.now()`) e zera a cada `snapshot`, no mesmo formato de janela do `longTasks.ts`.
- [ ] T013 [US1] `tv-web/src/components/PerfOverlay.tsx`: alimentar o rastreador no `onKey` que já existe e emitir as
      chaves de atraso no **mesmo lote de ~5 s** das demais (D-004). Atenção: `longTasks.takeWindows()` já é consumido
      por `attributeLongTasks` — passar a **mesma** lista para as duas contas, sem drenar duas vezes.
- [ ] T014 [US3] Ensaiar o conserto da sonda **no PC**, com Playwright e um servidor falso, confirmando `falhas = 0`
      num roteiro curto. Script no scratchpad, nunca no repositório → **FR-009**.
- [ ] T015 Confirmar que o pacote **normal** não leva nada disso: `npm run build` e procurar os marcadores
      (`atrasoAte50Ms`, `summarizeKeyDelays`, `createKeyDelayTracker`) em `dist/assets` → **FR-008**, **SC-011**.

### Testes da Fase

- [ ] T016 Teste do rastreador (`keyDelay.test.ts`, **não** travado): `snapshot` zera as teclas, e duas janelas
      seguidas não reaproveitam a tecla da anterior.
- [ ] T017 Teste de que o lote emitido só tem chaves numéricas do conjunto fechado, nos moldes de `metricsChannel.test.ts`.

### Critério de Conclusão

`npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts` → **5/5 verdes** e `check-contract-tests.ps1` íntegro para as nove.
`npm run test`, `tsc -b`, `lint` (com o ratchet) e `build` verdes; o pacote normal sem marcador; e o ensaio no PC
mostrando `falhas = 0`.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 3: User Story 1 — nomear o dono (P1) 🎯 decide todo o resto

**Objetivo**: saber **de quem** são os 95,4%, com número do aparelho. **Rodada 1 de 4.**

### Implementation

- [ ] T020 [US1] TV (**pedir autorização**): rodada de atribuição pelo `quickstart.md` §4, com a medida do atraso
      ligada. Esperar `"janela":0` e **`falhas = 0`** (se não vier 0, o T010/T014 não fecharam — voltar, não insistir).
- [ ] T021 [US1] Ler o resultado pela tabela de `logic/atraso-e-sonda.md` §1 e **nomear** o trabalho dominante. Se os
      atrasos saírem espalhados, isso é conclusão válida: elimina a navegação por completo (R-001).
- [ ] T022 [US1] Se a soma ficar muito abaixo do total, acrescentar **uma** medida (D-003) e registrar por que ela
      entrou. Não enfileirar várias → **FR-003**.
- [ ] T023 [US1] Gravar `evidencias/medicao-tv-<data>.md`: aparelho, tabela por janela, a atribuição, classificação
      (**gate**), leitura honesta e **como reproduzir a medição** (comandos do `quickstart.md` §4). **Ler o `.jsonl`
      atrás de texto do provedor antes** → **FR-013**, **FR-014**, **SC-009**.
- [ ] T024 [US1] Reinstalar o **pacote normal** e avisar o usuário → **FR-015**.
- [ ] T025 [US1] **Ponto de decisão**: se o alvo exigir Worker ou outro formato de gravação, **parar** e reportar com
      os números — a feature encerra pelo **FR-011**. Caso contrário, seguir para a Fase 4 com o alvo nomeado.

### Critério de Conclusão

O trabalho dominante nomeado com número do aparelho, evidência gravada, pacote normal de volta na TV, e a decisão do
T025 tomada **explicitamente** — não por omissão. `falhas = 0` na rodada.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 4: User Story 2 — reduzir (P1)

**Objetivo**: mover os três números, com ganho medido em duas rodadas. **Rodadas 2 e 3 de 4** (a 4ª é folga).

### Implementation

- [ ] T030 [US2] Aplicar a mudança que a atribuição aponta, no **menor escopo possível**. Se o alvo estiver em
      `features/vod/VodShowcaseScreen.tsx` ou `lib/useRemoteNav.ts`, lembrar do **teto do ratchet** (D-008): pode
      exigir extração como passo próprio → **FR-004** (comportamento intacto).
- [ ] T031 [US2] Se a mudança tiver efeito visual — inclusive **mais tempo de card sem capa** — medir a alternativa e
      **mostrar a tela ao usuário antes de integrar** → **FR-006**; precedente da 083.
- [ ] T032 [US2] TV (**pedir autorização**): rodada de verificação, mesmo roteiro de duração fixa.
- [ ] T033 [US2] TV (**pedir autorização**): **segunda** rodada independente na mesma sessão → **FR-005**, **SC-005**.
      Ganho que aparece em só uma não conta.
- [ ] T034 [US2] Mudança sem ganho nas duas rodadas **sai**, e o que foi tentado e descartado é registrado com os
      números → **FR-005**, **SC-009**.
- [ ] T035 [US2] Reportar `assembly` → `revealMs` (SC-007) e `entry` → `readMs` (SC-008) das mesmas rodadas, para
      confirmar que não regrediram → **FR-012**.
- [ ] T036 [US2] Reinstalar o pacote normal e avisar o usuário → **FR-015**.
- [ ] T037 [US2] Se o orçamento de quatro rodadas acabar sem o alvo, **encerrar declarando** o alvo não cumprido, com
      a causa nomeada e o que foi descartado → **FR-010**.

### Testes da Fase

- [ ] T040 Teste: a ordem de navegação (`← → ↑ ↓`) e a entrada/saída da lista lateral seguem iguais depois da mudança,
      em `features/vod/` → **FR-004** (complementa as travas de 052/053, não as substitui).
- [ ] T041 Teste: card sem capa disponível mostra moldura e **título real**, sem nota, posição ou capa inventados →
      **FR-007**.

### Critério de Conclusão

1. **SC-001** (< 15% da janela em tarefa longa), **SC-002** (pior quadro < 300 ms) e **SC-003** (fps ≥ 45) atingidos em
   Filmes **e** Séries (**SC-004**), em **duas** rodadas (**SC-005**).
2. **SC-007** e **SC-008** reportados, sem regressão.
3. As nove travas íntegras e `npm run test` verde.
4. Ou, pelo FR-010/FR-011: o alvo declarado **não cumprido** com a causa nomeada — conclusão honesta, não derrota.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: fechar os gates.

### Implementation

- [ ] T050 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` verdes.
- [ ] T051 `npm run test:e2e` completo (com `npm run dev` **no ar**). Falha → reexecutar em série (`--jobs 1`) antes de
      chamar de flake, e registrar a taxa. Flakes conhecidos: `orcamento-armazenamento-migracao` (1 em 4) e
      `progressRecorder.falhas.test.ts` no unitário (1 em 2, herdado).
- [ ] T052 Se alguma regra permanente mudou, atualizar a **regra da feature 088** no `CLAUDE.md` com o que a 089
      descobriu — **só** o que toda sessão futura precisa, e curto.
- [ ] T053 `quickstart.md` §3 executado no navegador.
- [ ] T054 Conferir que a sonda e a instrumentação seguem funcionando ao final, com `falhas = 0` na última rodada →
      **SC-006**.

### Checklist de Release

- [ ] Fase 1 (setup e as nove travas conferidas)
- [ ] Fase 2 (sonda consertada e instrumento pronto, com os 5 contratos verdes)
- [ ] Fase 3 (o dono nomeado na TV, com a decisão do T025 explícita)
- [ ] Fase 4 (redução medida em duas rodadas, ou o alvo declarado não cumprido)
- [ ] Todos os 5 contratos verdes e `check-contract-tests.ps1` íntegro nas nove travas
- [ ] `npm run test` / `tsc` / `lint` / `build` / `test:e2e` verdes
- [ ] SC-001 a SC-006 medidos na TV, em **duas** rodadas, com `falhas = 0`
- [ ] No máximo **quatro** instalações de medição usadas (SC-012)
- [ ] Pacote normal reinstalado na TV
- [ ] `quickstart.md` executado

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1** não depende de nada.
- **Fase 2** depende da 1, e é **bloqueante**: sem a sonda consertada, metade de cada rodada da Fase 3 é desperdiçada,
  e o orçamento é de quatro rodadas.
- **Fase 3** depende da 2 e **decide** a Fase 4: sem o alvo nomeado, o FR-001 proíbe otimizar.
- **Fase 4** depende do alvo da Fase 3.
- **Fase 5** depois de todas.

### Parallel Opportunities

- T011 e T010 são independentes (`keyDelay.ts` e `autopilot.ts`): podem ir em paralelo.
- T016 e T017 podem ir em paralelo depois do T012/T013.
- Na Fase 4, T040 e T041 são independentes entre si.
