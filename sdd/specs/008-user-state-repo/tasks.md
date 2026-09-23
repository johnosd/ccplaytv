# Execution Tasks: UserStateRepository

**Slug**: `008-user-state-repo`

## Path Conventions
- **Repositórios**: `tv-web/src/lib/catalog/`
- **Banco de Dados**: `tv-web/src/lib/catalog/db.ts`

## Phase 1: Banco de Dados e Entidades

**Goal**: Incrementar o schema do Dexie e preparar as tipagens da nova entidade `UserState`.

**Implementation**:
- [x] 1. Em `db.ts`, definir a interface `UserStateRecord` (`stableId`, `sourceId`, `isFavorite`, `progressSeconds`, `lastWatched`, `createdAt`, `updatedAt`).
- [x] 2. Em `db.ts`, incrementar a versão do Dexie e adicionar a store `userStates` (índice primário `stableId`, índices secundários `sourceId`).
- [x] 3. Em `db.ts`, injetar a tipagem na `CatalogDb`.

**Tests**:
- [x] 4. Testar a inicialização do banco (criação da versão superior funciona sem falhar).

**Critério de Conclusão**: `db.ts` compila e banco abre no JSDOM com a nova tabela presente.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 2: UserStateRepository

**Goal**: Criar o repositório que permite favoritar e salvar progresso.

**Implementation**:
- [x] 1. Criar `userStateRepository.ts`.
- [x] 2. Implementar `buildStableId(sourceId, type, originalName): string` (hashear ou higienizar a string).
- [x] 3. Implementar `getUserState(stableId, db)`.
- [x] 4. Implementar `toggleFavorite(stableId, sourceId, isFavorite, db)`.
- [x] 5. Implementar `updateProgress(stableId, sourceId, progressSeconds, db)`.

**Tests**:
- [x] 6. Criar `userStateRepository.test.ts` cobrindo o fluxo: favoritar salva, desfavoritar salva false, atualizar progresso atualiza timestamp.
- [x] 7. Verificar independência da recriação do catálogo.

**Critério de Conclusão**: Cobertura positiva nos testes unitários e todos os métodos isolados na camada de repositório.

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 

## Phase 3: Polish

**Goal**: Garantir a higiene e ausência de vazamentos.

**Checklist de Release**:
- [x] Phase 1 testada e revisada
- [x] Phase 2 testada e revisada
- [x] Testes no console Vitest passando perfeitamente sem TypeErrors

**Registro da Fase**:
- Status: 
- Feito: 
- Testes executados: 
- Pendências: 
