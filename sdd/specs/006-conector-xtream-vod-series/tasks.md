# Tasks: 006-conector-xtream-vod-series

## Phase 1: Data Model & Repositories (Foundation)
- [x] 1. Atualizar `db.ts`: Incrementar versão do Dexie, adicionar índice composto com `kind`, modificar tipos para refletir a estrutura de `CatalogRecord`.
- [x] 2. Ajustar `catalogRepository.ts`: Garantir que as funções `storeBatch`, `listCategories` e `listChannels` respeitem o novo schema (suporte a filtro por `kind`).
- [x] 3. Refatorar `classifier.ts`: Atualizar testes e a tipagem `ClassifiedEntry` para alinhar as propriedades (Stream ID, Series ID) que virão do conector.

## Phase 2: Xtream Connector (Protocol Extension)
- [x] 1. Em `xtreamConnector.ts`, criar definições de tipos para as respostas JSON `XtreamVod` e `XtreamSeries`.
- [x] 2. Implementar `fetchVodCategories` e `fetchVodStreams` e injetá-las no pipeline de conversão nativo `acquireXtreamVod`.
- [x] 3. Implementar `fetchSeriesCategories`, `fetchSeries` e `acquireXtreamSeries`.
- [x] 4. Implementar `fetchSeriesInfo` para consumo estritamente isolado/sob demanda (retornando a árvore completa de episódios).
- [x] 5. Escrever/expandir testes em `xtreamConnector.test.ts` usando respostas JSON simuladas de VOD e Séries.

## Phase 3: Import Pipeline Integration
- [x] 1. Em `importPipeline.ts`, evoluir o fluxo principal para invocar as chamadas de VOD e Séries após o sucesso da importação de canais.
- [x] 2. Alterar o guard clause em `accept()` (que atualmente descarta não-canais) para aceitar os itens e enviá-los para o `pendingBatch`.
- [x] 3. Incluir tratamento *catch* resiliente nas chamadas de VOD/Séries: se retornarem 404/500, logar o erro mas não derrubar a importação dos canais.
- [x] 4. Cobrir com testes em `importPipeline.test.ts` validando salvamento com três tipos e a proteção de OOM via lotes.

## Phase 4: Validation & Release (US3)
- [x] 1. Build da aplicação web (`npm run build`) para o pacote Tizen (`.wgt`).
- [x] 2. Executar a importação de uma lista maciça (painel com dezenas de milhares de VODs) na TV Samsung física de referência.
- [x] 3. Medir e checar o log/uso de memória para confirmar aprovação do Gate de Performance.

---
## Registro da Fase
Fase 1 a 3: Concluídas! O pipeline principal agora importa Canais, Filmes e Séries por streaming paginado do painel, com fetch de episódios on-demand testado e aprovado (101/101 testes). Schema atualizado para v2, índices suportando agrupamento e consultas, e todos os testes (98/98) passando limpo.

---
## Checklist de Release
- [x] Testes unitários de pipeline e repositórios passando perfeitamente.
- [x] Memória testada e não crashou na TV Samsung física.
- [x] Fallback do modo `legacy_m3u` inalterado (continua extraindo os VODs lineares do arquivo m3u se o JSON falhar).

