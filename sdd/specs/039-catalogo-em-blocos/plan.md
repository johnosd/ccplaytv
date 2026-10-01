# Implementation Plan: Catálogo em blocos por categoria — leitura e gravação instantâneas

**Slug**: `039-catalogo-em-blocos` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/039-catalogo-em-blocos/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Os itens de cada categoria (canais, filmes, séries; Xtream e M3U) passam a ser
guardados num **bloco** — um registro por categoria na tabela nova
`categoryBlocks` (Dexie v14) —, gravado e lido de uma vez (medido na 038:
~25× mais rápido para gravar e ~5× para ler uma categoria de 11 mil itens).
Cada item ganha um **id numérico negativo** que codifica a categoria e a
identidade estável (`s:`/`p:`/`n:`), estável na renovação — o resto do app
continua usando `getChannel(id)`, `Number(itemId)` e `CatalogItemOut.id`
sem mudar. As funções públicas de `catalogRepository.ts` mantêm nome e
assinatura e passam a ler **bloco primeiro, formato antigo (linhas em
`channels`) como reserva** — o que mantém verdes os dez testes travados de
outras features que semeiam linhas diretamente e garante que nada fique
vazio durante a conversão. Uma conversão em segundo plano (mesmo portão da
pré-carga) transforma as listas já guardadas em blocos, uma categoria por
vez, sem tocar em favoritos/progresso/histórico (que são por `stableId`).
Episódios continuam linhas.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite (build `chrome108`).

**Primary Dependencies**: Dexie 4.4.6 (IndexedDB), `@tanstack/react-query`; nada novo.

**Storage**: IndexedDB — **v13 → v14** (tabela `categoryBlocks`); `channels`
mantida (episódios + formato antigo + `storeBatch` legado).

**Testing**: Vitest (CatalogDb real por teste), Playwright via `e2e/*.mjs`
(painel falso), probes com a lista real do `.env` (fora do `test:e2e`).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120).

**Performance Goals**: SC-001 ≤ 300 ms abrir categoria (inclusive 11 mil
itens); SC-002 ≤ 60 s catálogo inteiro (~43 mil itens); SC-003 "Todos" de
Filmes ≤ 1 s; SC-004 ~300 mil itens sem o app fechar.

**Constraints**: constitution 1.7.0; 10 contratos travados de outras features
gravam em `channels` diretamente (D-002); nenhuma mudança visual (FR-007).

**Scale/Scope**: lista de referência 2.266 canais / 31.432 filmes / 9.667
séries; teste de estresse ~300 mil itens.

## Decisões Invariantes

- **D-001 — Um bloco por categoria**, chave `categoryId`; escrever substitui o
  bloco inteiro numa transação (FR-002).
- **D-002 — API pública do repositório inalterada** (nomes/assinaturas); leitura
  **bloco primeiro, linhas antigas como reserva**; uma categoria é *ou* bloco
  *ou* linhas (escrever o bloco apaga as linhas dela na mesma transação).
- **D-003 — Id de item de bloco = `-(categoryId × 2^32 + slot)`**, `slot` = FNV-1a
  32 bits da identidade, colisão resolvida por avanço na ordem da fonte;
  renovação reaproveita o id anterior da mesma identidade (`logic/…` §3).
- **D-004 — Identidade** `s:<seriesId>` / `p:<providerStreamId>` / `n:<originalName>`,
  nunca URL/posição (constitution: Identidade Não Depende da URL).
- **D-005 — Episódios continuam em `channels`**; a marca `episodesFetchedAt` do
  item-série vai para o item dentro do bloco quando o id é negativo.
- **D-006 — Conversão em partes pela pré-carga** (`housekeeping`, 1 categoria
  por chamada, mesmo portão), preservando `itemsFetchedAt`.
- **D-007 — Varreduras leem um bloco por vez** (FR-013); só `listAllOfKind`
  junta um tipo inteiro (já é o que "Todos"/busca mostram).
