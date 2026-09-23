# Feature Specification: UserStateRepository

**Slug**: `008-user-state-repo`

**Created**: 2026-09-22

**Status**: Implementada

**Input**: Separação de CatalogRepository e UserStateRepository do backlog (Item 3 da Fase 1).

## Escopo

### Incluído
- Infraestrutura de dados para armazenar o estado do usuário (favoritos, histórico de reprodução e progresso de episódios/filmes).
- Repositório `userStateRepository.ts` isolado interagindo com uma nova coleção Dexie (`userStates`).
- Definição da "Identidade Estável" usando `sourceId + type + originalName` (ou similar) para que os dados do usuário sobrevivam à reimportação do catálogo, mesmo se o provedor alterar o ID de um filme ou canal.
- Testes unitários focados na persistência do estado do usuário e tolerância a trocas de catálogo.

### Fora de Escopo
- Criação visual de botões de UI ("Favoritar", botões de "Retomar Assistindo") nas telas de Filmes e Séries (isso fará parte da tela real de VOD/Séries futuramente).
- Exportação ou importação de backup em arquivo JSON.
- Integração com backend (continua client-first).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guardar o histórico sem risco de apagamento (Priority: P1)

Como usuário, desejo que meu histórico de reprodução (onde parei de ver um filme ou série) seja preservado independentemente de como o catálogo é atualizado em background.

**Why this priority**: É a fundação central que justifica criar um repositório isolado do catálogo volátil.

**Independent Test**: Pode ser totalmente testado via testes unitários que inserem o estado do usuário, apagam o catálogo e validam que o estado persiste e pode ser recuperado usando a chave de identidade estável.

**Acceptance Scenarios**:
1. **Given** um filme foi assistido parcialmente, **When** um novo import do catálogo recria o banco de canais/VODs, **Then** o estado do usuário sobrevive intacto e pode ser lido posteriormente.
2. **Given** um item tem o ID alterado pelo provedor mas mantém o mesmo título original e fonte, **When** o repositório é consultado, **Then** ele ainda retorna o histórico anterior.

### Edge Cases
- O que acontece quando o IndexedDB do navegador é corrompido ou atingir o limite de quota?
- Como o sistema lida com colisões de nomes (ex: dois filmes com o mesmo título exato num mesmo provedor)? (Nesse caso, a identidade pode considerar também o ano de lançamento se estiver disponível nos dados brutos, ou admitir que dividirão o mesmo estado).

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: O sistema DEVE armazenar favoritos, timestamp de onde o vídeo parou, e indicador de 'assistido' separadamente da entidade importada.
- **FR-002**: A chave de identidade do usuário DEVE ser derivada de atributos determinísticos que geralmente não mudam com IDs arbitrários do provedor (ex: `sourceId + type + originalName`).
- **FR-003**: O repositório DEVE prover métodos para setar (upsert) e ler estado a partir do objeto importado.

### Key Entities
- **UserState**: Guarda `stableId` (chave primária), `isFavorite` (boolean), `progressSeconds` (number), `lastWatched` (timestamp), etc.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: Testes automatizados validam a persistência dos estados mesmo quando o catálogo base é destruído ou atualizado.

## Assumptions
- As telas finais de VOD/Séries vão depender desta infraestrutura subjacente.
- Nomes originais de filmes/séries e canais são estáveis o suficiente para serem usados como parte da âncora de identidade.

## Clarifications
- Q: Qual escopo de Interface? → A: Apenas a infraestrutura de dados nesta feature.
- Q: O que usamos como chave composta de identidade? → A: `sourceId + type + originalName`.
- Q: Devemos prever nesta feature um método para exportar os favoritos/histórico? → A: Fora de escopo por enquanto.
