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
| Contrato 039 | 4/5 verdes (o de conversão é da Fase 3, ainda `not implemented`); trava íntegra |
| Travas das outras features | 23/23 íntegras |
| Conversão do formato antigo (Fase 3) | Não iniciada |
| Medições / E2E / TV | Não iniciados |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Contrato travado da 038 fixava o formato em linhas. | Travaria a 039. | Resolvido: emenda aprovada pelo usuário (2026-09-30), APIs públicas no lugar de escrita direta; trava regravada (038 R-016). |
| R-002 | Metas na TV (300 ms / 60 s / 1 s) medidas só no PC até aqui. | Pode não bastar na TV. | Probe real CPU 4× + gate SC-007; se "Todos" passar de 1 s, cachear o índice agregado por sessão (task ad-hoc). |
| R-003 | A conversão troca o id de cada item uma vez (linha positiva → bloco negativo). | Detalhe aberto/tocando no exato momento pode perder o item na próxima leitura; foco da grade cai no vizinho. | Conversão só com portão aberto (sem player, 2 s sem tecla); estado do usuário é por `stableId`; registrado. |
| R-004 | Colisão de hash de identidade em listas enormes (300 mil itens numa categoria). | Dois itens com o mesmo slot. | Avanço determinístico de slot + reaproveitamento do id anterior na renovação (D-003); teste unitário com colisão forçada. |
| R-005 | "Todos"/busca de uma lista de 300 mil itens junta um tipo inteiro na memória. | Pico de memória. | Já é o comportamento atual; medir no teste de estresse (SC-004); se estourar, busca por blocos em fluxo (task ad-hoc). |
| R-006 | Dez contratos de outras features gravam linhas direto. | Qualquer quebra da leitura de reserva os deixa vermelhos. | D-002; rodar todas as travas a cada fase. |
| R-007 | `storeCategoryItems` passou a ser a mesma escrita de `renewCategoryItems` (bloco com id preservado). Antes apagava e regravava (ids novos) e gravava mesmo com a categoria já removida. | Categoria removida durante a busca não recebe mais itens órfãos; ids estáveis também nesse caminho. | Decidido na Fase 2 (§4 do `logic/`): uma escrita só. Testes não travados que liam `channels` cru ou espionavam `channels.bulkAdd` foram trocados para `storedItems` (`src/testing/catalogStorage.ts`) e `categoryBlocks.put` — o formato mudou por design, a API pública não. |
| R-008 | `Dexie.minKey`/`maxKey` dentro de chave composta dá `DataError` no fake-indexeddb. | Faixas de blocos por fonte quebravam. | Resolvido: faixa explícita (`GENERATION_MIN/MAX`, `KIND_MIN = ''`, `KIND_MAX = '￿'`) em `categoryBlocks.ts`. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-30 | Fases 1–2 | Dexie v14; `categoryBlocks.ts` (identidade, id negativo, `writeBlockWithin`); repositório lê blocos com reserva nas linhas, `findSeriesRecord`, episódios carimbam o bloco, gerações limpam blocos; `loadCategoryContent` numa leitura só; testes não travados adaptados ao formato novo (R-007). | Fase 3: `convertLegacyCategories` + housekeeping. |

**PRÓXIMO**: Fase 3 — T011 `convertLegacyCategories` (§6, preservando `itemsFetchedAt`), T012 housekeeping da pré-carga, T013/T014.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/categoryBlocks.ts` — bloco, identidade, id, escrita, faixas; `convertLegacyCategories` ainda stub.
- `tv-web/src/lib/catalog/catalogRepository.ts` — API pública inalterada, agora sobre blocos + reserva.
- `tv-web/src/lib/catalog/categoryBlocks.test.ts` — testes extras (colisão, nomes repetidos, geração).
- `tv-web/src/testing/catalogStorage.ts` — `storedItems()` para testes que conferem o que foi gravado.
- `tv-web/src/lib/catalog/prefetch/index.ts` — onde entra a conversão (Fase 3).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Teste que confere o que foi gravado não pode ler `database.channels` cru: itens de categoria estão em `categoryBlocks`. Use `storedItems()` de `src/testing/catalogStorage.ts`.
- Para simular falta de espaço na gravação de uma categoria, espione `database.categoryBlocks.put`, não `channels.bulkAdd`.
- Não use `Dexie.minKey`/`maxKey` dentro de chave composta (DataError no fake-indexeddb) — use `KIND_MIN`/`KIND_MAX` e a faixa de geração.
- Vermelhos já conhecidos e fora desta feature: contratos de 034 (`*.fontes-estado.contract.*`) e 036 (`historyRemoval…`) — ainda não executadas/outra sessão.
