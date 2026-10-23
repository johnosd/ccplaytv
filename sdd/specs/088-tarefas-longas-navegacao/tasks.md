# Tasks: tarefas longas no caminho de navegação das vitrines

**Feature**: 088-tarefas-longas-navegacao
**Spec**: `spec.md` · **Plano**: `plan.md` · **Método**: `logic/atribuicao.md`

## Format: `[ID] [P?] [Story] Description`

- `[P]` = pode rodar em paralelo com outras `[P]` da mesma fase.
- `[Story]` = a user story que a task serve (US1, US2, US3).

## Path Conventions

```
tv-web/src/lib/perf/           phaseSpans.ts (stub pronto), longTasks.ts, activeFrames.ts, metricsChannel.ts (NÃO MUDA), autopilot.ts
tv-web/src/lib/                useRemoteNav.ts (abre/fecha a etapa `tecla`)
tv-web/src/components/         PerfOverlay.tsx (emite), Rail.tsx
tv-web/src/features/vod/       VodShowcaseScreen.tsx, vodShowcase.ts
sdd/specs/088-tarefas-longas-navegacao/evidencias/
```

## Phase 1: Setup

**Objetivo**: confirmar o ponto de partida antes de escrever qualquer linha.

### Implementation

- [X] T001 Rodar os 3 contratos e confirmar que estão **vermelhos por `not implemented`**, com o comando de `plan.md`
      → `## Estratégia de Testes`.
- [X] T002 Conferir **as seis travas** íntegras (088 e as cinco que são o guarda-corpo: 052, 053, 057, 086, 087). As de
      052 e 053 são as que esta feature pode quebrar sem perceber.

### Critério de Conclusão

Os 3 contratos vermelhos pelo motivo certo e as seis travas íntegras.

### Registro da Fase

Status: Concluída (2026-10-22)
Feito: T001, T002.
Contrato: `npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts` → **3 failed (3)**, todos por `Error: not implemented` (`phaseSpans.ts:32` e `:36`). Nenhum por import, sintaxe ou tipo.
Testes executados: as **seis** travas → PASS para 088 (3 testes), 052, 053, 057, 086 e 087 (5 cada).
Pendências: nenhuma.

## Phase 2: Foundational — a instrumentação que atribui

**Objetivo**: medir as três etapas sem mudar comportamento nenhum.

### Contrato da Fase

Estes **já existem e estão travados** — não são task de escrita:

- `agrega por etapa em chaves planas do conjunto fechado, arredondadas, e devolve `null` sem amostra`
- `fechar o mesmo intervalo duas vezes conta uma só`
- ``snapshot` zera a janela: a chamada seguinte não repete o que já foi reportado`

```bash
npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts
```

### Implementation

- [X] T010 Implementar `summarizeSpans` e `createPhaseSpanTracker` em `lib/perf/phaseSpans.ts`, a partir do stub →
      contratos da fase; `logic/atribuicao.md` §2. Agregação **por janela**, conjunto fechado de etapas, só números.
- [X] T011 Abrir/fechar a etapa `tecla` no manipulador de `lib/useRemoteNav.ts`, atrás de `VITE_CCPLAY_PERF` →
      **FR-007**. Fechar em `finally`, porque o manipulador tem caminhos de saída antecipada.
- [X] T012 Abrir/fechar a etapa `render` em volta do commit que o foco provoca, e a etapa `capa` quando o card pede e
      obtém a imagem → `logic/atribuicao.md` §2.
- [X] T013 Emitir as chaves agregadas em `components/PerfOverlay.tsx`, no **mesmo lote de ~5 s** dos quadros e das
      tarefas longas (o padrão que o `longTasks.ts` estabeleceu) → **FR-012**.
- [X] T014 Conferir que o **pacote normal não leva** a instrumentação: `npm run build` sem as variáveis, e nenhum
      marcador de `phaseSpans` em `dist/assets` → **FR-007**, **SC-010**.

