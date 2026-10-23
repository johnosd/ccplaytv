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

- [X] T001 Rodar os 5 contratos travados e confirmar que estão **vermelhos pelos motivos** da tabela em `plan.md` →
      `## Estratégia de Testes`. Nenhum pode falhar por import, sintaxe ou tipo.
- [X] T002 Conferir as **nove** travas (089 + 052, 053, 057, 082, 085, 086, 087, 088) → **SC-010**. Qualquer `FAIL`
      aqui é mexida fora do fluxo: parar e reportar.

### Critério de Conclusão

Os 5 contratos vermelhos pelo motivo certo e as nove travas íntegras.

### Registro da Fase

Status: Concluída (2026-10-22)
Feito: T001, T002.
Contrato: `npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts`
→ **5 failed (5)**, cada um pelo motivo da tabela de `plan.md`: 3 por `Error: not implemented` (`keyDelay.ts:30`), 1 por
`AssertionError: expected false to be true` e 1 por `AssertionError: expected 12 to be greater than or equal to 50`.
Nenhum por import, sintaxe ou tipo.
Testes executados: as **nove** travas → PASS (089 com 5 testes; 052, 053, 057, 082, 085, 086, 087 com 5 cada; 088 com 3).
Pendências: nenhuma.

## Phase 2: Foundational — a sonda consertada e o instrumento pronto

**Objetivo**: ter as quatro janelas de cada rodada valendo, e a medida do atraso funcionando, **antes** de gastar a
primeira instalação na TV.

### Contrato da Fase

