# Tasks: Top 10 e Dica produzidos em segundo plano

**Feature**: 087-top10-dica-segundo-plano
**Spec**: `spec.md` · **Plano**: `plan.md` · **Desenho**: `logic/producao-em-segundo-plano.md`

## Format: `[ID] [P?] [Story] Description`

- `[P]` = pode rodar em paralelo com outras `[P]` da mesma fase.
- `[Story]` = a user story que a task serve (US1, US2, US3).

## Path Conventions

```
tv-web/src/lib/catalog/         externalRows.ts (stub pronto), showcaseRows.ts, showcaseTypes.ts, prefetch/index.ts
tv-web/src/lib/metadata/        discoveryRules.ts (NÃO MUDA), tmdbDiscovery.ts (só exporta localDay)
tv-web/src/features/catalog/    catalogApi.ts, catalogApi.discovery*.test.tsx
```

## Phase 1: Setup

**Objetivo**: confirmar o ponto de partida antes de escrever qualquer linha.

### Implementation

- [ ] T001 Rodar os 5 contratos e confirmar que estão **vermelhos pelo motivo esperado** (3 por `not implemented`, 2 por
      asserção), com o comando de `plan.md` → `## Estratégia de Testes`.
- [ ] T002 Conferir as travas de **087, 057 e 086** íntegras (os três comandos do mesmo lugar). A da 057 é a que esta
      feature pode quebrar sem perceber.

### Critério de Conclusão

Os 5 contratos vermelhos pelo motivo certo e as três travas íntegras.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 2: Foundational

**Objetivo**: a peça que todas as fases usam — o período.

### Implementation

- [ ] T010 Exportar `localDay` em `lib/metadata/tmdbDiscovery.ts` (uma linha; `weekKey` já é exportado) →
      `logic/...md` §4. **Não** reimplemente a função, e **não** mexa em mais nada nesse arquivo (contrato travado da 057).

### Critério de Conclusão

`npx tsc -b` verde; `check-contract-tests.ps1 -Slug 057-top10-dica-tmdb` íntegro.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 3: User Story 1 — As telas deixam de percorrer o catálogo (P1) 🎯 MVP

**Objetivo**: o produtor existe e grava; a tela só lê.

### Contrato da Fase

Estes **já existem e estão travados** — não são task de escrita:

- `grava os mesmos itens, na mesma ordem e com a posição real, que as regras atuais produzem`
- `abaixo do mínimo de cruzados grava o período com a fileira vazia, para a fila não repetir o trabalho`
- `mostra o resultado guardado sem tocar a rede nem percorrer o catálogo; sem resultado, a fileira não existe`

```bash
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx
```

### Implementation

- [ ] T020 [US1] Implementar `refreshExternalRow` em `lib/catalog/externalRows.ts`, na **ordem obrigatória** de
      `logic/...md` §4 (geração → período → ranking → índice em fatias → casar → selecionar → gravar, inclusive vazio)
      → contratos: "grava os mesmos itens…", "abaixo do mínimo…". Cobre também **FR-013** (o registro pertence à
      geração ativa; sem geração, não produz) e **FR-016** (gravar o registro nunca impede nem atrasa a gravação do
      catálogo — transação própria, falha engolida).
- [ ] T021 [US1] Implementar `refreshStaleExternalRows` (uma fileira por rodada, varrendo tipo × fileira) →
      `logic/...md` §4.
- [ ] T022 [US1] Ligar no `housekeeping` de `lib/catalog/prefetch/index.ts`, **depois** de
      `refreshMissingScreenDocuments` → `logic/...md` §5; **FR-014** (não competir com a primeira tela nem com a carga
      — a fila já traz os três portões da 086). **Não** ligar na carga por seção (Decisão Invariante 5).
- [ ] T023 [US1] `useWeeklyTop10`/`useDailyTip` em `features/catalog/catalogApi.ts` passam a **ler** por
      `readExternalRow`, mantendo a forma do retorno → contrato: "mostra o resultado guardado…"; `logic/...md` §7.
- [ ] T024 [US1] Remover da tela o que ficou órfão: `useDiscoveryIndex`, `useDiscoveryRow`, `projectTop10`,
      `projectTip`, `DISCOVERY_READ`, `discoveryResultKey`, `DiscoveryComputed`, `DiscoveryEntries`,
      `DiscoveryContext`, `EMPTY_BACKDROPS` → `logic/...md` §7. **Preservar** `DiscoveryRowResult` e `DiscoveryPick`.
- [ ] T025 [US1] Rodar `node scripts/architecture.mjs` e, se o teto de `catalogApi.ts` tiver baixado, podar o baseline
      (`--prune`) → R-005.

### Testes da Fase

- [ ] T026 Teste: série usa o ranking e o índice **de séries** (garantia 6 da lista de `## Assumptions`).
- [ ] T027 Teste: a fileira aparece **sem remontar a tela** depois que a fila produz — a invalidação do prefixo
      `catalog-search-index` é o que faz isso (FR-006, garantia 4).

### Critério de Conclusão