### Testes da Fase

- [X] T015 Teste: com `VITE_CCPLAY_PERF` desligado, o caminho de tecla não cria intervalo nenhum (a medição não entra
      no caminho quente do build normal) → R-002.

### Critério de Conclusão

1. Os 3 contratos verdes e `check-contract-tests.ps1 -Slug 088-tarefas-longas-navegacao` íntegro.
2. As cinco travas de outras features **ainda** íntegras — nada de comportamento mudou nesta fase.
3. `npm run test` verde; `npm run build` sem marcador de instrumentação.

### Registro da Fase

Status: Concluída (2026-10-22)
Feito: T010–T015. **A fiação ficou diferente da descrita nas tasks, e melhor** (R-007): `useRemoteNav.ts` e `VodShowcaseScreen.tsx` estavam **exatamente no teto** do ratchet (319 e 733 linhas), e qualquer linha os estourava. A medição passou a viver inteira em `lib/perf/phaseSpans.ts` + `components/PerfOverlay.tsx`: `installKeySpan()` abre `tecla` na **captura** do `keydown` em `document` e fecha numa microtarefa (que drena depois de **todos** os ouvintes síncronos daquele evento, inclusive o `useRemoteNav`), e `render` fecha no **primeiro quadro pintado** pelo laço de `requestAnimationFrame` que o `PerfOverlay` já tinha — ou seja, “da tecla até ver o foco novo”, que é o número que a pessoa sente. **Os dois arquivos do caminho quente ficaram intocados.** A etapa `capa` entrou no `PosterArt.tsx` (único lugar que desenha `<img>`, feature 015), e a limpeza do efeito **não** fecha o intervalo — card desmontado antes de a imagem chegar não é amostra.
Contrato: `npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts` → **3/3 verdes**; `check-contract-tests.ps1` → PASS para as **seis** travas (088, 052, 053, 057, 086, 087).
Testes executados: `npx vitest run src/lib/perf` → 28/28. `npx tsc -b` → verde. `npm run lint` → **0 erros**. `node scripts/architecture.mjs` → ok (531 arquivos) — depois de o desenho mudar; antes acusava 2 violações de `max-lines`. `npm run build` → verde, e **nenhum** marcador (`phaseSpans`, `teclaMax`, `installKeySpan`) no pacote normal (T014). `npm run test` → **3721/3721** na segunda execução.
Pendências: **flake observado**: `VodShowcaseScreen.test.tsx > categorias carregando, com erro e sem nenhuma categoria` falhou na **1ª** execução completa e passou na 2ª, e passa isolado (9/9) — taxa **1 em 2**. Não atribuíção concluída: o único arquivo desta fase que aquele teste exercita é o `PosterArt.tsx` (um `useEffect` novo que, com a flag desligada, não faz nada). Fica como problema **aberto**, não como baseline ok.

## Phase 3: User Story 1 — a atribuição na TV (P1, parte 1) 🎯 o que decide o resto

**Objetivo**: saber **qual** etapa custa, com número do aparelho — antes de otimizar qualquer coisa (FR-001).

### Implementation

- [X] T020 [US1] TV (**pedir autorização**): rodada da sonda automática pelo `quickstart.md` §4, com a instrumentação
      ligada. Esperar `"janela":0` e **`falhas = 0`**.
- [X] T021 [US1] Ler o resultado pela **ordem de leitura** de `logic/atribuicao.md` §3 e nomear a etapa dominante.
      Se a soma das três ficar muito abaixo de `longTaskMs`, acrescentar **uma** etapa e registrar por que.
- [X] T022 [US1] Gravar `evidencias/medicao-tv-<data>.md`: aparelho, tabela por janela, atribuição, classificação
      (**gate**) e leitura honesta. Ler o `.jsonl` atrás de texto do provedor antes → **FR-011**, **SC-008**.
