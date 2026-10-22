# Implementation Plan: tarefas longas fora do caminho de navegação das vitrines

**Slug**: `089-tarefas-longas-fora-navegacao`

**Spec**: `sdd/specs/089-tarefas-longas-fora-navegacao/spec.md`

## Summary

A feature 088 mediu três rodadas na TV de referência e **inocentou o caminho de navegação** — `tecla` 0,1%, `render`
4,5%, pintura de capa 10 ms. Sobraram **95,4%** do tempo em que a thread fica presa sem dono, e nenhuma fonte conhecida
explica (pré-carga, carga da lista, produtor do Top 10/Dica, montagem de tela e o próprio painel de medição foram todos
refutados com medianas planas).

Esta feature **nomeia esse dono e o reduz**. O instrumento é um discriminador, não um quarto palpite: o **atraso de
cada tarefa longa desde a última tecla** separa trabalho disparado pela navegação (e que só acontece depois do primeiro
quadro, onde os intervalos da 088 fechavam) de trabalho independente dela. Antes de gastar a primeira rodada, a sonda
automática é consertada — ela abandona metade das janelas de cada rodada, e o orçamento aqui é de **quatro rodadas**.

## Technical Context

| Item | Valor |
| --- | --- |
| Linguagem | TypeScript 5 / React 19 (com React Compiler), Vite 8 com alvo `chrome108` |
| Plataforma | Samsung QN50Q60DAGXZD — Tizen 9 / Chromium 120, origin `file://`, ~310 MB de RAM livres |
| Medição | Canal de métricas da feature 085 (`lib/perf/metricsChannel.ts`), coletor local, sonda automática da 087 |
| Chaves do canal | `/^[a-z][A-Za-z0-9]{0,39}$/`, valores numéricos finitos; strings só do conjunto fechado `LABELS` |
| Instrumentação herdada | `longTasks.ts` (início + duração), `phaseSpans.ts` (etapas), `longTaskAttribution.ts` (partição), tudo da 088 |
| Flags | `VITE_CCPLAY_PERF`, `VITE_CCPLAY_METRICS_REPORT`, `VITE_CCPLAY_AUTOPILOT`, `VITE_CCPLAY_PERF_QUIET` |
| Virtualização | `@tanstack/react-virtual`: vertical em `VodShowcaseScreen.tsx:483` (`overscan: 2`), horizontal em `Rail.tsx:53` (`overscan: 3`) |
| Foco | `useRemoteNav` — estado do React, lido por `.tv-focus` (ADR-009). Nunca `document.activeElement` |
| Testes | Vitest, dois projetos: `dom` (jsdom, `*.test.tsx`) e `node` (`*.test.ts`); `.ts` que precisa de DOM entra em `TESTES_TS_COM_DOM` (`vite.config.ts`) |
| Linha de base (2026-10-22) | Thread presa **28%**, pior quadro **400 ms** de mediana (até 817), **41 fps**; teto observado 55–59 fps |
| Escala | Lista real: 43 549 filmes / 34 categorias, 9 777 séries / 28, 2 355 canais |

**ADRs tocadas, nenhuma contrariada**: ADR-009 (foco é estado, não DOM-ref) governa qualquer mexida em virtualização;
ADR-007/011 (contrato visual) governa o FR-006; ADR-008/ADR-002 ficam intactas porque Worker e formato de gravação
estão **fora de escopo** por decisão do usuário.

## Decisões Invariantes

- **D-001**: Nenhuma otimização antes de a atribuição estar fechada com número (FR-001). Foi esta regra que pegou os
  dois erros da 088, e ela vale inclusive para o que parece óbvio.
- **D-002**: A primeira medida é o **atraso desde a última tecla**, e não um quarto nome de etapa. Escolhido porque
  discrimina duas causas opostas numa só rodada.
- **D-003**: **Uma** medida nova por rodada. Acrescentar várias de uma vez devolve um retrato ilegível e gasta o
  orçamento de quatro rodadas.
- **D-004**: A agregação é **por janela** (~5 s), em chaves planas de um conjunto fechado. Uma linha por evento
  inundaria o canal e mudaria o que está sendo medido.
- **D-005**: `performance.now()` em toda medida de tempo. Misturar com `Date.now()` foi o que produziu os 266 s numa
  janela de 5 s na 088 (R-008 de lá).
- **D-006**: A sonda **nunca** aciona `Enter` sem o foco comprovadamente no rótulo do destino. O conserto do limite de
  passos não afrouxa isso — é o que impede o incidente da 087 (a TV tocando uma série sozinha).
