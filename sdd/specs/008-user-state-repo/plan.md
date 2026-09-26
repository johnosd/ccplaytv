# Implementation Plan: UserStateRepository

**Slug**: `008-user-state-repo`

## Summary
Criação do repositório `userStateRepository.ts` isolado no Dexie (`userStates`) para persistir o histórico e favoritos dos usuários de forma segura contra reimportações voláteis do catálogo.

## Technical Context
- **Linguagem**: TypeScript.
- **Armazenamento**: IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`).
- **Padrões Existentes**: Repositórios separam as entidades do Dexie das telas. As chaves devem ser estáveis (sourceId + type + originalName) para sobreviver à recriação do catálogo.


## Requisitos Derivados das Referências (docs/iptvnator, docs/guia-praticas-app-tv, docs/design)
A arquitetura do UserStateRepository deve se alinhar com as práticas recomendadas de TV:
1. **Favoritos Globais vs Locais**: (ref: docs/iptvnator/01-ui-ux.md) A taxonomia de estados suporta a distinção entre um favorito que pertence especificamente a uma fonte (sourceId) e um favorito global que consolida itens idênticos. O `stableId` que implementamos resolve a base, mas a API de leitura precisará permitir queries que cruzem fontes (usando índices Dexie) para a futura tela "Global Favorites".
2. **Restaurar Estado de Foco**: O guia pede para manter o índice focal no histórico de navegação. Esse estado de roteamento e UI efêmero não pertence ao Dexie (que foca em retenção de longo prazo), e sim à memória React/Norigin (que faremos no roteador na Feature 009/010).
3. **Empty States Controlados**: As leituras deste repositório sempre retornarão defaults seguros ou `undefined` previsíveis para forçar o render de `EmptyState` focável na UI, evitando travamentos do controle remoto.

## Decisões Invariantes
- **ID Estável Obrigatório**: Nunca usar o ID sequencial do provedor ou ID auto-incremento do Dexie como chave primária do estado. A chave primária deve ser determinística.
- **Repositório Independente**: O estado do usuário não entra na tabela `channels`. Deve ser uma tabela separada `userStates`.
- **Evolução de Schema Segura**: A versão do Dexie em `db.ts` deve ser incrementada e a nova tabela adicionada corretamente na store.

## Constitution Check
| Princípio | Avaliação (Pré-Design) | Avaliação (Pós-Design) |
|---|---|---|
| Client-first architecture | Atende: dados armazenados no IndexedDB do cliente. | Atende. |
| Testabilidade independente | Atende: repositório isolado e injetável. | Atende. |
| Separação de Segredos | Atende: estado não se mistura com credenciais (sources) nem com logs. | Atende. |

## Complexity Tracking
*Nenhuma complexidade excepcional identificada.*

## Estratégia de Testes
- **Testes de Contrato/Integração (Dexie)**: `userStateRepository.test.ts` usando Vitest e ambiente JSDOM. 
- Comando: `npx vitest run src/lib/catalog/userStateRepository.test.ts`
- Verificar upsert de favoritos, atualização de progresso e persistência mesmo se as fontes forem apagadas.

## Project Structure
- `tv-web/src/lib/catalog/db.ts`: Adição da tabela `userStates`
- `tv-web/src/lib/catalog/userStateRepository.ts`: Nova camada
- `tv-web/src/lib/catalog/userStateRepository.test.ts`: Testes


## Resultado Final
A Feature 008 foi implementada com 100% de conformidade com o planejado, sem lacunas em relação aos artefatos ou diretrizes de referência. A base Dexie foi estendida (version 4 e 5) para suportar a store `userStates` com índices essenciais para UI de TV (`isFavorite`, `lastWatched`). O repositório `userStateRepository.ts` provê a persistência durável usando o identificador estável (`stableId`), permitindo `toggleFavorite`, `updateProgress`, e agregações globais. Testes Vitest passaram e cobrem totalmente as regras de negócio de estado.