- [X] T023 [US1] Reinstalar o **pacote normal** e avisar o usuário.
- [X] T024 [US1] **Ponto de decisão (FR-008)**: se o custo dominante for `capa` ou ficar fora dos três intervalos e
      exigir Worker/outro formato, **parar aqui** e reportar ao usuário com os números — a feature encerra declarando o
      alvo não cumprido, e a US3 ainda entregou. Caso contrário, seguir para a Fase 4.

- [X] T025 [US1] *(ad-hoc, decidida no T024)* `src/lib/perf/longTaskAttribution.ts`: parte `longTaskMs` entre as
      etapas abertas e **o que fica fora de todas** (`ltTeclaMs`/`ltRenderMs`/`ltForaMs`/`ltForaN`/`ltForaMax`), com
      precedência `tecla` > `render`. A soma fecha com o total **por construção** → `logic/atribuicao.md` §2.1.
- [X] T026 [US1] *(ad-hoc)* `longTasks.ts` guarda **início e duração** (`takeWindows()`) e `phaseSpans.ts` guarda os
      **intervalos** de trabalho (`takeIntervals()`); `PerfOverlay.tsx` cruza os dois no mesmo lote de ~5 s.
- [X] T027 [US1] *(ad-hoc, R-008)* Corrigir a etapa `capa`: medir do `onLoad` até o **quadro seguinte** (pintura, que é
      tempo de thread), não do pedido da imagem até ela chegar (espera de parede, 266 s numa janela de 5 s).
- [X] T028 [US1] *(ad-hoc)* 6 testes de `longTaskAttribution` em arquivo **não travado**, incluindo o invariante da
      soma e a precedência — a peça decide a Fase 4, então é provada sem TV.
- [X] T029 [US1] *(ad-hoc)* Corrigir `logic/atribuicao.md` §1: a tabela "não remedir" afirmava que **não** há
      desistência do React Compiler em `features/vod/`, e **há** (`VodShowcaseScreen.tsx:483`, o `useVirtualizer`).
      Registrado em §1.1 como candidato **a confirmar pela medição**, nunca como causa.
- [X] T0291 [US1] TV (**pedir autorização**): segunda rodada com a atribuição ligada, para dar dono aos 76%.

### Critério de Conclusão

A etapa dominante nomeada com número do aparelho, evidência gravada, pacote normal de volta na TV, e a decisão do T024
tomada **explicitamente** — não por omissão.

### Registro da Fase

