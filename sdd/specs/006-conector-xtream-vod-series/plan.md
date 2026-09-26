# Implementation Plan: Conector Xtream VOD e Séries

## Summary
Expansão do motor de importação client-first para suportar os endpoints JSON de VOD e Séries (`get_vod_streams`, `get_series`, `get_series_info`) da Xtream API. O catálogo local no IndexedDB será unificado para comportar filmes e séries localmente. Os dados de temporadas e episódios (`get_series_info`) serão obtidos e cacheados estritamente sob demanda para não penalizar a importação principal, e o pipeline protegerá a memória (OOM) no parsing dos arrays JSON massivos.

## Technical Context
- **Stack**: TypeScript, React, IndexedDB (Dexie).
- **Ambiente**: Navegador de Smart TV (Chromium 108 no Tizen 8).
- **Testes**: Vitest para as lógicas de protocolo e classificação.

## Decisões Invariantes
- **I-001 (Sob Demanda)**: A importação principal buscará apenas o índice de séries (`get_series`). As informações de temporadas e episódios (`get_series_info`) NÃO serão requisitadas durante a importação para evitar *rate limit* e travamentos.
- **I-002 (Preservação de Memória)**: Arrays massivos recebidos no `fetch().json()` (ex: 100 mil filmes) serão processados em lotes assim que convertidos, para evitar estourar o limite de transação (`bulkAdd`) do IndexedDB e mitigar lags na UI.
- **I-003 (Tolerância a Falhas em VOD/Séries)**: Se os novos endpoints de VOD ou Séries falharem em provedores não totalmente compatíveis, o conector garantirá o salvamento dos Canais já processados sem abortar a importação inteira.

## Constitution Check
- **Nenhum backend**: O protocolo será consumido direto do aparelho (bypass CORS já resolvido na feature 005).
- **IA e Classificação Nunca Inventam Dados**: O classificador será atualizado para mapear dados determinísticos do JSON e cairá para a tag "unclassified" quando não puder assegurar o tipo.
- **Armazenamento Seguro**: Nenhuma credencial será salva no IndexedDB além do que já foi consolidado pela ADR-008.
- **Performance / Memory Gate**: Respeitado por meio do `batchSize` no loop do pipeline.

## Project Structure
- `tv-web/src/lib/catalog/db.ts`: Bump de versão no Dexie, definição do `CatalogItemKind`, adição de índice composto.
- `tv-web/src/lib/catalog/catalogRepository.ts`: Adaptação do `storeBatch`, novas funções para consulta paginada com filtro de `kind`.
- `tv-web/src/lib/catalog/xtreamConnector.ts`: Assinatura e implementação de `fetchVodStreams`, `fetchSeries` e `fetchSeriesInfo`.
- `tv-web/src/lib/catalog/classifier.ts`: Evolução do mapping das respostas JSON pro novo esquema.
- `tv-web/src/lib/catalog/importPipeline.ts`: Chamada sequencial e tratamento de falhas leves (para manter fallback M3U funcional).

## Estratégia de Testes
- Adicionar fixtures estáticas no `xtreamConnector.test.ts` simulando arrays de VOD e as respostas aninhadas de `get_series_info`.
- Mockar exceções (`QuotaExceededError`) no `importPipeline.test.ts` ao inserir um lote VOD.
- Verificação *obrigatória* em TV física antes do fechamento desta feature.

## Estado Atual
Fase 3 completa. Pipeline atualizado para extrair e armazenar VOD e Séries, respeitando lotes e resiliente a falhas parciais.

## Arquivos Principais
*(Preenchido durante o sdd-execute)*

## Execution Notes
| Data | Fase | Resumo | Pendência |
|---|---|---|---|

**PRÓXIMO:** Iniciar a execução.

## Riscos e Decisões
| ID | Risco/Decisão | Status |
|---|---|---|
| R-001 | O `JSON.parse` travando a aba do Tizen em arrays gigantes. | Aberto |
| R-002 | `get_series_info` como requisição paralela e cache assíncrono. | Decidido |

## Cuidados para Retomada
*(Preenchido durante o sdd-execute)*

\n\n## Resultado Final\nAs tarefas foram implementadas com sucesso. A pipeline importa categorias e streams de VOD e Series. Os players suportam VOD perfeitamente. Adicionamos validação no stream_type (movie e live) para contornar sujeira em painéis Xtream baratos que misturam conteúdos, resolvendo o bug reportado em tela.\n