- **D-007**: O orçamento é de **quatro** instalações de medição. Esgotado sem o alvo, encerra declarando (FR-010).
- **D-008**: `lib/useRemoteNav.ts` (319 linhas) e `features/vod/VodShowcaseScreen.tsx` (733) estão **no teto do
  ratchet**. Qualquer linha a mais reprova `npm run lint`. Instrumentação entra por fora; mudança neles exige extração.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Sem Conta Obrigatória | N/A — nada de conta aqui | N/A |
| Segredos Fora dos Clientes e dos Logs | Risco real: a medição emite dados ao coletor | **OK** — FR-014; chaves de conjunto fechado, travado por contrato; `.jsonl` auditado antes de virar evidência |
| Categorias da Fonte São Preservadas | N/A — nada de taxonomia | N/A |
| IA e Classificação Nunca Inventam Dados | N/A | N/A |
| Comandos Locais Independem de Rede/Backend/IA | OK — medição é local, coletor na LAN | **OK** — o destino só aceita `http` em `localhost`/`192.168.x.y` |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A |
| Toda Ação Essencial Tem Caminho por Controle Remoto | Risco: mexer em virtualização pode prender o foco | **OK** — FR-004; travas de 052/053 e contrato D-006 |
| Lista de Catálogo Não É Manifesto de Streaming | N/A | N/A |
| **Foco Visível e Sem Becos Sem Saída** | **Risco alto**: reduzir a janela montada pode desmontar o item focado | **OK com guarda** — `useVirtualFocusSync` mantém o focado montado; R-003 acompanha, e as travas de 052/053 falham se quebrar |
| **Voltar Restaura Foco e Posição** | Risco: reconciliação é por id, não índice | **OK** — FR-004, e a trava de 052 fixa a restauração por id |
| Identidade de Reprodução Não Depende da URL | N/A | N/A |
| **Progresso e Capacidades São Reais, Nunca Prometidos** | Risco: declarar ganho sem medir, ou card com dado inventado | **OK** — FR-005 (ganho em duas rodadas ou sai) e FR-007 (só moldura e dado real) |
| Documentação do Repositório É Canônica | OK | **OK** — FR-013; evidência por rodada, e a regra permanente da 088 já está no `CLAUDE.md` |

Nenhuma violação a justificar. `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```
sdd/specs/089-tarefas-longas-fora-navegacao/
├── spec.md                      # 15 FR, 12 SC, 3 user stories
├── plan.md                      # este arquivo
├── tasks.md                     # as fases
├── logic/atraso-e-sonda.md      # o algoritmo do atraso e a causa/conserto da sonda
├── quickstart.md                # verificação manual e o roteiro das rodadas de TV
├── handoff.md                   # mapa para a sessão que executar
├── contract-tests.lock          # 5 testes travados em 2 arquivos
└── evidencias/                  # uma por rodada de TV
```

### Source Code (repository root)

```
tv-web/src/
├── lib/perf/
│   ├── keyDelay.ts                                        # NOVO — o atraso por faixa (stub criado)
│   ├── keyDelay.tarefas-longas-fora-navegacao.contract.test.ts    # TRAVADO (3 testes)
│   ├── autopilot.ts                                       # conserto do limite de passos (US3)
│   ├── autopilot.tarefas-longas-fora-navegacao.contract.test.ts   # TRAVADO (2 testes)
│   ├── longTasks.ts            # já entrega início + duração (088)
│   ├── longTaskAttribution.ts  # a partição por etapa (088)
│   ├── phaseSpans.ts           # as etapas nomeadas (088)
│   └── metricsChannel.ts       # o canal, com o conjunto fechado de chaves (085)
├── components/
│   ├── PerfOverlay.tsx         # instala e emite no lote de ~5 s
│   ├── Rail.tsx                # trilho horizontal virtualizado — candidato, não alvo
│   └── PosterArt.tsx           # o único lugar que desenha <img>
├── lib/focus/useVirtualFocusSync.ts  # scrollToIndex a cada troca de foco — candidato
└── features/vod/VodShowcaseScreen.tsx  # NO TETO do ratchet (D-008)
```

## Complexity Tracking

Nada a registrar: a feature não introduz abstração nova além de um módulo de medição, e o escopo exclui por decisão do
usuário as duas mudanças que seriam estruturais (Worker e formato de gravação).

## Estratégia de Testes

Ordem: unitário → contrato → E2E → TV. **A TV é gate** para SC-001 a SC-006 — o navegador do PC dá 60 fps em tudo e
nunca aprova fluidez.

```powershell
npx vitest run src/lib/perf                     # a área tocada
npm run test                                    # gate final (baseline: 3727/3727)
npx tsc -b
npm run lint                                    # inclui o ratchet (D-008!)
npm run build
```

```bash
cd tv-web && npm run test:e2e -- --only vitrine-filmes-series,carrosseis-filmes-series,top10-dica,home-vitrine-expandida
cd tv-web && npm run test:e2e                   # gate completo antes da TV
```

As **nove** travas (as oito de outras features são o guarda-corpo do FR-004/FR-007):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 089-tarefas-longas-fora-navegacao
# e: 052-vitrine-filmes-series, 053-carrosseis-filmes-series, 057-top10-dica-tmdb,
#    082-orcamento-armazenamento-tv, 085-gravacao-carga-secao-tv, 086-montagem-rapida-telas,
#    087-top10-dica-segundo-plano, 088-tarefas-longas-navegacao
```