Status: **Concluída** (2026-10-22). A atribuição ficou feita, e ela **inocenta o caminho de navegação**: as três
etapas somadas valem **menos de 5%** do tempo em que a thread fica presa. **Nova decisão do usuário pendente** — ver
o relato e o `PRÓXIMO:` de `plan.md`.
Feito: T020 (rodada na TV, **parcial**: `falhas = 2`, só as duas janelas de Filmes valem), T021 (atribuição lida pela ordem de `logic/atribuicao.md` §3), T022 (`evidencias/medicao-tv-2026-10-22.md`, auditada por FR-011), T023 (pacote normal reinstalado, sem nenhum marcador; nada foi desinstalado, dados preservados).
Contrato: sem contrato nesta fase (as travas seguem íntegras — nada de código mudou aqui).
Testes executados: nenhum teste de código. A medição é o gate: 29 janelas de ~5 s. `teclaMs` = **1%** do `longTaskMs` (0,6 ms por tecla) → etapa **eliminada**; `renderMs` = **23%** (27,8 ms por tecla, pior 125 ms) → maior item nomeado, **não dominante**; **76% fora** dos intervalos → caímos no **passo 4** de §3. A leitura de fundo do prefetch foi **refutada** como causa (janelas com leitura dão fps melhor: 41 contra 36).
Decisão do T024 (do usuário, 2026-10-22): **medir os 76%**, pelo passo 4 de `logic/atribuicao.md` §3 — nem otimizar
o render com 23% conhecidos (teto teórico: thread presa de 33% para ~25%, que **não** alcança o SC-001), nem encerrar
pelo FR-008. T025–T029 implementam a medida; o T0291 é a rodada na TV.
Achado de método (T029): o lint reporta `react(incompatible-library)` em `VodShowcaseScreen.tsx:483` (o
`useVirtualizer`) — ou seja **o React Compiler desiste de memoizar a vitrine**, e a tabela "não remedir" de §1 dizia o
contrário. A tela não é memoizada nem à mão nem pelo compilador. Fica como candidato aos 76%, **a confirmar medindo**.
Rodada 2 (T0291): `ltTeclaMs` **0,1%** · `ltRenderMs` **4,5%** · **`ltForaMs` 95,4%** (43 764 de 45 853 ms), e a
pior tarefa longa da sessão (**777 ms**) está **inteiramente fora** das três etapas. As duas rodadas da sonda são
idênticas dentro do ruído (37/40 fps nas duas), então a medição é confiável. **Correção da leitura da rodada 1**: eu
havia dito "render = 23%" dividindo `renderMs` (parede) por `longTaskMs` (thread) — o mesmo erro de categoria que
diagnostiquei no `capa`. São **4,5%**. Nenhuma fonte do canal explica os 95,4%: `entry`, `section-load`, `showcase` e
`assembly` dão medianas **planas** (e as três piores janelas tinham **nada** de fundo). `capa` corrigida: **10 ms** por
capa.
Pendências: **(a)** ~~a etapa `capa` mede espera de parede~~ **corrigida no T027**; o erro de desenho meu, registrado no §4 da evidência; **(b)** **Séries não foi medida** (as duas janelas falharam); **(c)** onde estão os 76% continua **não medido**, e nomear um candidato agora violaria o FR-001.

## Phase 4: User Story 1 — reduzir (P1, parte 2)

**Objetivo**: mover os três números, com ganho medido em duas rodadas.

### Implementation

- [ ] T030 [US1] Aplicar a mudança que a atribuição aponta, no menor escopo possível (`features/vod/VodShowcaseScreen.tsx`,
      `lib/useRemoteNav.ts` ou `components/Rail.tsx`, conforme a etapa dominante) → **FR-002** (comportamento intacto).
- [ ] T031 [US1] Se a mudança tiver efeito visual, **medir a alternativa e mostrar a tela ao usuário antes de
      integrar** → **FR-005**; precedente da feature 083 (foco com sombra estática, 35 → 51 fps).
- [ ] T032 [US1] TV (**pedir autorização**): rodada de verificação, mesmo roteiro de duração fixa.
- [ ] T033 [US1] TV (**pedir autorização**): **segunda** rodada independente na mesma sessão → **FR-004**, **SC-005**.
      Ganho que aparece em só uma não conta.
- [ ] T034 [US1] Mudança sem ganho medido nas duas rodadas **sai** → **FR-003**. Registrar o que foi tentado e
      descartado, com os números.
- [ ] T035 [US1] Reinstalar o pacote normal e avisar o usuário.

### Testes da Fase

- [ ] T036 Teste: a ordem de navegação (`← → ↑ ↓`) e a entrada/saída da lista lateral seguem iguais depois da mudança,
      em `features/vod/` → **FR-002** (complementa as travas de 052/053, não as substitui).
- [ ] T037 Teste: card sem capa disponível mostra moldura e **título real**, sem nota, posição ou capa inventados →
      **FR-006**.

### Critério de Conclusão

1. **SC-001** (< 15% da janela em tarefa longa), **SC-002** (pior quadro < 300 ms) e **SC-003** (fps ≥ 45) atingidos em
   Filmes **e** Séries (**SC-004**), em **duas** rodadas (**SC-005**).
2. **SC-006**: abertura continua entre 313 e 386 ms.
3. As seis travas íntegras e `npm run test` verde.
4. Ou, pelo FR-008: o alvo declarado **não cumprido** com a causa nomeada — e isso vale como conclusão honesta.