1. Os 3 contratos da fase verdes e `check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano` íntegro.
2. `npx vitest run src/lib/catalog src/features/catalog src/lib/metadata` verde.
3. Nenhuma passada pelo catálogo e nenhuma requisição disparadas pela abertura — é o que fecha **SC-001**, **SC-002**
   e **SC-003** (os contratos provam os três, sem a TV).
4. **SC-004** (o resultado recém-produzido aparece sem sair e voltar) coberto por T027.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 4: User Story 2 e 3 — período, e a ação da pessoa (P2, P3)

**Objetivo**: o resultado se mantém correto sozinho, e o que a pessoa faz tem efeito imediato.

### Contrato da Fase

- `dentro do período não produz nada, e com o período vencido sem resposta mantém o que está guardado`
- `remover a chave apaga o resultado guardado e a fileira some, sem requisição`

(mesmo comando da Fase 3)

### Implementation

- [ ] T030 [US3] Salvar a chave (`useSaveTmdbKey`, `onSuccess`) **acorda a fila** (`wakePrefetch`) → **FR-010**;
      `logic/...md` §6.
- [ ] T031 [US3] Remover a chave (`useRemoveTmdbKey`, `onSuccess`) **apaga** os registros da lista ativa → **FR-011**;
      contrato: "remover a chave apaga…".
- [ ] T032 [US3] Trocar o idioma (`subscribeAppLanguage`) **mantém** o registro e marca para refazer → **FR-012**;
      `logic/...md` §6. A assimetria com T031 é deliberada.
- [ ] T033 **Mover as 14 garantias** de `catalogApi.discovery.test.tsx` e `catalogApi.discovery.estados.test.tsx` para o
      lugar novo, uma a uma, pela tabela de `logic/...md` §8 → **FR-017**. A garantia "o dia fica fixo na montagem"
      muda de natureza (R-004): verificar a estabilidade pelo `periodKey`.

### Testes da Fase

- [ ] T034 Teste: sem chave, o produtor **não lê o índice** (para no passo 3 de `logic/...md` §4) — garantia 3.
- [ ] T035 Teste: chave recusada ou em pausa por limite: nenhuma requisição, e o guardado continua valendo — garantia 9,
      **FR-009** (serviço fora do ar, lento, recusando a chave ou sem chave não esvazia a fileira nem atrasa a abertura).

### Critério de Conclusão

1. Os 2 contratos da fase verdes; os 5 verdes juntos; trava íntegra.
2. **Cada linha da tabela de `logic/...md` §8 tem um teste no lugar novo** — nenhuma garantia perdida (FR-017).
3. `npm run test` completo verde.
4. **SC-005** (dentro do período, nenhuma requisição nova) e **SC-006** (salvar faz aparecer, remover faz sumir sem
   requisição) cobertos pelos contratos da fase.

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: fechar os gates e medir na TV.

### Implementation

- [ ] T040 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` verdes.
- [ ] T041 `npm run test:e2e` completo (com `npm run dev` **no ar** — a suíte dá 4/54 sem ele, e isso já custou tempo).
      Falha → reexecutar em série (`--jobs 1`) antes de chamar de flake, e registrar a taxa observada.
- [ ] T042 Atualizar a regra permanente da feature 086 no `CLAUDE.md`: a frase sobre o índice do Top 10/Dica na tela
      deixa de valer.
- [ ] T043 TV (**pedir autorização**): roteiro do `quickstart.md` §4 — **duração fixa**, pela lição do SC-009 da 086.
      Medir SC-007 (quadros longos ao navegar) e SC-008 (abertura segue em 313–380 ms).
- [ ] T044 Reinstalar o **pacote normal** na TV e avisar o usuário.

### Checklist de Release

- [ ] Fase 1 (setup e travas conferidas)
- [ ] Fase 2 (período)
- [ ] Fase 3 (US1 — o MVP: produtor + leitura)
- [ ] Fase 4 (US2/US3 + as 14 garantias movidas)
- [ ] Todos os 5 contratos verdes e `check-contract-tests.ps1` íntegro (087, 057, 086)
- [ ] `npm run test` / `tsc` / `lint` / `build` / `test:e2e` verdes
- [ ] SC-007 e SC-008 medidos na TV, com roteiro de duração fixa
- [ ] Pacote normal reinstalado na TV
- [ ] `quickstart.md` executado

### Registro da Fase

Status:
Feito:
Contrato:
Testes executados:
Pendências:

## Dependencies & Execution Order

### Phase Dependencies

- Fase 2 (T010) bloqueia a Fase 3: o produtor precisa de `localDay`.
- Fase 3 (T020–T023) bloqueia a Fase 4: não há o que apagar nem acordar antes de existir produtor e leitura.
- T024 depois de T023: remover o código órfão só depois de a leitura estar no lugar.
- T033 é a maior task da feature e depende de toda a Fase 3.

### Parallel Opportunities

- T026 e T027 podem rodar junto, depois de T023.
- T030, T031 e T032 são independentes entre si.
- T034 e T035 podem rodar junto.