### Testes de Contrato

**5 de 5 do orçamento**, em 2 arquivos. Comando:

```powershell
npx vitest run src/lib/perf/keyDelay.tarefas-longas-fora-navegacao.contract.test.ts src/lib/perf/autopilot.tarefas-longas-fora-navegacao.contract.test.ts
```

Saída vermelha **confirmada** em 2026-10-22 (5 failed, 0 passed) — cada uma pelo motivo certo:

| Teste | Falha por | Origem |
| --- | --- | --- |
| separa por faixa de atraso, e a soma dos ms fecha com a duração total | `Error: not implemented` (`keyDelay.ts:30`) | FR-002, `logic/atraso-e-sonda.md` §1 |
| usa só as chaves do conjunto fechado, e omite a faixa sem amostra | `Error: not implemented` | FR-014 + Constitution "Segredos Fora dos Clientes e dos Logs" |
| a tarefa pertence à faixa do seu início, mesmo atravessando a tecla seguinte | `Error: not implemented` | `logic/atraso-e-sonda.md` §1 (o invariante contraintuitivo) |
| volta à topbar de 25 fileiras abaixo, onde o limite antigo de 12 passos desistia | `AssertionError: expected false to be true` | US3/AC1, FR-009, `logic` §2 |
| mesmo com o limite maior, não aciona nada quando o foco nunca alcança a topbar | `AssertionError: expected 12 to be greater than or equal to 50` | D-006 + Constitution "Foco Visível e Sem Becos Sem Saída" |

A última asserção (`12 → 50`) **confirma empiricamente** a causa do `falhas = 2` que `logic` §2 deduziu lendo o código:
o limite real é 12 passos, e a navegação desce ~22 fileiras.

Nota de método: o 5º teste começou passando (o comportamento de desistir já existe) e foi **fortalecido** até ficar
vermelho — ele agora exige que a sonda tente até a profundidade nova **antes** de desistir. Um contrato que passa de
saída não prova nada; este protege o invariante **e** mede o conserto.

Fora dos contratos: a redução da US2 não tem contrato porque seu alvo **ainda não existe** — ele é o resultado da US1.
Testes da redução são escritos pelo executor em arquivos não travados, depois de a atribuição nomear o alvo.

## Estado Atual