### Registro da Fase

Status: **Encerrada sem execução pelo FR-008** (2026-10-22), pelo critério 4 acima. **T030–T037 ficam desmarcados de
propósito**: não são pendência esquecida, são trabalho **cancelado com motivo medido**.
Feito: nada — e isso é o resultado correto.
Contrato: sem contrato nesta fase.
Testes executados: nenhum teste desta fase foi escrito (T036/T037 cobriam uma mudança que não existe). O que decidiu a
fase foram as medições das Fases 3: `tecla` **0,1%**, `render` **4,5%**, `capa` **10 ms** por capa — as três etapas que
o T030 iria atacar somam **menos de 5%** do tempo em que a thread fica presa. Aplicar as três otimizações
perfeitamente deixaria a thread presa em ~27% contra o alvo de **< 15%** do SC-001: o teto do que esta fase podia
entregar é menor que a distância até o alvo.
Pendências: o problema **existe e é grande** — 28% da thread presa, pior quadro até 817 ms, e um teto real de ~55 fps
observado em janelas limpas. Ele está **fora do escopo desta spec** (95,4% do tempo preso cai fora das etapas do
caminho de navegação) e segue para uma spec nova. Nada do que esta fase planejava deve ser tentado lá sem medir de
novo: já está provado que não devolve fluidez.

## Phase 5: User Story 2 e 3 — entrada em categoria e o registro (P2, P3)

**Objetivo**: reportar o critério acompanhado e deixar a medição reutilizável.

### Implementation

- [X] T040 [US2] Reportar a mediana de `entry` → `readMs` antes e depois, das mesmas rodadas → **FR-009**, **SC-007**.
      Linha de base: mediana 627 ms (contra ~229 ms da referência da 086). Sem alvo numérico — é acompanhado.
- [X] T041 [US3] Registrar na evidência **qual código** estava nas tarefas longas e **como reproduzir** a medição
      (comandos do `quickstart.md` §4) → **SC-008**.
- [ ] T042 [US3] Conferir que a sonda automática e a instrumentação continuam funcionando ao final (`falhas = 0` na
      última rodada).

### Critério de Conclusão

A mediana de entrada reportada antes e depois; a evidência nomeia o código e diz como reproduzir; a sonda segue
funcionando.

### Registro da Fase

Status: **Concluída com uma ressalva** (2026-10-22). T042 fica **desmarcado** — ver Pendências.
Feito: T040, T041.
Contrato: sem contrato nesta fase.
Testes executados: **T040 (FR-009/SC-007)** — `entry` → `readMs` nas três rodadas: mediana **310 ms** (rodada 1),
**384 ms** (rodada 2), **239 ms** (controle), faixa 95–585 ms, contra a linha de base de **627 ms**. Honestamente: a
melhora **não é atribuível a esta feature**, porque nenhuma otimização foi aplicada (FR-001/FR-003) — é variação de
sessão e do estado da pré-carga. O critério é *acompanhado*, sem alvo, e está reportado. **T041 (SC-008)** — três
evidências em `evidencias/`, cada uma com aparelho, tabela por janela, classificação e como reproduzir (comandos do
`quickstart.md` §4).
Pendências: **T042 não cumprido**: a sonda e a instrumentação continuam funcionando (foi ela que produziu as três
rodadas), mas o critério pedia **`falhas = 0`** na última rodada, e as três fecharam com **`falhas = 2`** — a sonda
abandona a janela quando a navegação em malha fechada não chega ao destino, o que é o comportamento correto (não
inventa medida), mas significa 2 de 4 janelas por rodada. A **tela** Séries acabou coberta na rodada de controle
(janela 2, 40 fps), então a lacuna é de *cobertura da sonda*, não de conhecimento (R-009).

## Phase 6: Polish & Cross-Cutting Concerns

**Objetivo**: fechar os gates.

### Implementation

