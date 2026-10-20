# Implementation Plan: Foco leve na TV

**Slug**: `083-foco-leve-tv` | **Date**: 2026-10-19 (re-plano; primeira versão 2026-10-18) | **Spec**: `sdd/specs/083-foco-leve-tv/spec.md`

## Summary

A receita global de foco (`tv-web/src/index.css`) anima `box-shadow` — a sombra de brilho de 40 px de desfoque é
repintada a cada quadro da transição, e foi isso que levou a grade de 140 cards a 38 fps na TV. A feature troca a
**forma de entrada** do foco, não seus valores: contorno, halo, brilho e escala continuam os tokens de hoje, e nenhuma
folha de estilo volta a animar sombra (contrato travado). Qual composição exata entra é decidido por medição na TV:
a sonda da 082 ganha um teste `foco083` que mede, na mesma sessão, a linha de base e quatro candidatas
(`research.md`), e fica a primeira, em ordem de preferência, que atingir ≥ 50 fps e zero quadros > 50 ms. A regra
vale para todo elemento focável (receita global + duas cópias locais). O app real é medido como registro, com o
`PerfOverlay` do build de medição estendido para fps e pior quadro.

## Technical Context

**Language/Version**: CSS + TypeScript 6 / React 19, Vite 8 com alvo `chrome108`.

**Primary Dependencies**: nenhuma nova. `useRemoteNav` (ADR-009) e `@tanstack/react-virtual` não são tocados.

**Storage**: N/A — não toca IndexedDB, localStorage nem catálogo.

**Testing**: Vitest (projeto `node` para o contrato que lê CSS, padrão de `styles/escala.legibilidade-tv.contract.test.ts`
e `styles/tokens.test.ts`; projeto `dom` para componentes), Oxlint + ratchet de arquitetura, `tsc -b`, build, Playwright
E2E (`tv-web/e2e/run.mjs`), sonda Tizen separada (`sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2`, instalada
por `instalar-sonda.ps1 -App app2 -Only foco083`) e o build de medição do app (`VITE_CCPLAY_PERF=1`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, origem `file://`), piso de build `chrome108`.

**Performance Goals**: sonda, troca de foco sem rolagem: ≥ 50 fps e 0 quadros > 50 ms (linha de base 38 fps / 133 ms /
5 quadros). Teto prático: só a escala mede 52 fps / 33 ms. Rolagem e app real: só registro.

**Constraints**: tokens de foco inalterados (`--focus-ring-width`, `--focus-ring-offset`, `--focus-halo`,
`--focus-glow`, `--focus-scale`, `--duration-fast` 140 ms); nada de `backdrop-filter`; nenhuma mudança de geometria,
navegação ou seleção; `.no-scale` e movimento reduzido preservados; `sonda-tv/` nunca entra em `tv-web/` nem no pacote;
instalação na TV só com autorização explícita, sem desinstalar o CCPlayTV.

**Scale/Scope**: 24 folhas de estilo em `tv-web/src/`; ~50 regras `.tv-focus` locais em 13 delas (a maioria muda cor/
fundo, não sombra); duas declarações animam `box-shadow` hoje (`index.css:258`, `styles/vod.css:1574`).

## Decisões Invariantes

- **D-001** Os valores do foco (tokens acima) não mudam; muda só o que é animado. Mudar um token é reabrir o design.
- **D-002** Nenhuma folha de estilo de `tv-web/src/` anima `box-shadow` (`transition`, `transition-property`, `all`,
  `@keyframes`) nem usa `backdrop-filter`. Garantido pelo contrato `foco-leve-tv.contract.test.ts`.
- **D-003** A composição é escolhida pela medição na TV, na ordem C1 → C2 → C3 (`research.md`); vence a primeira que
  atingir a meta **e** passar na inspeção visual. C4 (sem brilho difuso) contraria o FR-002: só com aprovação do usuário
  e emenda da spec.
- **D-004** A receita continua única e global (`button:focus`, `input:focus`, `[tabindex]:focus`, `.tv-focus`); as
  exceções de tela existentes (anel interno da vitrine, pôster da Rádio, `.vod-detail-icon`, campo de texto do
  onboarding) mantêm a geometria de hoje.