| Área | Estado |
| --- | --- |
| Contratos travados (089) | **5/5 verdes**; trava íntegra |
| As outras oito travas | **Íntegras** |
| `npm run test` | 3737/3737 antes do T026; a rodar de novo no Polish |
| **SC-006 (a sonda)** | **CUMPRIDO** em **duas** rodadas independentes (`falhas = 0`) |
| **O ALVO** | **NOMEADO**: `useCategoryPreviews` recria a consulta da janela a cada tecla (`catalogApi.ts:1774`) |
| Evidência | `queriesN` **274**/janela (19,6 por tecla) contra `scrollsN` 6 e `idbTxN` 9; 41 → 33 fps quando sobe |
| Virtualizador / `scrollToIndex` | **ELIMINADO** — `scrollsN` não correlaciona (40 → 40 fps) |
| Pré-carga, capa, painel de medição | Eliminados (rodada 1 e feature 088) |
| Orçamento de TV | **2 de 4 usadas**; as duas restantes são as de verificação do FR-005 |
| Pacote normal | **Na TV**, sem marcador; nada desinstalado |
| **Fase 4 (reduzir)** | **Pronta para começar**, com alvo e mecanismo |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação |
| --- | --- | --- | --- |
| R-001 | **A atribuição pode não fechar nem com o atraso**: se os atrasos saírem espalhados, sabe-se que não é a navegação, mas não de quem é | Gasta uma rodada e continua sem alvo | D-003 (uma medida nova por rodada) e FR-010 (orçamento de quatro). Um resultado negativo ainda é informação: elimina a navegação por completo |
| R-002 | **A medição altera o que mede**: foi suspeita real na 088 | Números que não existem fora do medidor | A 088 já testou isso (`VITE_CCPLAY_PERF_QUIET`): −5% sem o painel, pior quadro idêntico. A flag fica disponível para repetir o controle |
| R-003 | **Reduzir a janela de virtualização pode desmontar o item focado** | Foco preso ou invisível — viola a constitution | `useVirtualFocusSync` mantém o focado montado; as travas de 052/053 falham se a navegação mudar; FR-004 |
| R-004 | **`VodShowcaseScreen.tsx` (733) e `useRemoteNav.ts` (319) estão no teto do ratchet** (D-008) | `npm run lint` reprova qualquer linha nova | Instrumentação por fora (foi o R-007 da 088, e deu desenho melhor). Mudança nesses arquivos exige extração, planejada como task própria |
| R-005 | **A troca fluidez × card em branco** pode ser a única via de ganho | Tela que a pessoa não quis | FR-006: medida **e** mostrada na TV antes de permanecer. Precedente da 083 |
| R-006 | **O conserto da sonda pode reintroduzir o incidente da 087** (apertar `Enter` fora do destino e tocar conteúdo) | A TV começa a reproduzir sozinha durante a medição | D-006 e os 2 contratos travados de `autopilot`. O conserto é ensaiado no PC antes de qualquer instalação (FR-009) |
| R-007 | **O flake de `progressRecorder.falhas.test.ts`** (1 em 2, herdado, arquivo não tocado por esta feature) | Suíte vermelha confundida com regressão | Rodar a suspeita isolada e a suíte duas vezes antes de culpar uma mudança |
| R-008 | **O diagnóstico do `falhas = 2` estava com a mecânica errada** (descoberto pelo ensaio do T014): eu atribuí a profundidade ao número de `ArrowDown` da navegação; ela vem do **número de categorias** da lista | O primeiro conserto foi um literal (69) derivado da duração da janela — cobriria a TV de hoje e voltaria a falhar numa lista com 80 categorias | **Resolvido**: `passosAteTopbar()` deriva do DOM e escala com as categorias; o piso de 69 cobre a lista não montada. `logic` §2 corrigido com a tabela medida (6 cat → 9, 34 cat → 31) |
| R-009 | **`createKeyDelayTracker` guarda a última tecla como semente** entre janelas, contrariando o que o T016 previa | Sem a semente, uma tarefa longa no início da janela seguinte viraria `atrasoSemTecla` e inflaria a faixa que aponta a causa para a abertura em vez da navegação | **Decidido e testado**: a semente fica, e o teste do T016 verifica o comportamento correto |
| R-010 | **O padrão do atraso é bimodal, e o enriquecimento forte está ACIMA de 300 ms** (1,62× na navegação plena), não logo depois da tecla | Descarta trabalho síncrono com a tecla **e** trabalho periódico independente — as duas leituras simples que a tabela de `logic` §1 previa. O que sobra é trabalho que a navegação dispara e que transborda o intervalo entre teclas | **Aberto, e é o conteúdo do T022/T025**: separar as três candidatas (consultas por troca de foco, recálculo do virtualizador, leitura de IndexedDB) custa a rodada 2 de 4 |
| R-011 | **A folga do orçamento de quatro rodadas foi consumida**, exatamente como o A-01 do handoff previu: 1 (atribuição) + 1 (medida nova) + 2 (verificação) = 4, sem sobra | Se a medida nova não bastar, não há rodada para uma terceira tentativa dentro do FR-010 | **Avisado ao usuário no momento certo**, como o A-01 mandava. Pedir uma 5ª rodada é decisão dele |
| R-012 | **O alvo é a recriação da consulta da janela de previews a cada tecla** (`useCategoryPreviews`, `catalogApi.ts:1774`): a `queryKey` contém a lista de ids das categorias visíveis, então deslizar a janela cria consulta nova, dispara um `fetchQuery` por categoria e deixa a anterior órfã | 19,6 eventos de cache por tecla, e 8 fps de diferença entre as janelas com mais e menos eventos | **Nomeado, não resolvido**: é o alvo da Fase 4. A prova será o ganho em duas rodadas (FR-005); contagem não é cronometragem |
| R-013 | **`useQueries` com observadores variáveis já foi tentado e falhou** — o comentário em `useCategoryPreviews` registra "Maximum update depth" numa descida longa | A solução óbvia (um observador por categoria) é justamente a que quebrou antes | **Registrado antes de começar a Fase 4**: a saída precisa ser uma chave **estável** ou agregação fora do React Query, não voltar ao `useQueries` |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-22 | Fase 3 (US1, rodada 2) | **O alvo foi nomeado**: `queriesN` 274/janela (19,6 por tecla) contra 6 e 9 dos outros contadores, com 41 → 33 fps. Mecanismo no código: a `queryKey` de `useCategoryPreviews` muda a cada tecla. **Virtualizador eliminado** | A prova é o ganho em duas rodadas (FR-005); restam exatamente duas (R-011) |
| 2026-10-22 | Fase 3 (US1, TV) | Rodada 1 de 4. **SC-006 cumprido** (`falhas = 0`, Séries medida) e o invariante da soma validado no aparelho. Atribuição **bimodal** (1,62× acima de 300 ms); pré-carga e capa **eliminadas** | **O dono dos 93% segue sem nome** (R-010); a folga do orçamento foi consumida (R-011). T022/T025 são decisão do usuário |
| 2026-10-22 | Fase 1 (Setup) | T001/T002: 5 contratos vermelhos pelos motivos registrados e as nove travas íntegras | Nenhuma |
| 2026-10-22 | Fase 2 (Foundational) | T010–T017: `keyDelay` pronto, sonda consertada, 5/5 contratos verdes. **O ensaio no PC refutou a mecânica do meu diagnóstico** (R-008) e o conserto foi refeito para escalar com as categorias. Ensaio de ponta a ponta: **`falhas: 0`** nas quatro janelas | O SC-006 na lista real só vale no T020 — o PC não aprova desempenho |