- **D-008 — `storeBatch` (eager legado) não muda.**

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não toca conta. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Blocos guardam os mesmos campos de hoje (ADR-010 já cobre URL de reprodução M3U no aparelho); nenhum log novo. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Ordem e nomes vêm da fonte; bloco guarda a ordem declarada. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Contagem = itens no bloco. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Leitura só local. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | `titleMetadata` por `stableId`, intocada. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Nada muda na UI. |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não toca classificação. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | UI inalterada. |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Id estável na renovação (D-003); a **conversão** troca o id uma vez (positivo → negativo) — foco é reconciliado por id com fallback ao vizinho (038), R-003. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Identidade `s:/p:/n:`; `stableId` do usuário intocado; conversão não reatribui estado. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Nada de progresso novo. |
| Documentação É Canônica | ✅ | ✅ | Emenda do contrato da 038 registrada (R-001 aqui, R-016 lá); CLAUDE.md no Polish. |

ADRs: coerente com ADR-002 (catálogo local é a verdade), ADR-008, ADR-010.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/039-catalogo-em-blocos/
├── spec.md
├── plan.md
├── data-model.md
├── quickstart.md
├── logic/blocos-e-identidade.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e/catalogo-em-blocos.mjs            # NOVO (painel falso; migração; ~300 mil itens)
├── package.json                          # test:e2e ganha o roteiro novo
└── src/lib/
    ├── catalog/
    │   ├── db.ts                         # v14: categoryBlocks
    │   ├── categoryBlocks.ts             # NOVO: id/identidade, writeBlock, leitura, conversão
    │   ├── catalogRepository.ts          # funções públicas delegam aos blocos + reserva
    │   ├── homeHero.ts                   # série-pai via findSeriesRecord
    │   └── prefetch/index.ts             # housekeeping: conversão antes da limpeza
    └── (sem mudança de assinatura em catalogSearch, globalSearch, history, localTitleMatch, playbackUrl, seriesLoader, titleMetadata)