- **D-005** Gate de desempenho = sonda na TV física, mesma sessão para linha de base e receita final. Navegador e
  emulador nunca aprovam SC-001/SC-002.
- **D-006** A extensão do `PerfOverlay` (fps, pior quadro, quadros > 50 ms com tecla ativa) só existe no build de
  medição, como já é hoje; não é focável, não intercepta tecla e mostra só números.

## Constitution Check

*GATE: avaliado antes do design e reavaliado após o design (constitution v1.15.0).*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Sem autenticação ou fonte. |
| Segredos Fora dos Clientes e dos Logs | Passa | Passa | Sonda e `PerfOverlay` registram só números; nenhuma URL, item ou credencial. |
| Categorias da Fonte São Preservadas | N/A | N/A | Nenhuma leitura de catálogo. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | Passa | Passa | Foco é local e síncrono. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Passa | Passa | CSS não remove SELECT/RETURN; regressão por Vitest/E2E/TV. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | Passa | Passa | Foco continua por contorno + halo + brilho + escala, nunca só cor; nenhum estado perde o focável. C4 exigiria nova decisão (D-003). |
| Voltar Restaura Foco e Posição | Passa | Passa | Memória de foco não é tocada. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais, Nunca Prometidos | Passa | Passa | fps vem da TV; navegador só diagnóstico (D-005). |
| Documentação do Repositório É Canônica | Passa | Passa | Emenda inline na ADR-007 §4 e nota na V14 Spec §11.1 no Polish. |
| Restrições do Projeto (V14, `chrome108`, TV física) | Passa | Passa | Tokens V14 mantidos; sonda fora do pacote. |
| Fluxo de Desenvolvimento | Passa | Passa | Lint, `tsc -b`, Vitest, build e E2E antes da TV. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/083-foco-leve-tv/
├── spec.md
├── plan.md
├── tasks.md
├── research.md            # candidatas C1–C4 e ordem de escolha
├── quickstart.md
├── handoff.md
├── contract-tests.lock
├── logic/
│   └── foco-leve.md       # invariantes, papéis das medições, pseudocódigo da sonda
└── evidencias/
    └── inventario-tv-focus.md   # inventário de 2026-10-18 + complemento do re-plano
```

### Source Code (repository root)

```text
tv-web/src/
├── index.css                                  # tokens de foco + receita global (button/.tv-focusable transition)
├── styles/
│   ├── foco-leve-tv.contract.test.ts          # CONTRATO 083 (travado)
│   ├── vod.css                                # .vod-detail-icon (transição de sombra), anel interno da vitrine
│   ├── onboarding.css                         # cópia local: .text-field:focus-within
│   ├── utilities.css                          # .no-scale
│   └── shared.css, live.css, home.css, ...    # regras .tv-focus locais (cor/fundo)
├── components/PerfOverlay.tsx                 # painel do build de medição (VITE_CCPLAY_PERF=1)
└── components/focoDeEstado.test.tsx, PosterArt.test.tsx   # regressões de foco existentes

sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/
├── app2/index.html, tests.js, main.js         # teste novo foco083 (classes f-app, f-c1..f-c4)
├── instalar-sonda.ps1                         # -App app2 -AppId ccpSondaV2.Capacidades -Only foco083
└── coletor.mjs                                # grava em ../evidencias/*.jsonl (082)
```

**Structure Decision**: mudança transversal de CSS com uma linha de ferramenta de medição (sonda) e uma extensão do
painel de medição. Nenhuma rota, entidade, API, storage ou hook de navegação novo. Arquivos de tela só mudam se a
candidata escolhida exigir (C2/C3) ou se uma cópia local animar sombra.

## Complexity Tracking

Nenhuma violação da constitution.

## Estratégia de Testes

Prioridade: contrato estático de CSS → Vitest existente de foco/componentes → lint/`tsc`/build → E2E → sonda na TV
(gate) → app real na TV (registro + inspeção).

### Testes de Contrato

| Arquivo | Testes | Origem |
| --- | --- | --- |
| `tv-web/src/styles/foco-leve-tv.contract.test.ts` | 1 | FR-002, FR-003, Fora de Escopo (backdrop-filter), D-002 |

Comando (de `tv-web/`): `npx vitest run src/styles/foco-leve-tv.contract.test.ts`

Saída vermelha confirmada em 2026-10-19 (asserção, não import):
- `nenhuma folha de estilo do app anima box-shadow nem usa backdrop-filter` → recebe
  `["index.css:258 transition anima box-shadow", "styles/vod.css:1574 transition anima box-shadow"]`.

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 083-foco-leve-tv` (da raiz).

