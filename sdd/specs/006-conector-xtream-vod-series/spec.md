# Feature Specification: Conector Xtream: fatia de VOD e séries pelo mesmo protocolo

**Slug**: `006-conector-xtream-vod-series`

**Created**: 2026-09-22

**Status**: Draft

**Input**: Backlog Fase 0, item 1 (Dívidas abertas da fundação pós-ADR-008 e feature 005).

## Escopo

### Incluído
- **Extensão do protocolo no cliente**: Adicionar `get_vod_streams`, `get_series` e `get_series_info` ao `xtreamConnector.ts`.
- **Classificação**: Estender o `classifier.ts` para processar VOD e séries vindos do painel (hoje ele só classifica canais e descarta o resto).
- **Armazenamento (Dexie v2)**: Atualizar `catalogRepository.ts` e `db.ts` para gravar VOD e séries, incluindo os índices compostos (ex: por tipo/categoria) necessários para leitura paginada.
- **Pipeline de importação**: Adaptar o `importPipeline.ts` para orquestrar a gravação dos três tipos, mantendo o fluxo por partes (D-002 da feature 005).
- **Testes unitários**: Cobertura do novo protocolo contra fixtures.
- **Gate de Performance (TV física)**: Medir e registrar o impacto no IndexedDB e no tempo de importação com o novo volume (que salta de ~2,3 mil canais para ~321 mil itens totais).

### Fora de Escopo
- Telas de listagem ou detalhes de Filmes e Séries (foco aqui é apenas motor e banco de dados; as telas são Fase 1).
- Integração com TMDB, favoritos e histórico (features futuras).
- Alterações no backend Python (congelado pela D-007).
- Suporte a VOD/Séries via arquivo M3U local (o foco é habilitar a funcionalidade JSON da Xtream API).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar catálogo de filmes e séries sem estourar memória (Priority: P1)
Como motor de importação, quero baixar e gravar a lista de filmes (VOD) e o índice de séries (Series) do provedor em lotes, para que as futuras telas tenham dados locais sem travar a TV.

**Why this priority**: É a fundação para VOD/Séries. Diferente do M3U que é interpretado em fluxo linha a linha, o protocolo JSON retorna arrays massivos que podem estourar a memória (Chromium 108 da TV) durante o `JSON.parse`. Garantir que isso seja bem tolerado é crítico.
**Independent Test**: Executar a importação contra um provedor com +100k filmes na TV. Conectar via DevTools e verificar se o IndexedDB contém os registros classificados e se o uso de memória não causou encerramento do app.
**Acceptance Scenarios**:
1. **Given** um painel Xtream autenticado, **When** a importação roda, **Then** `get_vod_streams` e `get_series` são chamados.
2. **Given** respostas JSON gigantes, **When** processadas, **Then** o pipeline não trava a thread principal e grava os itens no banco com categorias preservadas.

### User Story 2 - Obter informações estruturadas de uma série sob demanda (Priority: P1)
Como repositório, preciso consultar temporadas e episódios de uma série específica via `get_series_info` preservando sua hierarquia.

**Why this priority**: Obter informações de episódios de *todas* as séries durante a importação principal geraria milhares de requests, inviabilizando o tempo de importação que hoje é de 10 segundos. Essa consulta tem de ser independente.
**Independent Test**: Invocar o conector com um ID de série existente e verificar se retorna temporadas e episódios estruturados.
**Acceptance Scenarios**:
1. **Given** o ID de uma série, **When** solicitado via conector, **Then** ele retorna a árvore de temporadas e episódios com as chaves corretas vinculando-os à série raiz.

### Edge Cases
- **Falta de espaço no aparelho (QuotaExceededError)**: O salto de volume aumenta a chance de estourar o limite rígido persistente. O pipeline deve capturar graciosamente (FR-018 existente) mantendo o catálogo funcional.
- **Painel Legacy**: Se as rotas JSON de VOD/Séries responderem com erro ou não existirem, a importação não deve falhar por inteiro; deve preservar o que conseguiu (ou assumir o modo limitado `legacy_m3u` como já existe).

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: O sistema DEVE extrair categorias e índices de VOD e Séries via protocolo JSON.
- **FR-002**: O sistema DEVE suportar a consulta de detalhes de uma série (`get_series_info`) de forma isolada, não como um passo obstrutivo do fluxo principal de importação.
- **FR-003**: O schema Dexie (v2) DEVE diferenciar `channel`, `movie`, `series` e `episode`, suportando paginação (ex: índice composto por `sourceId+generation+kind+groupOrder`).
- **FR-004**: O pipeline DEVE continuar utilizando gravação em lote para não bloquear a renderização (D-002).

### Key Entities
- **CatalogRecord**: Uma unificação ou evolução do atual `ChannelRecord` para abrigar a propriedade `kind` (`channel`, `movie`, `series`, `episode`). Se `kind` for episódio, conterá metadados extras (`seriesId`, `seasonNumber`, `episodeNumber`).

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: O banco local armazena Canais, VOD e Séries com seus grupos preservados via protocolo JSON.
- **SC-002**: O tempo de importação total e o pico de memória na TV física são medidos, registrados, e o app não trava.
- **SC-003**: A chamada legada M3U continua funcionando perfeitamente (fallback inalterado).

## Clarifications
- **Carga de episódios (Decisão Antecipada)**: Por padrão, a importação JSON principal NÃO disparará `get_series_info` para cada série. Ela trará apenas o índice (`get_series`). Os episódios serão obtidos posteriormente (sob demanda ao abrir a tela da série ou em background secundário). Tentar varrer todos os episódios no import inflacionaria os 10s atuais para vários minutos. Isso deverá ser ratificado na etapa `sdd-plan`.