- [X] T050 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` verdes.
- [X] T051 `npm run test:e2e` completo (com `npm run dev` **no ar**). Falha → reexecutar em série (`--jobs 1`) antes de
      chamar de flake, e registrar a taxa observada. Flake conhecido: `orcamento-armazenamento-migracao` (1 em 4).
- [X] T052 Se alguma regra permanente mudou, atualizar o `CLAUDE.md` — **só** se for fato que toda sessão futura
      precisa, e curto.
- [X] T053 `quickstart.md` §3 executado no navegador.

### Checklist de Release

- [X] Fase 1 (setup e as seis travas conferidas)
- [X] Fase 2 (instrumentação, com os 3 contratos verdes)
- [X] Fase 3 (atribuição na TV, com a decisão do T024 explícita)
- [X] Fase 4 (redução, ou o alvo declarado não cumprido pelo FR-008) — **encerrada pelo FR-008**, sem redução
- [X] Fase 5 (critério acompanhado e registro) — com a ressalva do T042
- [X] Todos os 3 contratos verdes e `check-contract-tests.ps1` íntegro (088, 052, 053, 057, 086, 087)
- [X] `npm run test` / `tsc` / `lint` / `build` / `test:e2e` verdes
- [X] SC-001 a SC-006 medidos na TV, em **duas** rodadas (mais uma de controle) — SC-001/002/003/004 **não cumpridos**
- [X] Pacote normal reinstalado na TV
- [X] `quickstart.md` executado

### Registro da Fase

Status: **Concluída** (2026-10-22).
Feito: T050, T051, T052, T053.
Contrato: `npx vitest run src/lib/perf/phaseSpans.tarefas-longas-navegacao.contract.test.ts` → **3/3 verdes**, trava
íntegra. As **oito** travas citadas no SC-009 conferidas: 088, 052, 053, 057, **082**, **085** (slug real
`085-gravacao-carga-secao-tv`), 086, 087 — todas PASS.
Testes executados: `npm run test` → **3727/3727** (688 arquivos). `npx tsc -b`, `npm run lint` (0 erros, ratchet ok com
532 arquivos) e `npm run build` verdes. `npm run test:e2e` completo → **53/54**; o único a falhar foi
`orcamento-armazenamento-migracao`, o flake **já conhecido e citado no T051**, que passou isolado em série
(`--jobs 1`, 26 s contra 135 s em paralelo). Os 4 roteiros de vitrine também rodaram à parte: **4/4**.
`quickstart.md` §3: os itens 1 e 2 (ordem de navegação, `←` no primeiro cartão, foco de volta no mesmo cartão) estão
cobertos pelos E2E `vitrine-filmes-series` e `carrosseis-filmes-series`, verdes; o item 3 (chaves agregadas e nenhum
nome de item no lote) foi verificado com mais força que no navegador — **três auditorias do `.jsonl` da TV**, em que os
únicos valores não numéricos são rótulos do conjunto fechado.
Pendências: **flake em `src/lib/player/progressRecorder.falhas.test.ts`** — falhou na 1ª execução da suíte completa e
passou na 2ª, e passa isolado 3 de 3 vezes. O arquivo está **intocado** por esta feature (`git status` limpo em
`lib/player/`), então é pré-existente, mas fica registrado como problema **aberto**, não como baseline ok. Taxa
observada: 1 em 2.

## Dependencies & Execution Order

### Phase Dependencies

- Fase 2 (T010–T014) bloqueia a Fase 3: sem instrumentação não há atribuição.
- **Fase 3 bloqueia a Fase 4** — é o FR-001, e é a razão de esta feature existir em vez de um palpite.
- O **T024** é um portão de decisão: ele pode encerrar a feature antes da Fase 4, e isso é resultado válido.
- A Fase 5 depende das rodadas das Fases 3 e 4 (usa as mesmas medições).

### Parallel Opportunities

- T011 e T012 podem rodar junto depois do T010.
- T036 e T037 podem rodar junto depois do T030.