Por que só 1 dos 5: o resto do aceite é perceptivo ou de hardware (fps, pior quadro, leitura a 3 m) e vai para o
quickstart; um teste que fixasse a candidata (ex.: "sem pseudo-elemento") anteciparia a decisão D-003.

### Comandos-base (de `tv-web/`)

```powershell
npx vitest run src/styles/foco-leve-tv.contract.test.ts
npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx
npm run lint
npx tsc -b
npm run test
npm run build
node e2e/run.mjs --only home-vitrine-expandida,live-tv-ds-v14,vitrine-filmes-series   # dev server já no ar
npm run test:e2e
```

Sonda (da raiz, só com autorização): `.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -App app2
-AppId ccpSondaV2.Capacidades -Only foco083` + `node .\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\coletor.mjs
<ip-da-tv>`.

## Estado Atual

| Área | Estado |
| --- | --- |
| Receita de foco | **C1 definitiva** (R-008): sombra estática, só `transform`/`background` animam; `index.css` e `vod.css` sem transição de `box-shadow`. |
| Contrato 083 | 1/1 verde; trava íntegra. |
| Gate físico (SC-001/SC-002) | Atendido na TV: C1 51 fps / 0 quadros > 50 ms em duas rodadas (`evidencias/sonda-candidatas-tv-2026-10-19.md`). |
| Inspeção a ~3 m (SC-003/004/005) | Aprovada pelo usuário em todos os casos do roteiro (`evidencias/inspecao-tv-2026-10-19.md`). |
| SC-006 (app real) | Registro parcial: sem fps de navegação (foto tirada com o controle parado); só contadores acumulados. |
| Automatizado | `npm run test` 3607/3607, `npm run test:e2e` 54/54, lint, `tsc -b` e build ok. |
| TV | Sonda desinstalada; pacote normal (sem `PerfOverlay`) reinstalado e lançado, dados preservados por reinstalação com o mesmo certificado. |
| Documentação | ADR-007 §4/§8 e V14 Spec §11.1 emendadas (083). |
| Working tree | `PerfOverlay.tsx`, `lib/perf/` e `test-results/` misturados com a 082 (R-006): commitar a 082 antes. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Pseudo-elemento (C2/C3) é cortado por `overflow: hidden` de `.poster-box` e colide com `::before/::after` já usados (anel da vitrine, degradês do Live). | Brilho some ou sobrepõe conteúdo. | Resolvido: a C1 não usa pseudo-elemento; o corte por `overflow: hidden` e a colisão com `::before/::after` não ocorrem (a C2/C3 foram medidas na TV e não superaram a C1). C1 primeiro (D-003); se C2/C3 forem necessárias, desenho por família registrado na matriz de superfícies. |
| R-002 | C1 faz o brilho "acender" em vez de crescer; pode parecer brusco ou menos legível. | SC-005 reprova mesmo com fps ok. | Resolvido: o brilho "acende de uma vez" e foi aprovado na inspeção a ~3 m pelo usuário, em todos os casos do roteiro (2026-10-19). Inspeção na TV com capas claras/escuras/saturadas antes de escolher; se reprovar, passa para C2. |
| R-003 | Receita global alcança botões, campos, player, chips. | Regressão visual fora das grades. | Resolvido: matriz de superfícies (64 elementos em foco, 0 sem contorno), `npm run test` 3607/3607, E2E 54/54 e inspeção do usuário na TV. Matriz de superfícies (US2) + suites de componentes/player + E2E. |
| R-004 | A emenda da ADR-007 §4 e do V14 §11.1 ainda não está registrada. | Docs canônicos descrevendo a receita antiga. | Resolvido: ADR-007 §4/§8 e V14 §11.1 emendadas em 2026-10-19. Tarefa explícita no Polish. |
| R-005 | Nenhuma candidata que mantém o brilho atinge 50 fps (teto da escala é 52 fps / 33 ms). | Gate físico reprovado. | Resolvido: a C1 mantém o brilho e atinge 51 fps / 0 quadros > 50 ms; não foi preciso a C4 nem emenda da spec. Registrar números; perguntar ao usuário entre C4 (emenda da spec) e aceitar risco; não declarar convergida. |
| R-006 | `PerfOverlay.tsx`, `entryTiming.ts` e outros arquivos da 082 estão modificados e não commitados (2026-10-19). | Conflito/mistura de diffs entre features. | Resolvido: o trabalho da 082 foi commitado junto com a 083 (`ce69ad2`, a pedido do usuário), sem diffs separados. Executar a 083 depois do commit da 082, ou não tocar `PerfOverlay` até lá. |
| R-007 | A sonda vive na pasta da 082 e o coletor grava em `082-.../evidencias/`. | Evidência da 083 no lugar errado. | Resolvido: os números foram copiados para `083-.../evidencias/sonda-candidatas-tv-2026-10-19.md`, citando o `sonda-tv2.jsonl` da 082. Copiar o relatório numérico para `083-foco-leve-tv/evidencias/` e citar a origem. |
| R-008 | **Escolha da receita (T007, 2026-10-19): C1 — sombra estática, só `transform` (e `background`) anima; mesmos tokens.** Desvio de ordem: a medição (T006) foi feita na Fase 5, no fim, a pedido do usuário (testes na TV por último), com a C1 aplicada como provisória na Fase 3. **Resolvido:** na TV, duas rodadas de `foco083` sem rolagem — C1 51 fps / pior 50 ms e 33 ms / 0 quadros > 50 ms nas duas; receita antiga do app 44–46 fps, linha de base da 082 35–37 fps; C2/C3/C4 47–50 fps com quadros de 117–150 ms. Números completos em `evidencias/sonda-candidatas-tv-2026-10-19.md`. | Margem curta (51 contra meta de 50 fps). | Resolvido: C1 confirmada na TV (sonda, duas rodadas) e na inspeção do usuário. Nada a refazer na Fase 3. Se o app real ou a inspeção a ~3 m (T020/T021) reprovar a leitura do foco, reabrir com C2/C3 (R-002). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-19 | Fase 1 (Setup) | T001–T002: inventário confere (214 arquivos, 2 transições de sombra); baseline: 103 verdes + contrato vermelho, lint e `tsc` exit 0. | Fase 2 precisa de autorização para a TV. |
| 2026-10-19 | Fase 2 (parcial) | T003–T005: sonda ganha `f-app`, `f-c1..f-c4` e `foco083`; ensaio no PC; bug de especificidade em C2/C3 corrigido. T006/T007 adiadas (R-008). | Rodada na TV (Fase 5). |
| 2026-10-19 | Fase 3 (US1) | T008–T014: transição de `box-shadow` removida de `index.css` e `vod.css` (C1 provisória); contrato 1/1 verde; 104/104, lint, tsc, build ok. | Confirmar C1 na TV. |
| 2026-10-19 | Fase 4 (US2) | T015–T018: matriz (64 elementos em foco, 0 sem contorno); `PerfOverlay` + `activeFrames`; unitário 3607/3607; E2E 54/54. | Capturas de `test-results/` e `PerfOverlay` misturados com a 082. |
| 2026-10-19 | Fase 5 (TV) | Sonda `foco083` em 2 rodadas: C1 51 fps / 0 > 50 ms (R-008); app de medição + inspeção do usuário: foco ok; pacote normal reinstalado. | SC-006 sem fps de navegação. |
| 2026-10-19 | Fase 6 (Polish) | ADR-007 §4/§8 e V14 §11.1 emendadas; revisão de segredos; reconfirmação de contrato, lint, tsc e build. Skill `tizen-sonda` criada a pedido. | Commit separado da 082. |

