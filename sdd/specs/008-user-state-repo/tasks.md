# Execution Tasks: UserStateRepository

**Slug**: `008-user-state-repo`

## Path Conventions
- **Repositórios**: `tv-web/src/lib/catalog/`
- **Banco de Dados**: `tv-web/src/lib/catalog/db.ts`

## Phase 1: Banco de Dados e Entidades

**Goal**: Incrementar o schema do Dexie e preparar as tipagens da nova entidade `UserState`.

**Implementation**:
- [X] 1. Em `db.ts`, definir a interface `UserStateRecord` (`stableId`, `sourceId`, `isFavorite`, `progressSeconds`, `lastWatched`, `createdAt`, `updatedAt`).
- [X] 2. Em `db.ts`, incrementar a versão do Dexie e adicionar a store `userStates` (índice primário `stableId`, índices secundários `sourceId`).
- [X] 3. Em `db.ts`, injetar a tipagem na `CatalogDb`.

**Tests**:
- [X] 4. Testar a inicialização do banco (criação da versão superior funciona sem falhar).

**Critério de Conclusão**: `db.ts` compila e banco abre no JSDOM com a nova tabela presente.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 2: UserStateRepository

**Goal**: Criar o repositório que permite favoritar e salvar progresso.

**Implementation**:
- [X] 1. Criar `userStateRepository.ts`.
- [X] 2. Implementar `buildStableId(sourceId, type, originalName): string` (hashear ou higienizar a string).
- [X] 3. Implementar `getUserState(stableId, db)`.
- [X] 4. Implementar `toggleFavorite(stableId, sourceId, isFavorite, db)`.
- [X] 5. Implementar `updateProgress(stableId, sourceId, progressSeconds, db)`.

**Tests**:
- [X] 6. Criar `userStateRepository.test.ts` cobrindo o fluxo: favoritar salva, desfavoritar salva false, atualizar progresso atualiza timestamp.
- [X] 7. Verificar independência da recriação do catálogo.

**Critério de Conclusão**: Cobertura positiva nos testes unitários e todos os métodos isolados na camada de repositório.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 3: Polish

**Goal**: Garantir a higiene e ausência de vazamentos.

**Checklist de Release**:
- [X] Phase 1 testada e revisada
- [X] Phase 2 testada e revisada
- [X] Testes no console Vitest passando perfeitamente sem TypeErrors

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