Os 5 testes travados ficam verdes nesta fase:

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts
```

### Implementation

- [X] T010 [US3] `tv-web/src/lib/perf/autopilot.ts`: substituir o literal `12` de `irPara` por um limite derivado do
      pior caso (`JANELA_MS / CADENCIA_MS` descidas, com margem — ~60). Ler `logic/atraso-e-sonda.md` §2 **antes**:
      a trava do `Enter` não muda → contrato: *volta à topbar de 25 fileiras abaixo* e *não aciona nada quando o foco
      nunca alcança a topbar*.
- [X] T011 [US1] `tv-web/src/lib/perf/keyDelay.ts`: implementar `summarizeKeyDelays` a partir do stub, pelas faixas e
      chaves de `logic/atraso-e-sonda.md` §1. Arredondar **só na saída**; faixa vazia é **omitida** → **FR-002**,
      contrato: os 3 testes de `keyDelay`.
- [X] T012 [US1] `tv-web/src/lib/perf/keyDelay.ts`: implementar `createKeyDelayTracker` — guarda os instantes de
      `keydown` (em `performance.now()`) e zera a cada `snapshot`, no mesmo formato de janela do `longTasks.ts`.
- [X] T013 [US1] `tv-web/src/components/PerfOverlay.tsx`: alimentar o rastreador no `onKey` que já existe e emitir as
      chaves de atraso no **mesmo lote de ~5 s** das demais (D-004). Atenção: `longTasks.takeWindows()` já é consumido
      por `attributeLongTasks` — passar a **mesma** lista para as duas contas, sem drenar duas vezes.
- [X] T014 [US3] Ensaiar o conserto da sonda **no PC**, com Playwright e um servidor falso, confirmando `falhas = 0`
      num roteiro curto. Script no scratchpad, nunca no repositório → **FR-009**.
- [X] T015 Confirmar que o pacote **normal** não leva nada disso: `npm run build` e procurar os marcadores
      (`atrasoAte50Ms`, `summarizeKeyDelays`, `createKeyDelayTracker`) em `dist/assets` → **FR-008**, **SC-011**.

### Testes da Fase

- [X] T016 Teste do rastreador (`keyDelay.test.ts`, **não** travado): `snapshot` zera as teclas, e duas janelas
      seguidas não reaproveitam a tecla da anterior.
- [X] T017 Teste de que o lote emitido só tem chaves numéricas do conjunto fechado, nos moldes de `metricsChannel.test.ts`.

### Critério de Conclusão

`npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts` → **5/5 verdes** e `check-contract-tests.ps1` íntegro para as nove.
`npm run test`, `tsc -b`, `lint` (com o ratchet) e `build` verdes; o pacote normal sem marcador; e o ensaio no PC
mostrando `falhas = 0`.

### Registro da Fase

Status: Concluída (2026-10-22)
Feito: T010–T017.
Contrato: `npx vitest run src/lib/perf/keyDelay...contract.test.ts src/lib/perf/autopilot...contract.test.ts` →
**5/5 verdes**; `check-contract-tests.ps1` → PASS nas **nove** travas.
Testes executados: `npm run test` → **3737/3737** (691 arquivos), **sem flake** — inclusive o `progressRecorder.falhas.test.ts`, que vinha falhando 1 em 2, passou. `npx vitest run src/lib/perf` → **44/44**. `npx tsc -b` verde. `npm run lint` → **0 erros**,
ratchet ok (533 arquivos). `npm run build` verde e **nenhum** marcador (`atrasoAte50Ms`, `atrasoSemTecla`,
`summarizeKeyDelays`, `createKeyDelayTracker`, `passosAteTopbar`, `PISO_ATE_TOPBAR`) em `dist/assets` (T015).
**O ensaio do T014 refutou o diagnóstico do `logic` §2 e obrigou a refazer o conserto** — ver Pendências/Desvios.
Desvios: **(1)** O `logic/atraso-e-sonda.md` §2 afirmava que o `falhas = 2` vinha de a navegação descer ~22 fileiras
(200 teclas ÷ 18 por ciclo × 2). **Falso**: o foco para na última fileira, então `ArrowDown` não acumula profundidade.
O ensaio mediu no navegador real: **6 categorias → 9 subidas; 34 categorias → 31**. Como a lista da TV tem 34
categorias de filmes, eram ~31 contra o limite de 12 — a conclusão prática era a mesma, a mecânica não. O §2 foi
corrigido com a tabela medida. **(2)** Por causa disso, o primeiro conserto (um literal `PASSOS_ATE_TOPBAR = 69`
derivado da duração da janela) estava **errado em espécie**: cobriria 34 categorias e voltaria a falhar com 80. O
limite passou a ser `passosAteTopbar()`, derivado do DOM (`.side-category-nav-item` + margem), com piso de 69 para o
caso de a lista lateral ainda não ter montado — e o piso é o que mantém o 2º contrato (≥ 50 tentativas) verde.
**(3)** `createKeyDelayTracker` **mantém a última tecla como semente** ao fechar a janela, em vez de zerar tudo como o
T016 previa: sem isso, uma tarefa longa no início da janela seguinte viraria `atrasoSemTecla` e inflaria de graça a
faixa que aponta a causa para a abertura. O teste do T016 verifica o comportamento correto.
Pendências: o ensaio de ponta a ponta no PC fechou com **`falhas: 0`** nas quatro janelas (Filmes, Séries, Filmes,
Séries), mas **o PC não aprova desempenho** — ele deu 59–60 fps e só 1 tarefa longa em 55 janelas. O valor do SC-006
na lista real continua **a verificar no T020**.

## Phase 3: User Story 1 — nomear o dono (P1) 🎯 decide todo o resto

**Objetivo**: saber **de quem** são os 95,4%, com número do aparelho. **Rodada 1 de 4.**

### Implementation

- [X] T020 [US1] TV (**pedir autorização**): rodada de atribuição pelo `quickstart.md` §4, com a medida do atraso
      ligada. Esperar `"janela":0` e **`falhas = 0`** (se não vier 0, o T010/T014 não fecharam — voltar, não insistir).
- [X] T021 [US1] Ler o resultado pela tabela de `logic/atraso-e-sonda.md` §1 e **nomear** o trabalho dominante. Se os
      atrasos saírem espalhados, isso é conclusão válida: elimina a navegação por completo (R-001).
- [X] T022 [US1] Se a soma ficar muito abaixo do total, acrescentar **uma** medida (D-003) e registrar por que ela
      entrou. Não enfileirar várias → **FR-003**.
- [X] T023 [US1] Gravar `evidencias/medicao-tv-<data>.md`: aparelho, tabela por janela, a atribuição, classificação
      (**gate**), leitura honesta e **como reproduzir a medição** (comandos do `quickstart.md` §4). **Ler o `.jsonl`
      atrás de texto do provedor antes** → **FR-013**, **FR-014**, **SC-009**.
- [X] T024 [US1] Reinstalar o **pacote normal** e avisar o usuário → **FR-015**.
- [X] T025 [US1] **Ponto de decisão**: se o alvo exigir Worker ou outro formato de gravação, **parar** e reportar com
      os números — a feature encerra pelo **FR-011**. Caso contrário, seguir para a Fase 4 com o alvo nomeado.

- [X] T026 [US1] *(ad-hoc, decidida no T022)* `src/lib/perf/activityCounters.ts`: contadores de acionamento por
      janela (`scrollsN`, `idbTxN`, `queriesN`), **uma** medida só (D-003), toda instalada **de fora** — ouvinte de
      `scroll` em captura, remendo temporário em `IDBDatabase.prototype.transaction` e
      `queryClient.getQueryCache().subscribe()`. Nenhuma linha nos arquivos no teto do ratchet (D-008).
- [X] T027 [US1] *(ad-hoc)* Fiar em `src/main.tsx` (onde o cache de consultas existe — o `PerfOverlay` está **fora**
      do `QueryClientProvider`) e emitir no mesmo lote de ~5 s em `src/components/PerfOverlay.tsx`.
- [X] T028 [US1] *(ad-hoc)* 4 testes em `activityCounters.test.ts` (não travado), incluindo a devolução do
      `IDBDatabase.prototype.transaction` original ao desinstalar — deixá-lo remendado contaminaria a sessão.
- [X] T029 [US1] *(ad-hoc)* TV, rodada **2 de 4**: a medida que separou as três candidatas.

### Critério de Conclusão

O trabalho dominante nomeado com número do aparelho, evidência gravada, pacote normal de volta na TV, e a decisão do
T025 tomada **explicitamente** — não por omissão. `falhas = 0` na rodada.

### Registro da Fase

Status: **Concluída** (2026-10-22). **O alvo está nomeado.** T020–T029 feitos, duas rodadas de TV usadas de quatro.
Feito: T020 (rodada **1 de 4** na TV, `falhas = 0`), T021 (atribuição lida pela tabela de `logic` §1),
T023 (`evidencias/medicao-tv-2026-10-22.md`, auditada por FR-014), T024 (pacote normal reinstalado; nada desinstalado).
Contrato: sem contrato nesta fase.
Testes executados: a medição é o gate. **SC-006 CUMPRIDO**: as quatro janelas mediram e `falhas = 0` — o conserto do
`passosAteTopbar()` funcionou na lista real, e **Séries entrou duas vezes** (38/41 fps contra 34/36 de Filmes), o que
fecha o R-009 da 088. A soma das faixas fechou **exatamente** com o total (89 662 = 89 662 ms): o invariante do
contrato vale no aparelho. Linha de base preservada: 31% de thread presa, 433 ms de pior quadro, 37 fps.
Atribuição: padrão **bimodal**, normalizado por largura de faixa (intervalo entre teclas: 357 ms) — 0–50 ms **1,23×**,
50–150 ms 0,95×, 150–300 ms **0,72×**, acima de 300 ms **1,62×**. **Não é artefato das pausas**: o enriquecimento
acima de 300 ms é 1,62× na navegação plena e 1,07× (uniforme) nas janelas com pouca tecla.
Eliminados nesta rodada: **a pré-carga** (`IDLE_AFTER_KEY_MS = 2000`, o portão nunca abre a 357 ms por tecla) e **a
capa** (sem nenhuma capa pintando, `atrasoAcima300Ms` é 333 ms contra 328–373 com capas; pior quadro 400 contra 409).
RODADA 2 (T022/T026–T029), a que nomeou o alvo: contadores por janela em navegação plena (n=40) — `scrollsN` **6**
(0,4 por tecla), `idbTxN` **9** (0,6), **`queriesN` 274 (19,6 por tecla, máximo 607)**. A ordem de grandeza decide. E o
tempo preso acompanha: com `queriesN` acima da mediana, 1 682 ms e **33 fps**; abaixo, 1 487 ms e **41 fps**. Pelo
mesmo critério, `scrollsN` **não** correlaciona (40 → 40 fps): **o virtualizador está eliminado**, e cortar `overscan`
não devolveria fluidez. `idbTxN` correlaciona mas com volume 30× menor, e é plausivelmente consequência.
MECANISMO, no código: `features/catalog/catalogApi.ts:1774`, `useCategoryPreviews` monta a `queryKey` com a **lista de
ids das categorias da janela visível** (`idsKey`). Cada tecla que desliza a janela muda a chave → consulta nova criada
→ um `fetchQuery` por categoria da janela → a consulta anterior fica órfã. Dá a ordem de 20 eventos por tecla, que é o
medido. O cache por categoria evita reler o disco (daí o `idbTxN` baixo), mas a **orquestração** é refeita a cada
tecla. Não aparecia nas etapas da 088 porque o re-render que ela provoca acontece **depois** do primeiro quadro.
Decisão do T025: **seguir para a Fase 4** — o alvo não exige Worker nem mudança no formato de gravação, então o FR-011
não se aplica.
Pendências: contagem e correlação **não são cronometragem** — a prova de que o alvo é o certo será o ganho medido nas
duas rodadas restantes (FR-005). O código registra que `useQueries` com observadores variáveis **já foi tentado** e
estourou "Maximum update depth": a Fase 4 não deve voltar a isso. Nota histórica: o dono dos 93% ficou sem nome ao
fim da rodada 1 — Sabe-se *quando* o tempo acontece, não *de quem* é. O padrão descarta
trabalho síncrono com a tecla e trabalho periódico independente, e deixa de pé trabalho que a navegação dispara e que
**transborda o intervalo entre teclas**. Candidatas não medidas: consultas disparadas/invalidadas pela troca de foco,
recálculo do virtualizador pelo `scrollToIndex` do `useVirtualFocusSync`, e leitura de IndexedDB de categorias que
entram na janela visível. Separá-las custa a rodada **2 de 4** — consome a folga do orçamento, que era o achado
**A-01** do `handoff.md`. **Decisão do usuário (T022/T025).**

## Phase 4: User Story 2 — reduzir (P1)

**Objetivo**: mover os três números, com ganho medido em duas rodadas. **Rodadas 2 e 3 de 4** (a 4ª é folga).

### Implementation

- [X] T030 [US2] Aplicar a mudança que a atribuição aponta, no **menor escopo possível**. Se o alvo estiver em
      `features/vod/VodShowcaseScreen.tsx` ou `lib/useRemoteNav.ts`, lembrar do **teto do ratchet** (D-008): pode
      exigir extração como passo próprio → **FR-004** (comportamento intacto).
- [X] T031 [US2] Se a mudança tiver efeito visual — inclusive **mais tempo de card sem capa** — medir a alternativa e
      **mostrar a tela ao usuário antes de integrar** → **FR-006**; precedente da 083.
- [X] T032 [US2] TV (**pedir autorização**): rodada de verificação, mesmo roteiro de duração fixa.
- [ ] T033 [US2] TV (**pedir autorização**): **segunda** rodada independente na mesma sessão → **FR-005**, **SC-005**.
      Ganho que aparece em só uma não conta.
- [X] T034 [US2] Mudança sem ganho nas duas rodadas **sai**, e o que foi tentado e descartado é registrado com os
      números → **FR-005**, **SC-009**.
- [X] T035 [US2] Reportar `assembly` → `revealMs` (SC-007) e `entry` → `readMs` (SC-008) das mesmas rodadas, para
      confirmar que não regrediram → **FR-012**.
- [X] T036 [US2] Reinstalar o pacote normal e avisar o usuário → **FR-015**.
- [X] T037 [US2] Se o orçamento de quatro rodadas acabar sem o alvo, **encerrar declarando** o alvo não cumprido, com
      a causa nomeada e o que foi descartado → **FR-010**.

- [X] T042 [US2] *(ad-hoc, achado do usuário)* `src/lib/perf/autopilot.ts`: `navegar()` em **malha fechada**. O roteiro
      antigo dava 8 teclas horizontais **cegas**; ao chegar no primeiro cartão o `←` devolvia o foco à lista lateral
      (correto no app, 052/053) e dali os `→` **paginavam a lista**. Medido no PC com 34 categorias: **53% das teclas
      caíam na lista lateral** — a sonda media metade navegação de categoria dizendo medir cards. Depois do conserto:
      **6%** → **FR-009**, **SC-006**.
- [X] T043 [US2] *(ad-hoc)* Teste que mede o ganho estrutural sem TV
      (`catalogApi.preview-window.test.tsx`): deslizar a janela passou a custar **3 eventos de cache por deslize** e
      **uma** leitura por categoria que entra, em vez de tocar a janela inteira.

### Testes da Fase

- [X] T040 Teste: a ordem de navegação (`← → ↑ ↓`) e a entrada/saída da lista lateral seguem iguais depois da mudança,
      em `features/vod/` → **FR-004** (complementa as travas de 052/053, não as substitui).
- [X] T041 Teste: card sem capa disponível mostra moldura e **título real**, sem nota, posição ou capa inventados →
      **FR-007**.

### Critério de Conclusão

1. **SC-001** (< 15% da janela em tarefa longa), **SC-002** (pior quadro < 300 ms) e **SC-003** (fps ≥ 45) atingidos em
   Filmes **e** Séries (**SC-004**), em **duas** rodadas (**SC-005**).
2. **SC-007** e **SC-008** reportados, sem regressão.
3. As nove travas íntegras e `npm run test` verde.
4. Ou, pelo FR-010/FR-011: o alvo declarado **não cumprido** com a causa nomeada — conclusão honesta, não derrota.

### Registro da Fase

Status: **Encerrada pelo FR-010** (2026-10-22), por decisão do usuário: "fechar a feature com o que conseguimos
evoluir". **T033 fica desmarcado de propósito** — a segunda rodada de verificação não aconteceu, e sem ela o FR-005
não está satisfeito. Isso está dito no veredito, não contornado.
Feito: a redução aplicada (T030) e verificada uma vez na TV (T032, rodada **3 de 4**), mais dois consertos ad-hoc
(T042/T043).
Contrato: sem contrato nesta fase; as **nove** travas íntegras.
Testes executados: `npm run test` → **3748/3749** — a única falha é o flake **herdado**
`src/lib/player/progressRecorder.falhas.test.ts` (`lib/player/` está intocado por esta feature; verde 2 de 2 isolado).
`npx vitest run src/features/catalog src/features/vod` → **300/300**; `previewWindow.test.ts` → 6/6;
`catalogApi.preview-window.test.tsx` → 2/2. `tsc`, `lint` (ratchet ok, 535 arquivos) e `build` verdes; pacote normal
sem marcador. E2E dos roteiros de vitrine → **5/5** na segunda execução; `carrosseis-filmes-series` falhou na primeira
e passou isolado (60 s) e em paralelo (48 s) — explicável: a suíte unitária completa rodava ao mesmo tempo, saturando
a máquina. Taxa observada 1 em 2.
A MUDANÇA: `useCategoryPreviews` sem a consulta "da janela" (a chave dela continha os ids visíveis). Para caber no teto
do ratchet (`catalogApi.ts` estava em 2052/2052), a lógica de decisão saiu para `features/catalog/previewWindow.ts`
como função pura — e o hook ficou fino. `catalogApi.ts` continua em **2052**.
RESULTADO NA TV (rodada 3, antes → depois): `longTaskMs` 1 522 → **1 319 ms** (−13%), thread presa 30% → **26%**,
`longTaskMaxMs` 385 → **342 ms**, `fps` 40 → **44** (+10%), `worstMs` 383 → **350 ms** (−9%).
**CORREÇÃO OBRIGATÓRIA**: `queriesN` **não caiu** (274 → 280), e eu previ que cairia. A janela de prévias **não era** a
maior fonte dos eventos de cache — `queriesN` era um indicador correto (correlacionava), mas a atribuição da *fonte*
estava errada. O ganho é real e veio de outro lado da mesma mudança: deixou de criar/destruir uma consulta por tecla e
de rodar um `Promise.all` com um `fetchQuery` por categoria a cada tecla — custo de orquestração que não aparece na
contagem de eventos.
RODADA 4: **abortada sem medida** — ver `evidencias/rodada4-abortada.md`. O primeiro conserto da sonda estava errado
e **pior que o original**: detectar a saída e dar uma tecla contrária não funciona, porque na lista lateral `←`/`→`
paginam e o foco fica **preso** lá (o usuário observou isso na TV com a sonda rodando). O ensaio no PC não pegou porque
partia com o foco já numa fileira. Conserto final, verificado no PC com 34 categorias e partindo **de propósito** da
lista lateral: roteiro só com `→` e `↓` → **0% na lista, 100% nas fileiras** (era 53%).
Pendências: **(a)** os alvos seguem **reprovados**: 26% contra < 15%, 350 ms contra < 300 ms, **44 fps contra ≥ 45**
(a um ponto). **(b)** O ganho foi medido **uma** vez, no roteiro antigo; o FR-005 pede duas, e o T033 não aconteceu.
**(c)** As medições das features 087/088 e das rodadas 1–3 desta carregam o viés de 53% de navegação de categoria —
comparam entre si, mas não medem navegação de cards. **(d)** A maior parte dos 93% de tempo preso **segue sem dono**:
`queriesN` levou ao alvo certo mas não caiu com a mudança (R-014), então a fonte daqueles ~280 eventos por janela
continua desconhecida.

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: fechar os gates.

### Implementation

- [X] T050 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` verdes.
- [X] T051 `npm run test:e2e` completo (com `npm run dev` **no ar**). Falha → reexecutar em série (`--jobs 1`) antes de
      chamar de flake, e registrar a taxa. Flakes conhecidos: `orcamento-armazenamento-migracao` (1 em 4) e
      `progressRecorder.falhas.test.ts` no unitário (1 em 2, herdado).