**PRÓXIMO**: nenhum — todas as tasks concluídas. Opcional: ler fps de navegação do `PerfOverlay` na vitrine/fileira (SC-006) numa próxima ida à TV. Depois do commit da 082, commitar a 083 e rodar `sdd-converge`.

## Arquivos Principais

- `tv-web/src/index.css`, `tv-web/src/styles/vod.css` — receita C1 (sem transição de sombra).
- `tv-web/src/styles/foco-leve-tv.contract.test.ts` — contrato travado.
- `tv-web/src/lib/perf/activeFrames.ts` (+ teste) e `components/PerfOverlay.tsx` — fps/pior quadro com tecla (build de medição).
- `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2/` — `foco083`, classes `f-app`, `f-c1..f-c4`.
- `sdd/specs/083-foco-leve-tv/evidencias/` — baseline, ensaio no PC, sonda na TV, inspeção, matriz de superfícies.
- `sdd/adr/ADR-007-...md` §4 e `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` §11.1 — emendas.
- `.claude/skills/tizen-sonda/` (espelho em `.agent/`) — procedimento de sondas na TV (fora do escopo da feature).

## Cuidados para Retomada

- Não migrar para `.focus()` de DOM, Norigin ou nova biblioteca; ADR-009 fixa foco como estado React e classe CSS.
- Perguntar antes de cada instalação na TV (sonda ou app); não desinstalar o CCPlayTV nem apagar dados.
- Não declarar SC-001/SC-002 aprovados com navegador/emulador.
- Desinstalar a sonda ao fim de cada sessão (`tizen.bat uninstall -p ccpSondaV2.Capacidades -t QN50Q60DAGXZD`).