```

**Structure Decision**: tudo em `tv-web/src/lib/catalog/`; telas não mudam
(D-002). `CCPlayTv/` só pelo `build:tizen` (nenhum arquivo emitido novo).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Dois formatos lidos ao mesmo tempo (bloco + linhas antigas) | Conversão sem lista vazia (FR-009) e 10 contratos travados de outras features que gravam linhas direto | Converter tudo no upgrade do Dexie: travaria a TV no primeiro boot (é o gargalo de escrita que se quer evitar); reescrever os 10 contratos: fora do escopo e exige aprovação de cada feature. |

## Estratégia de Testes

Prioridade: unitário (id/identidade/colisão) → contrato/integração
(`CatalogDb` real) → E2E (painel falso) → probes com a lista real → TV.

```powershell
cd tv-web
npx vitest run <arquivo>
npm run test
npx tsc -b; npm run lint; npm run build:tizen
npm run test:e2e          # dev server reiniciado
```

### Testes de Contrato

Arquivo travado: `tv-web/src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts`

Comando (em `tv-web/`): `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 039-catalogo-em-blocos`

| Teste | Origem | Fase | Vermelho esperado |
| --- | --- | --- | --- |
| `grava a categoria como um bloco, com id estável por identidade e sem linha por item` | FR-001/002/003, US1 | Fase 2 | `AssertionError: expected 3 to be +0` (linhas em `channels`) |
| `episódios continuam por série e a marca de obtenção da série sobrevive à renovação do bloco` | FR-004, edge detalhe renovado | Fase 2 | `Error: not implemented` (`categoryIdOfBlockItem`) |
| `converte o formato antigo em partes, sem perder itens nem favoritos, e sem refazer` | US4, FR-008..011 | Fase 3 | `Error: not implemented` (`convertLegacyCategories`) |
| `varreduras de um tipo leem blocos e formato antigo juntos, sem duplicar` | FR-006 | Fase 2 | `AssertionError: expected 2 to be 1` |
| `categoria removida numa atualização some com o bloco; a mantida continua servindo` | FR-002 + 038 FR-028 | Fase 2 | `Error: not implemented` |

Emenda aprovada no contrato da 038 (`catalogRepository.carga-listas.contract.test.ts`):
passa a gravar `episodesFetchedAt` por `storeSeriesEpisodes` e ler por
`getChannel` — verde nos dois formatos; trava da 038 regravada (R-001).

Stubs: `tv-web/src/lib/catalog/categoryBlocks.ts` (`BLOCK_ID_SPACE`,
`blockItemId`, `categoryIdOfBlockItem`, `convertLegacyCategories` — lançam
`not implemented`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Dexie v14, `categoryBlocks`) | Concluída |
| Fase 2 (blocos, identidade, leitura com reserva) | Concluída — toda escrita de itens de categoria vai para bloco; leituras públicas acham blocos e, na falta, linhas |
| Contrato 039 | 5/5 verdes; trava íntegra |
| Travas das outras features | 23/23 íntegras |
| Conversão do formato antigo (Fase 3) | Concluída — `convertLegacyCategories` na housekeeping da pré-carga, 1 categoria por vez, avisando a tela |
| E2E `e2e/catalogo-em-blocos.mjs` | Cenários 1 (lista nova) e 2 (migração) verdes; cenário 3 (300 mil, opt-in `CCPLAY_E2E_ESTRESSE`) verde; ainda fora do `test:e2e` (T023) |
| Fase 6 (US5) | Concluída — 300 mil sem quebrar; "Todos" aos poucos: abre em 155 ms com ~17 MB (antes 959 ms / ~217 MB); Worker da carga ~123–132 MB mantido |
| Medições no PC (Fase 4) | Build de produção, CPU 4×: catálogo inteiro 9,5 s (SC-002 ✅); canais 142–260 ms; categoria de 11 mil filmes 365–464 ms depois da T028 (antes 455–536; SC-001 ≤ 300 ❌ no PC); "Todos" de Filmes 790–1.006 ms (SC-003 no limite) — R-009; T028 fechada por decisão do usuário, SC-001 vai para a TV |
| Fase 4 (US1/US2) | Concluída |
| Fase 5 (US3) | Concluída — índice de busca sob demanda + cache por item na busca; "Continuar assistindo" em lote; ★/↺/Semelhantes iguais antes/depois da conversão (teste de integração). "Todos" de Filmes 677–920 ms (SC-003 ✅ no PC) |
| TV | Não iniciada (gate SC-007, T026) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Contrato travado da 038 fixava o formato em linhas. | Travaria a 039. | Resolvido: emenda aprovada pelo usuário (2026-09-30), APIs públicas no lugar de escrita direta; trava regravada (038 R-016). |
| R-002 | Metas na TV (300 ms / 60 s / 1 s) medidas só no PC até aqui. | Pode não bastar na TV. | Probe real CPU 4× + gate SC-007; se "Todos" passar de 1 s, cachear o índice agregado por sessão (task ad-hoc). **Medido (2026-09-30, `e2e/catalogo-em-blocos-real.mjs`, build de produção, CPU 4×)**: catálogo inteiro 9,5–9,6 s; 11.131 filmes 653–907 ms; "Todos" 939–1.073 ms; canais 142–260 ms. Ver R-009. |
| R-003 | A conversão troca o id de cada item uma vez (linha positiva → bloco negativo). | Detalhe aberto/tocando no exato momento pode perder o item na próxima leitura; foco da grade cai no vizinho. | Conversão só com portão aberto (sem player, 2 s sem tecla); estado do usuário é por `stableId`; registrado. |
| R-004 | Colisão de hash de identidade em listas enormes (300 mil itens numa categoria). | Dois itens com o mesmo slot. | Avanço determinístico de slot + reaproveitamento do id anterior na renovação (D-003); teste unitário com colisão forçada. |
| R-005 | "Todos"/busca de uma lista de 300 mil itens junta um tipo inteiro na memória. | Pico de memória. | Já é o comportamento atual; medir no teste de estresse (SC-004); se estourar, busca por blocos em fluxo (task ad-hoc). **Medido (2026-09-30, cenário 3, 300 mil filmes, produção)**: "Todos" pico de heap da página ~217 MB (hoje o tipo fica em até 3 cópias: blocos desserializados → `CatalogRecord` → entradas do índice → `CatalogItemOut`); carga: Worker ~123 MB (seção inteira em `groups`) + página 46 MB. Nada quebrou. Resolvido (T022, opção do usuário): "Todos" lê aos poucos (`readKindPage` + `useAggregatedItems({ progressive })`) — estresse 300 mil: abrir 959 → 155 ms, heap ~217 → ~17 MB (~45 MB após 300 fileiras). Worker da carga (~123–132 MB) mantido. |
| R-006 | Dez contratos de outras features gravam linhas direto. | Qualquer quebra da leitura de reserva os deixa vermelhos. | D-002; rodar todas as travas a cada fase. |
| R-007 | `storeCategoryItems` passou a ser a mesma escrita de `renewCategoryItems` (bloco com id preservado). Antes apagava e regravava (ids novos) e gravava mesmo com a categoria já removida. | Categoria removida durante a busca não recebe mais itens órfãos; ids estáveis também nesse caminho. | Decidido na Fase 2 (§4 do `logic/`): uma escrita só. Testes não travados que liam `channels` cru ou espionavam `channels.bulkAdd` foram trocados para `storedItems` (`src/testing/catalogStorage.ts`) e `categoryBlocks.put` — o formato mudou por design, a API pública não. |
| R-008 | `Dexie.minKey`/`maxKey` dentro de chave composta dá `DataError` no fake-indexeddb. | Faixas de blocos por fonte quebravam. | Resolvido: faixa explícita (`GENERATION_MIN/MAX`, `KIND_MIN = ''`, `KIND_MAX = '￿'`) em `categoryBlocks.ts`. |
| R-013 | FR-013 (convergência, T031): busca global, buscar/ordenar em "Todos" e o Worker da carga por seção mantinham um tipo/seção inteiro na memória. | Pico de memória na TV com listas enormes. | Resolvido (decisão do usuário, 2026-09-30): FR-013 **emendado** para aceitar busca e ordenação (ações pontuais pedidas pela pessoa); o Worker passou a descarregar numa área de preparo (Dexie **v15**, `sectionStaging`) a cada 20 mil itens e a gravar uma categoria por vez (`stageSectionItems`/`stagedItemsOf`/`clearStagedItems`; sobra de carga interrompida apagada no começo da próxima e em falha). Estresse 300 mil (produção): pico do Worker **~123–132 → 50–70 MB**, carga 5–6 → 10 s; lista real CPU 4×: catálogo inteiro 9,7–12,8 s (antes 9,5–14 s). |
| R-012 | Desvio aprovado pelo usuário em 2026-09-30 ("corrigir agora todos erros e bugs"): defeitos anteriores à 039 corrigidos aqui — roteiro `paridade-limpeza.mjs` (passo desatualizado desde a 032; data da sincronização deslocando a linha) e 7 testes instáveis antigos (`*Screen.favorites`, `LiveScreen.favorites` b/l/n, `HomeContent`, `LiveScreen` T010). | Escopo da 039 maior que o planejado; nenhuma mudança no app. | Resolvido: causas identificadas (aviso de favorito depois de gravação assíncrona; teste pesado com limite de 5 s; captura dependente de data) e corrigidas nos testes/roteiro; nenhum contrato travado tocado. |
| R-011 | "Todos" aos poucos (T022, escolha do usuário em 2026-09-30): na ordem da fonte só as categorias até onde a pessoa desceu ficam na memória; ordenar e buscar leem o tipo inteiro. As opções do modal "Ordenar" (`availableSortOptions`) passam a ser calculadas sobre o que já foi lido — se as primeiras categorias não declaram ano/data de inclusão e as seguintes sim, "Ano"/"Recém-adicionados" podem não aparecer até descer. A 1ª tecla da busca em "Todos" inclui ler o tipo inteiro (~1 s com CPU 4× na lista real). | Opção de ordenação escondida num caso raro; 1ª busca um pouco mais lenta. | Aceito; registrado. Se incomodar: calcular a disponibilidade de ordenação no repositório (uma varredura leve só dos campos `year`/`addedAt`) ou pré-ler o índice ao focar "Pesquisar". |
| R-010 | `loadSeriesHistory` (↺ Histórico de Séries) resolve episódio e série-pai um por vez — cada série pode varrer os blocos de séries (mesmo padrão que a T019 tirou de "Continuar assistindo"). | Histórico de séries com muitos itens pode demorar. | Aberto, fora das tasks (achado na Fase 5); não medido. Se a TV mostrar lentidão em ↺ de Séries, reusar `resolveStableIdsIn`/`findSeriesManyIn`. |
| R-009 | Abrir a categoria de 11 mil filmes custa 653–907 ms no PC com CPU 4× (build de produção); a meta SC-001 é ≤ 300 ms. Com CPU 1×: 102 ms. A leitura do bloco não é o gargalo (038: 0,12–0,19 s): ~300–400 ms vão de OK até a leitura e ~350–500 ms da leitura à pintura. O custo é proporcional ao nº de itens (dois mapeamentos por item — bloco → `CatalogRecord` → `CatalogItemOut` —, medição de 11 mil posições no virtualizador); nenhum sort/filtro roda com a busca fechada. "Todos" de Filmes (939–1.073 ms) está no limite de SC-003. | SC-001 pode falhar na TV para as categorias muito grandes; as de até ~3,5 mil itens ficam em 191–413 ms. | Aberto. Usuário escolheu atacar agora (T028, 2026-09-30). Feito: leitura direta do bloco (`getActiveCategoryBlock` + `blockItemOut`) → 11 mil filmes 365–464 ms (antes 455–536, medidos sem o custo da 1ª montagem). Descartados com medição: leitura iniciada no OK (sem ganho) e bloco como string JSON (~0–30 ms). Layout não cresce com o nº de itens (~0,5 ms). O que resta crescendo com o tamanho é desserializar o bloco (~+150 ms para 11 mil) — cortar exige mudar o formato (itens enxutos ou "cabeça" do bloco). **Decisão do usuário (2026-09-30): parar aqui e medir na TV** (T026, SC-001); se a TV não bater 300 ms, a "cabeça" do bloco é o caminho que garante a meta. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-30 | Fases 1–2 | Dexie v14; `categoryBlocks.ts` (identidade, id negativo, `writeBlockWithin`); repositório lê blocos com reserva nas linhas, `findSeriesRecord`, episódios carimbam o bloco, gerações limpam blocos; `loadCategoryContent` numa leitura só; testes não travados adaptados ao formato novo (R-007). | Fase 3: `convertLegacyCategories` + housekeeping. |
| 2026-09-30 | Fase 3 (US4) | Conversão em partes na housekeeping (conversão antes da limpeza de gerações), `onConverted` avisa a tela; testes de interrupção/retomada; E2E cenário 2 semeando o formato antigo no IndexedDB do app → 10/10. | Fase 4: E2E cenário 1 e medições com a lista real. |

| 2026-09-30 | Fase 4 (US1/US2) | E2E cenário 1 (lista nova só com blocos, navegação completa, série com episódios em linhas) → 27/27 com o cenário 2, duas rodadas; probe real `catalogo-em-blocos-real.mjs` (CPU N×, build de produção, perfil opcional): catálogo inteiro 9,5 s (antes 17,1 s), 11 mil filmes 653–907 ms, "Todos" 939–1.073 ms. T017 não se aplicou (o total melhorou). | R-009: SC-001 não bate no PC CPU 4× para a categoria de 11 mil — decisão do usuário. |

| 2026-09-30 | Fase 4 — T028 (ad-hoc, R-009) | Leitura direta do bloco na entrada (−~90 ms na categoria de 11 mil: 365–464 ms, CPU 4×); leitura no OK e bloco-JSON medidos e descartados; layout não escala com n. Probe ganhou `CCPLAY_USER_DATA` (reaproveita a lista), `CCPLAY_TRACE`, `CCPLAY_BIGGEST_LAST`, `CCPLAY_LAYOUT`. | Custo restante é a desserialização do bloco — decisão do usuário sobre mudar o formato. |

| 2026-09-30 | Fase 4 fechada | Usuário escolheu parar a T028 e medir na TV; Fase 4 concluída. | SC-001 da categoria de 11 mil fica para o gate da TV (T026). |

| 2026-09-30 | Fase 5 (US3) | "Todos": índice normaliza sob demanda (−~150 ms); busca guarda nome normalizado por item + `Intl.Collator`; `resolveContinueWatching` em lote (`resolveStableIdsIn`, `findSeriesManyIn`); teste de integração ★/↺/Semelhantes antes × depois da conversão. "Todos" 677–920 ms, busca 172–271 ms/tecla (CPU 4×). | R-010 (↺ de Séries um por vez) aberto; Fase 6. |

| 2026-09-30 | Fase 6 — T021 | Cenário 3 (300 mil filmes, painel falso em fluxo, heap da página e do Worker por CDP), opt-in por `CCPLAY_E2E_ESTRESSE`: carga 6 s sem quebrar; Worker ~123 MB, página 46 MB; "Todos" 959 ms com ~217 MB de heap. | T022: orçamento de memória — decisão do usuário. |

| 2026-09-30 | Fase 6 — T022 | Usuário escolheu "Todos" aos poucos: `readKindPage`, `useAggregatedItems({ progressive })`, página seguinte a 10 fileiras do fim ou até achar o item a restaurar; ordenar/buscar leem o tipo inteiro. 300 mil: 155 ms / ~17 MB ao abrir; lista real CPU 4×: 242–317 ms. | R-011 (ordenação calculada sobre o lido; 1ª busca ~1 s). Fase 7. |

| 2026-09-30 | Fase 7 — T023/T024/T027 | `test:e2e` com o roteiro da 039 (20/20 verdes); tsc/lint/`build:tizen` limpos; `npm run test` 1968/1983 (só vermelhos já conhecidos); 23 travas íntegras; `CLAUDE.md` atualizado. T025 travada: `paridade-limpeza.mjs` (da 028) desatualizado desde a 032. | Decidir T025; gate na TV (T026). |

**PRÓXIMO**: T025 (decisão: atualizar o passo "Integrações" do roteiro de paridade da 028 ou registrar e seguir) e T026 — gate na TV física (tabela do `quickstart.md`, inclusive a migração: instalar o build anterior, usar, instalar este por cima).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/catalogo-em-blocos-real.mjs` — medição com a lista real (CPU N×; `CCPLAY_APP_URL`, `CCPLAY_USER_DATA`, `CCPLAY_PROFILE`, `CCPLAY_PROFILE_ALL`, `CCPLAY_TRACE`, `CCPLAY_BIGGEST_LAST`, `CCPLAY_LAYOUT`); mede também a busca por tecla em "Todos". O cenário 3 (~300 mil, Fase 6) entra em `e2e/catalogo-em-blocos.mjs`.
- `tv-web/src/lib/catalog/catalogSearch.ts` — índice sob demanda e cache de normalização na busca (T018).
- `tv-web/src/lib/catalog/catalogRepository.ts` — `resolveStableIdsIn`/`findSeriesManyIn` (T019), `getActiveCategoryBlock` (T028).
- `tv-web/src/lib/catalog/categoryBlocks.conversao-leitores.test.ts` — ★/↺/Semelhantes antes × depois da conversão (T020).
- `tv-web/src/lib/catalog/catalogRepository.ts` (`getActiveCategoryBlock`) e `tv-web/src/features/catalog/catalogApi.ts` (`loadCategoryContent`, `blockItemOut`) — leitura direta do bloco (T028).
- `tv-web/e2e/catalogo-em-blocos.mjs` — cenários 1 (lista nova) e 2 (migração); o 3 (~300 mil) entra na Fase 6.
- `tv-web/src/features/catalog/catalogApi.ts` (`loadCategoryContent`, `toItemOut`) e `tv-web/src/features/vod/VodCatalogScreen.tsx` — onde está o custo restante de abrir 11 mil itens (R-009).
- `tv-web/src/lib/catalog/categoryBlocks.ts` — bloco, identidade, id, escrita, faixas, `convertLegacyCategories`.
- `tv-web/src/lib/catalog/catalogRepository.ts` — API pública inalterada, agora sobre blocos + reserva.
- `tv-web/src/lib/catalog/categoryBlocks.test.ts` — testes extras (colisão, nomes repetidos, geração).
- `tv-web/src/testing/catalogStorage.ts` — `storedItems()` para testes que conferem o que foi gravado.
- `tv-web/src/lib/catalog/prefetch/index.ts` — onde entra a conversão (Fase 3).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Teste que confere o que foi gravado não pode ler `database.channels` cru: itens de categoria estão em `categoryBlocks`. Use `storedItems()` de `src/testing/catalogStorage.ts`.
- Para simular falta de espaço na gravação de uma categoria, espione `database.categoryBlocks.put`, não `channels.bulkAdd`.
- Não use `Dexie.minKey`/`maxKey` dentro de chave composta (DataError no fake-indexeddb) — use `KIND_MIN`/`KIND_MAX` e a faixa de geração.
- Medir desempenho no **build de produção** (`npm run build; npx vite preview --port 4173`, `CCPLAY_APP_URL=http://localhost:4173`): o React do dev server infla a pintura ~2×. O dev server só serve para o perfil com nomes legíveis.
- Para iterar medições sem reimportar (o painel limita): `CCPLAY_USER_DATA=<pasta>` no probe; a pasta vale por origem (4173 ≠ 5173). Use `CCPLAY_BIGGEST_LAST=1` — a 1ª entrada da sessão custa ~150 ms a mais em qualquer categoria e mascara o efeito do tamanho. Variação entre rodadas é de ±80 ms: compare 3 rodadas, nunca uma.
- `paridade-limpeza.mjs` grava por padrão nas evidências da **028**. Para a 039, sempre `CCPLAY_PARIDADE_DIR=…\sdd\specs\039-catalogo-em-blocos\evidencias\paridade` **no mesmo comando** (cada chamada de PowerShell é um processo novo — a variável não persiste). A linha de base "antes" é o código pré-039 (commit 06a2304) servido de uma worktree em :5173.
- Em E2E, nunca `page.route('**/series/**')`/`'**/movie/**'` genérico: casa com os módulos do Vite (`src/features/series/…`) e o `page.goto` trava. Filtrar pelo host do painel falso.
- O painel real recusa importações seguidas (limite de frequência): a tela mostra "Status: Falhou … Requer uso do servidor". Esperar ~90 s e repetir, sem concluir que o app travou.
- Vermelhos já conhecidos e fora desta feature: contratos de 034 (`*.fontes-estado.contract.*`) e 036 (`historyRemoval…`) — ainda não executadas/outra sessão.