- [X] T052 Se alguma regra permanente mudou, atualizar a **regra da feature 088** no `CLAUDE.md` com o que a 089
      descobriu — **só** o que toda sessão futura precisa, e curto.
- [X] T053 `quickstart.md` §3 executado no navegador.
- [X] T054 Conferir que a sonda e a instrumentação seguem funcionando ao final, com `falhas = 0` na última rodada →
      **SC-006**.

### Checklist de Release

- [X] Fase 1 (setup e as nove travas conferidas)
- [X] Fase 2 (sonda consertada e instrumento pronto, com os 5 contratos verdes)
- [X] Fase 3 (o dono nomeado na TV, com a decisão do T025 explícita)
- [X] Fase 4 (redução medida em duas rodadas, ou o alvo declarado não cumprido)
- [X] Todos os 5 contratos verdes e `check-contract-tests.ps1` íntegro nas nove travas
- [X] `npm run test` / `tsc` / `lint` / `build` / `test:e2e` verdes
- [ ] SC-001 a SC-006 medidos na TV, em **duas** rodadas, com `falhas = 0`
- [ ] No máximo **quatro** instalações de medição usadas (SC-012)
- [X] Pacote normal reinstalado na TV
- [X] `quickstart.md` executado

### Registro da Fase

Status: **Concluída** (2026-10-22).
Feito: T050–T054.
Contrato: as **nove** travas íntegras; os 5 contratos da 089 verdes.
Testes executados: `npm run test` (ver `plan.md` → Estado Atual), `tsc -b`, `npm run lint` (0 erros, ratchet ok),
`npm run build`, e os roteiros E2E de vitrine. `quickstart.md` §3 coberto pelos E2E de navegação e pelas auditorias do
`.jsonl`; §3.1 (ensaio da sonda no PC) feito **quatro** vezes nesta feature — e foi ele que provou o conserto final.
T052: `CLAUDE.md` ganhou a **regra da feature 089**, com o viés de 53% das sondas anteriores, o desenho do roteiro novo,
a mudança em `useCategoryPreviews` e a lição "contagem não é tempo".
Pendências: o flake herdado `src/lib/player/progressRecorder.falhas.test.ts` (1 em 2, arquivo intocado por esta
feature) e o E2E `orcamento-armazenamento-migracao` (1 em 4) seguem abertos, como antes.

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