## Resultado Final

**Convergida em 2026-10-19.** O foco do app deixou de animar `box-shadow`: a receita global (`tv-web/src/index.css`) e a cópia
local de `.vod-detail-icon` (`styles/vod.css`) animam só `transform` e `background`; contorno 4 px, offset 3 px, halo, brilho de 40 px e
`scale(1.06)` são os mesmos tokens de antes, e a sombra entra e sai de uma vez. Nenhuma folha de `tv-web/src/` anima sombra nem usa
`backdrop-filter`, garantido pelo contrato travado `styles/foco-leve-tv.contract.test.ts` (1 teste, verde).

**Medido na TV de referência** (sonda `foco083`, grade de 140 cards, troca de foco a cada 140 ms sem rolagem, duas rodadas):
C1 (a receita final) 51 fps e 0 quadros > 50 ms nas duas; receita antiga do app 44–46 fps; linha de base da 082 35–37 fps; brilho em
camada, por degradê e sem brilho 47–50 fps com quadros de 117–150 ms. Com rolagem (só registro): receita antiga 31–32 fps com 14
quadros lentos; C1 48–50 fps. Aprovada a ~3 m pelo usuário em todos os casos do roteiro. SC-001, SC-002, SC-004 e SC-005 atendidos.

**Desvios em relação ao plano original**
- **Receita decidida na TV, no fim (R-008):** o plano mandava escolher por medição antes de mexer no app (Fase 2); a pedido do usuário
  ("testes na TV por último") a C1 foi aplicada como provisória e a medição ficou na Fase 5, que a confirmou. Nada foi refeito.
- **O plano de 2026-10-18** (brilho em pseudo-elemento) foi descartado antes de executar: o corte por `overflow: hidden` e os
  `::before/::after` já usados o tornavam inviável (R-001), e a medição mostrou que o pseudo-elemento não ganha desempenho nesta TV.
- **SC-006 incompleto (aceito pelo usuário na convergência):** o app real foi inspecionado, mas o painel só foi fotografado com o
  controle parado (`tecla: sem tecla`), então faltam fps e pior quadro de navegação no app real. É registro, não condiciona o aceite;
  o gate (sonda) e a rolagem sintética estão registrados. Pode ser refeito numa ida futura à TV com o build `VITE_CCPLAY_PERF=1`.
- **Fora do escopo, a pedido do usuário:** a skill `tizen-sonda` (`.claude/` e `.agent/`) e a nota no `CLAUDE.md` entraram no mesmo
  commit, assim como o trabalho pendente da 082 (`ce69ad2`).

**Decisões técnicas que valem além da feature:** `lib/perf/activeFrames.ts` (função pura, com teste) alimenta uma linha `tecla:` no
`PerfOverlay` — só no build de medição; o gate de desempenho de CSS/foco é a sonda na TV, nunca o navegador ou o emulador; a regra
"nenhuma animação de `box-shadow`" é do projeto (D-002) e uma exceção futura precisa ser decidida com o usuário.
