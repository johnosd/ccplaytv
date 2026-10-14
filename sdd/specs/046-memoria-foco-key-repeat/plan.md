# Implementation Plan: Memória de foco por área e key repeat

**Slug**: `046-memoria-foco-key-repeat` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/046-memoria-foco-key-repeat/spec.md`

## Summary

Backlog item 14, em duas stories independentes. **14a (P1)**: um rastreador de rajada de tecla
(`lib/focus/keyRepeat.ts`, `KeyboardEvent.repeat` em `window`/captura) que o único trabalho disparado por
foco do app — o prefetch de categoria da trilha (`useCategoryFocusPrefetch`) — consulta para não agendar
nada enquanto uma seta é segurada; ao soltar (ou após 300 ms de silêncio), o debounce atual de 300 ms
roda para a categoria onde o foco parou. A assinatura do hook não muda, então Live, Filmes e Séries
ganham o comportamento juntos. **14b (P2)**: memória de foco da Live em módulo
(`features/live/liveSessionMemory.ts`, igual a `vodSessionMemory`), por lista + entrada
(★ Favoritos / Todos / categoria), gravada quando o canal focado pertence à lista exibida e restaurada
ao reentrar; mais um `onPlayerClosed` que, ao fechar o player, devolve o foco ao canal que tocava na
entrada de onde a sessão começou — corrigindo um caso real em que o zapping troca a entrada exibida e
o foco cai no 1º item.

Nenhuma mudança de dados, de Dexie, de ADR ou de CSS. Spec: `logic/key-repeat.md`,
`logic/memoria-foco-live.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108`, ver CLAUDE.md — não remover).

**Primary Dependencies**: as já existentes (`@tanstack/react-query`, `@tanstack/react-virtual`). Nenhuma nova.

**Storage**: nenhum. Memória só em módulo (sessão do app), como `vodSessionMemory`; sem Dexie, sem
`localStorage` (FR-012).

**Testing**: Vitest + Testing Library (jsdom), Playwright E2E (`tv-web/e2e/*.mjs`, dev server), contratos
travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), palco 1920×1080.

**Performance Goals**: durante a rajada, 0 consultas de prefetch (SC-001); sem custo por tecla além de um
`setState` de um booleano que só muda nas bordas da rajada.

**Constraints**: constitution 1.7.0 ("Voltar Restaura Foco e Posição", "Foco Visível e Sem Becos Sem
Saída", "Comandos Locais Independem de Rede"); ADR-009 (`useRemoteNav` **não é alterado**); ADR-011
(sem preview/consulta por foco); testes de tela existentes mockam `useCategoryFocusPrefetch` — a
assinatura é intocável; 12+ contratos travados de outras features montam `LiveScreen`/telas VOD sem edição.

**Scale/Scope**: 1 módulo de lib novo, 1 módulo de feature novo, 1 hook alterado
(`useCategoryFocusPrefetch`), 3 hooks da Live alterados (`useLiveCatalog`, `useLiveKeyboard`,
`useLiveZapping`), 1 função pura nova em `liveTrail.ts`, 1 linha em `importApi.ts`, `setupTests.ts`.

## Decisões Invariantes

- **D-001** O estado de rajada é **só leitura e paralelo** ao teclado: listeners em `window`, captura,
  passivos, sem `preventDefault`/`stopPropagation`. `useRemoteNav` não muda (ADR-009 intacta).
- **D-002** Só o prefetch de categoria consome a rajada (spec, Fora de Escopo). Metadata, EPG "Agora" e
  capas não são tocados: já não disparam rede por foco.
- **D-003** "Estabilizou" = `keyup` da seta **ou** 300 ms sem novo evento repetido; depois, o debounce de
  300 ms **atual** (nenhum delay novo de 520/850 ms — não há preview por foco, ADR-011).
- **D-004** `useCategoryFocusPrefetch` mantém a assinatura e a regra "nunca aborta a categoria já entrada".
- **D-005** A memória da Live é por `sourceId` + entrada, chaveada pelo **nome** da categoria
  (`groupLabel`), valor = id do canal + índice como **dica** de vizinho (nunca identidade).
- **D-006** Grava só se: coluna de canais, sem busca ativa, e o canal focado pertence a `items`. A posição
  numa lista filtrada ou o `channelId` de uma vizinhança de zapping nunca sobrescrevem a memória.
- **D-007** Entrada nunca visitada abre no 1º item (comportamento atual); nenhum teleporte novo.
- **D-008** Fechar o player restaura `entered` + trilha para a entrada de origem (`zapKeyRef`) com o canal
  que tocava; o guia EPG (031) mantém seu próprio retorno.
- **D-009** `forgetLiveSource` é chamado em `useDeleteSource.onSuccess` (feature), nunca de `lib/`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Nada de conta/rede novos. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | A memória guarda só ids de canal; nenhuma credencial/URL. |
| Categorias da Fonte São Preservadas | OK | OK | Chave por nome da categoria da fonte; nada é renomeado/substituído. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede | OK | OK | Foco/memória 100% locais; a rajada **reduz** consultas. |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Nenhuma tecla nova; nada depende de gesto. |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Restauração sempre deixa um foco (cai no vizinho/1º item); estados vazio/erro mantêm a ação focável (FR-015); focar nunca toca nem consulta (FR-016). |
| Voltar Restaura Foco e Posição | OK | OK | É o objeto da feature: voltar à categoria restaura o item; sair do player devolve o canal; reconciliação por id, vizinho por dica de posição. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Memória por id de canal do catálogo; nada por URL; favoritos/progresso não mudam. |
| Progresso e Capacidades São Reais | N/A | N/A | — |
| Documentação do Repositório É Canônica | OK | OK | Polish atualiza CLAUDE.md, backlog; spec/plan/quickstart/logic no repo. |

Sem violação; `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/046-memoria-foco-key-repeat/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    ├── key-repeat.md
    └── memoria-foco-live.md
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/focus/
│   ├── keyRepeat.ts                         # NOVO (stub do plan): rastreador + useKeyRepeatBurst
│   └── keyRepeat.test.ts                    # NOVO (executor)
├── features/catalog/
│   ├── catalogApi.ts                        # useCategoryFocusPrefetch passa a ler a rajada
│   └── catalogApi.key-repeat.contract.test.tsx   # TRAVADO (2)
├── features/live/
│   ├── liveSessionMemory.ts                 # NOVO (stub do plan): memória por lista+entrada
│   ├── liveSessionMemory.memoria-foco.contract.test.ts   # TRAVADO (1)
│   ├── LiveScreen.memoria-foco.contract.test.tsx          # TRAVADO (2)
│   ├── liveTrail.ts                         # + liveEntryKey(), trailKeyOf() (puras)
│   ├── useLiveCatalog.ts                    # grava memória; dica de vizinho no locateOrNeighbor
│   ├── useLiveKeyboard.ts                   # enter* restauram o canal lembrado
│   ├── useLiveZapping.ts                    # onPlayerClosed
│   └── LiveScreen.tsx                       # onClose → zapping.onPlayerClosed
├── features/import/importApi.ts             # useDeleteSource → forgetLiveSource
└── setupTests.ts                            # afterEach: resetKeyRepeatTracker + resetLiveSessionMemory
tv-web/e2e/
└── memoria-foco-key-repeat.mjs              # NOVO (executor, entra em test:e2e)
```

**Structure Decision**: o rastreador fica em `lib/focus/` (junto de `reconcileFocus`,
`useVirtualFocusSync`); a memória fica em `features/live/` ao lado de onde é usada, espelhando
`features/vod/vodSessionMemory.ts`. Nenhum arquivo de `components/` muda.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma) | | |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (a partir de `tv-web/`):

```powershell
npx vitest run <arquivo>        # um arquivo
npx vitest run                  # suíte toda (flakes conhecidos de *.favorites.test.tsx/LiveScreen.test.tsx sob paralelismo — rodar isolado)
npx tsc -b                      # tipos
npm run lint                    # oxlint (baseline: 45 warnings, feature 040 R-006)
npm run build                   # tsc -b && vite build
npm run test:e2e                # dev server (npm run dev) já rodando
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/catalog/catalogApi.key-repeat.contract.test.tsx`,
`tv-web/src/features/live/liveSessionMemory.memoria-foco.contract.test.ts`,
`tv-web/src/features/live/LiveScreen.memoria-foco.contract.test.tsx`.

Comando (a partir de `tv-web/`):
`npx vitest run src/features/catalog/catalogApi.key-repeat.contract.test.tsx src/features/live/liveSessionMemory.memoria-foco.contract.test.ts src/features/live/LiveScreen.memoria-foco.contract.test.tsx`

Integridade (a partir da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 046-memoria-foco-key-repeat`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| rajada com repeat não prefetcha nada; ao soltar, só a categoria final | FR-002, FR-003, US1/AC1+AC2, SC-001 | Fase 3 (US1) | `expected vi.fn() to not be called at all, but actually been called 1 times` |
| sem keyup, a rajada acaba sozinha após o silêncio | FR-005, D-003 | Fase 3 (US1) | idem (chamado aos 300 ms, antes de silêncio + debounce) |
| lembra o canal por lista e entrada, nunca mistura listas, e esquece uma lista | FR-007, FR-009, FR-012, FR-013 | Fase 4 (US2) | `Error: not implemented` |
| trocar de categoria e voltar devolve o foco ao último canal | US2/AC1, FR-008, Constitution: Voltar Restaura Foco | Fase 4 (US2) | `expected 'A1A1' to contain 'A4'` |
| fechar o player depois de zapping e ↓ devolve o foco ao canal que tocava | US2/AC3, FR-011 (caso traiçoeiro) | Fase 4 (US2) | `expected 'G1' to be 'Todos'` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/focus/keyRepeat.ts`
(`useKeyRepeatBurst` lança `not implemented`; `resetKeyRepeatTracker` é no-op provisório),
`tv-web/src/features/live/liveSessionMemory.ts` (idem).

Fora dos contratos (E2E/manual): SC-002 (sem regressão em foco parado — já coberto pelos 8 testes
existentes de `useCategoryFocusPrefetch` em `catalogApi.test.tsx`, que devem continuar verdes), SC-006 e
`repeat` real na TV (quickstart).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| US1 / 14a (key repeat) | Código completo. `keyRepeat.ts` + `useCategoryFocusPrefetch` por assinatura síncrona. Contrato 2/2 verde; `keyRepeat.test.tsx` (9) e `catalogApi.key-repeat.test.tsx` (1). |
| US2 / 14b (memória da Live) | Código completo. `liveSessionMemory.ts`, `liveEntryKey`/`trailKeyOf`, gravação em `useLiveChannels`, restauração em `useLiveKeyboard`, `onPlayerClosed`, `forgetLiveSource` em `useDeleteSource`. Contratos 3/3 verdes; 4 testes complementares + 3 de apoio. |
| Contratos | 5/5 verdes, trava íntegra; as travas das outras 28 features, íntegras. |
| Suíte | `tsc -b` limpo; unitária 2389/2393 (as 4 falhas são os contratos vermelhos da feature 047, ainda não executada); lint sem warning novo nos arquivos tocados (total 54 vs baseline 45 do plan — o resto vem de trabalho não commitado de 044/045/047); `npm run build` ok; `npm run test:e2e` 26/26 (inclui `memoria-foco-key-repeat`, 3/3 execuções isoladas verdes). |
| Pendente | Passada na TV física (recomendada, não é gate): `repeat` real nas setas (R-001) e SC-006. `build:tizen` não rodado de propósito. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A TV pode não entregar `KeyboardEvent.repeat` (a feature 013 já viu um controle que não entregou `keydown`/`keyup` como o navegador). | Sem `repeat`, a rajada nunca é detectada e o comportamento volta ao atual (debounce 300 ms), sem regressão. | Verificar na TV (quickstart §Manual); se confirmado, abrir spec para detecção por intervalo (fora do escopo). |
| R-002 | O primeiro `keydown` de uma sequência tem `repeat:false` e o intervalo até o primeiro repeat (~500 ms na TV) é maior que o debounce. | Um prefetch da categoria do 1º passo pode disparar legitimamente. | Resolvido: aceito — é o toque isolado de hoje; não "consertar". Documentado em `logic/key-repeat.md` §3. |
| R-003 | O edge case da spec "Todos carrega aos poucos" não existe na Live: `useAggregatedItems` não é paginado lá (só em Filmes/Séries, feature 039). | Nenhum código a mais; a spec descreve algo que só vale para VOD, onde a memória já existe. | Resolvido: registrado; nenhum código a mais, sem alteração de spec (não afeta FR). |
| R-004 | Memória em módulo vaza entre testes; 12+ contratos travados de outras features montam `LiveScreen` e não podem ser editados. | Estado de um teste afetaria o próximo. | Resolvido: `setupTests.ts` chama `resetKeyRepeatTracker` + `resetLiveSessionMemory` em `afterEach` global. |
| R-005 | `onPlayerClosed` muda `entered`/trilha ao fechar o player; testes existentes de `LiveScreen` (016/027/031) assertam o foco depois de fechar. | Regressão sutil nesses testes. | Resolvido: o caso comum (canal pertence à entrada exibida) é idêntico ao atual; `LiveScreen*.test.tsx` rodados isolados (188/188). A regressão que a guarda evita está em R-008. |
| R-006 | O contrato 5 depende de ↓ no player (chrome oculto) = próximo canal da vizinhança (feature 027). | Se 027 mudar a tecla, o teste quebra por outro motivo. | Resolvido: o mapeamento ↑=anterior/↓=próximo está confirmado na TV (027, 2026-09-28); contrato 5 verde. |
| R-007 | Desvio de `logic/key-repeat.md` §2: `fast` **não** entra nas dependências do efeito de `useCategoryFocusPrefetch`; o efeito assina `subscribeKeyRepeatBurst` e cancela/rearma o timer na hora. | Com `fast` em estado de React, a borda "rajada acabou" (disparada pelo timer de silêncio do rastreador, fora de `act()`) não era renderizada de forma síncrona e o prefetch nunca rearmava no teste do contrato — e em produção custaria um render por borda. | Resolvido: assinatura direta, contratos 2/2 verdes. `useKeyRepeatBurst` (hook) segue exportado e testado, sem consumidor ainda. |
| R-008 | Desvio de `logic/memoria-foco-live.md` §4: `onPlayerClosed` só restaura a entrada de origem se o canal que tocava **não** está na lista exibida (`items`). | Sem essa guarda, `LiveScreen.test.tsx › "↑ dentro do zapping com shell não deixa a topbar inacessível…"` quebrava: a restauração movia a trilha que a pessoa tinha deixado em "★ Favoritos" dentro do zapping. | Resolvido. Consequência aceita: zapping dentro da mesma categoria deixa a lista na categoria (não volta a "Todos"), com o foco no canal certo; a memória guardada é a da categoria exibida (US2/AC3 vale: "memória de A guarda Y"). O caso de outra categoria (contrato 5, E2E `5 zapping → Canal B1 em "Todos"`) volta à origem. |
| R-009 | `setupTests.ts` ganhou `afterEach` global (reset do rastreador e da memória) e importa dois módulos de produção. | Roda para todos os projetos do vitest (`dom` e `node`). | Resolvido: `resetKeyRepeatTracker` só mexe em `window`/`document` se houver listeners anexados; verificado na suíte completa (331 arquivos). |
| R-010 | O teste de unidade do rastreador ficou `keyRepeat.test.tsx` (não `.ts` como em `tasks.md` T005): precisa do ambiente `dom`. | Nenhum. | Resolvido: `*.test.tsx` já roda no projeto `dom`. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fase 1 (T001) | Baseline da área: 466 passando; só o contrato de memória falhava (por desenho). | — |
| 2026-10-02 | Fase 3 / US1 | `keyRepeat.ts`, prefetch por assinatura síncrona (R-007), reset global; contrato 2/2, +10 testes. | — |
| 2026-10-02 | Fase 4 / US2 | Memória da Live, `onPlayerClosed` (R-008), `forgetLiveSource`; contratos 3/3, +7 testes; `LiveScreen*` 188/188. | — |
| 2026-10-02 | Fase 5 / Polish | E2E novo (3/3 isolado, 26/26 na suíte), `tsc`/build ok, CLAUDE.md e backlog atualizados. | Passada na TV (recomendada). |

**PRÓXIMO**: `/sdd-converge 046-memoria-foco-key-repeat`; a passada na TV física (R-001/SC-006) é recomendada, não bloqueia.

## Arquivos Principais

- `tv-web/src/lib/focus/keyRepeat.ts`, `tv-web/src/features/catalog/catalogApi.ts` (`useCategoryFocusPrefetch`)
- `tv-web/src/features/live/{liveSessionMemory,liveTrail,useLiveCatalog,useLiveKeyboard,useLiveZapping,LiveScreen}.ts(x)`, `tv-web/src/features/import/importApi.ts`, `tv-web/src/setupTests.ts`
- Testes: 3 contratos travados + `keyRepeat.test.tsx`, `catalogApi.key-repeat.test.tsx`, `liveTrail.memoria.test.ts`, `LiveScreen.memoria-foco.test.tsx`, `importApi.forget-live-focus.test.tsx`; E2E `tv-web/e2e/memoria-foco-key-repeat.mjs` (+ fixture `.m3u`, entrada em `run.mjs`).

## Cuidados para Retomada

- O fixture M3U do E2E precisa de grupos com "Canais" no nome: o classificador trata um grupo sem isso como não-canal e a Live fica "Nenhum canal nesta lista".
- Em PowerShell 5.1, `Get-Content`/`Set-Content` corrompem acentos em arquivos UTF-8 sem BOM — editar com Edit/Write ou `[IO.File]::ReadAllText/WriteAllText` com UTF-8 explícito.
- Reset do estado de módulo é global (`setupTests.ts`): um teste novo que dependa de memória de uma etapa anterior do mesmo arquivo precisa montar o estado no próprio teste.

## Resultado Final

**Convergida (2026-10-02)** — `sdd-converge` sem achado acionável: 5/5 contratos verdes e trava íntegra; nenhum atalho no código que os satisfaz; os 16 FR e os 6 SC com evidência (SC-006 e o `repeat` real na TV ficam como passada recomendada, não gate).

**O que foi construído.** (14a) `lib/focus/keyRepeat.ts`: rastreador só de leitura em `window`/captura (seta com `repeat`, `keyup`, outra tecla, `blur`, `visibilitychange` e 300 ms de silêncio encerram a rajada); `useCategoryFocusPrefetch` (assinatura intocada) não agenda nada durante a rajada e rearma o debounce de 300 ms ao estabilizar, sem abortar busca em andamento. (14b) `features/live/liveSessionMemory.ts` (módulo, por lista + entrada, valor = id do canal + índice como dica de vizinho); gravação em `useLiveChannels` só com o canal focado em `items`, fora da busca e com a coluna de canais ativa; restauração em `enterCategory/Favorites/All`; `onPlayerClosed` em `useLiveZapping`; `forgetLiveSource` em `useDeleteSource`; resets globais em `setupTests.ts`. E2E `e2e/memoria-foco-key-repeat.mjs` (na `SUITE`, suíte 26/26).

**Desvios do plano original.** R-007: o prefetch reage por assinatura síncrona (`subscribeKeyRepeatBurst`), não por `fast` nas dependências do efeito. R-008: `onPlayerClosed` só restaura a entrada de origem se o canal não está na lista exibida (evitou regressão em `LiveScreen.test.tsx`; zapping dentro da mesma categoria mantém a lista na categoria). R-010: teste do rastreador é `.tsx`. Nenhum contrato foi emendado.

**Observações de baixa severidade, sem ação.** `useKeyRepeatBurst` (hook) está exportado e testado, mas sem consumidor de produção hoje (a API usada é `isKeyRepeatBurst`/`subscribeKeyRepeatBurst`). FR-013 literal ("trocar de lista descarta") é atendido por chave com `sourceId` + descarte ao excluir. A spec cita "Todos" paginado na Live, o que só existe em Filmes/Séries (R-003). **Segue aberto**: R-001 (a TV entregar `KeyboardEvent.repeat` — sem ele, o comportamento é o debounce anterior) e a passada na TV física.


## Passada física na TV — 2026-10-02

Passada feita na TV QN50Q60DAGXZD (backlog item 58), com o build de 02/10/2026. Resultado relatado pelo usuário: roteiro aprovado, sem pendência aberta por esta verificação. Os riscos de hardware desta feature (`R-xxx` marcados como "só se prova na TV") ficam encerrados por decisão do usuário. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas.