PRÓXIMO: **Fase 4 (T030–T041) — reduzir, com alvo nomeado.** Fazer a janela de previews parar de recriar a consulta a cada tecla, **sem** voltar ao `useQueries` que estourou antes (R-013). As duas rodadas restantes são as de verificação (FR-005): ganho que não aparecer nas duas **sai**.

## Arquivos Principais

<!-- Preenchido pelo sdd-execute. -->

## Cuidados para Retomada

- **`features/catalog/catalogApi.ts` é grande e tem teto no ratchet** — confira antes de acrescentar linhas lá para a Fase 4; pode exigir extração.
- **O `PerfOverlay` está FORA do `QueryClientProvider`** (`main.tsx:67` contra `:61`): instrumentação que precisa do cache de consultas é instalada no `main.tsx`, não no painel.

- **Nunca leia a distribuição do atraso pela proporção bruta**: as faixas têm larguras diferentes (50, 100, 150 ms e o resto do intervalo entre teclas). Normalize pela largura, senão a faixa 150–300 parece a maior quando é a **mais pobre** (0,72×).
- **Separe as janelas por `teclaN` antes de concluir.** O enriquecimento acima de 300 ms é 1,62× na navegação plena e 1,07× com pouca tecla: sem essa separação, a conclusão viraria "é artefato das pausas da sonda".

- **Ao ensaiar no PC, confirme a PORTA do dev.** O Vite cai para 5174 quando a 5173 está ocupada, e um ensaio rodado contra o dev antigo testa o app **sem** instrumentação — foi o que aconteceu na primeira tentativa do T014, e o coletor não recebeu nada. Mate as portas antes (`Get-NetTCPConnection -LocalPort 5173,5174,8770`).
- **A profundidade da vitrine escala com o número de categorias da lista**, não com quantas vezes a navegação desceu: 6 categorias → 9 subidas até a topbar, 34 → 31 (medido). Qualquer limite fixo de passos volta a falhar numa lista maior.

- **`lib/useRemoteNav.ts` (319) e `features/vod/VodShowcaseScreen.tsx` (733) estão EXATAMENTE no teto do ratchet.** Uma
  linha a mais reprova `npm run lint`. Foi o R-007 da 088.
- **`npm run test` tem flake herdado** em `src/lib/player/progressRecorder.falhas.test.ts` (1 em 2, passa isolado) e
  o E2E tem `orcamento-armazenamento-migracao` (1 em 4, passa em série com `--jobs 1`).
- **`capaMs`/`capaMax` de evidências antigas da 088 (antes do T027 de lá) não são tempo de CPU** — mediam espera de
  parede. Só as leituras a partir da rodada de controle valem.
- **Nunca compare tempo de parede com tempo de thread.** Dividir `renderMs` por `longTaskMs` deu "o render é 23%"
  quando a partição correta mostrou 4,5% (R-012 da 088).
