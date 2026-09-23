# Implementation Plan: UserStateRepository

**Slug**: `008-user-state-repo`

## Summary
Criação do repositório `userStateRepository.ts` isolado no Dexie (`userStates`) para persistir o histórico e favoritos dos usuários de forma segura contra reimportações voláteis do catálogo.

## Technical Context
- **Linguagem**: TypeScript.
- **Armazenamento**: IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`).
- **Padrões Existentes**: Repositórios separam as entidades do Dexie das telas. As chaves devem ser estáveis (sourceId + type + originalName) para sobreviver à recriação do catálogo.

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

## Estado Atual
| Área | Estado |
|---|---|
| Repositório | Implementado e Testado |
| DB | Schema v4 criado |

## Arquivos Principais
- `tv-web/src/lib/catalog/db.ts`
- `tv-web/src/lib/catalog/userStateRepository.ts`

## Execution Notes
| Data | Fase/Story | Resumo | Pendência Principal |
|---|---|---|---|
| 2026-09-22 | Phase 1-3 | Repositório Dexie de estado criado | Nenhuma |

PRÓXIMO: sdd-converge
