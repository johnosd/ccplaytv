# Lógica: orçamento de armazenamento (feature 082)

Fecha o "como" de US3–US5 (FR-008 a FR-014). Referência dos testes de contrato `planStorageRelease` e
`ensureCategory com orçamento`. Esboços: `storageBudget.ts`, `storageLedger.ts`.

## 1. Números

```
quota   = navigator.storage.estimate().quota ?? FALLBACK_QUOTA_BYTES (80 MiB — medido fixo na TV de referência)
reserva = max(BUDGET_RESERVE_MIN_BYTES, BUDGET_RESERVE_RATIO × quota)    // 12 MiB / 15 %: com 80 MiB, 12 MiB
teto    = quota − reserva                                                  // 68 MiB na TV de referência
```

- Com o formato comprimido, a lista real ocupa ~3–5 MB (estimativa medida). O teto existe para listas enormes e para
  várias listas ao mesmo tempo.
- `StorageBudgetConfig.capBytes` sobrescreve o teto (testes e simulação).

## 2. Conta própria (`storageLedger.ts`)

Medido na TV: depois de `clear()`, o `estimate()` **não cai**. Ele foi de 14,0 MB para 15,6 MB e ficou assim por 70 s.
Por isso a decisão usa uma conta de **bytes gravados**:

```
categoryStoredBytes(db, id) = categories.storedBytes            (formato 2: Σ pedaços + índice + cabeçalho)
                            | itemsCount × LEGACY_ITEM_BYTES     (formato antigo, ainda não convertido; + projeção 065 se houver)
                            | 0                                  (nada no aparelho)
catalogLedger(db) = Σ categoryStoredBytes de todas as listas
                  + Σ sources.epgStoredBytes (formato novo) | linhas de guia × LEGACY_EPG_ROW_BYTES
                  + titleMetadata/tmdbPeople × METADATA_BYTES
```

- `LEGACY_ITEM_BYTES` ≈ 320 B por item: 3,62 MB ÷ 11 347 filmes, medido na TV.
- `LEGACY_EPG_ROW_BYTES` ≈ 700 B por linha: 14 MB ÷ 20 mil linhas, medido na TV.
- `METADATA_BYTES` é medido pela sonda (T004).
- Só lê campos e `count()` por índice, nunca carrega pedaços.

## 3. Planejador puro: `planStorageRelease(state, need, candidates, mode)` (contrato)

| Escopo | O que é | Quando entra |
| --- | --- | --- |
| `temporary` | `sectionStaging` de outras listas, `discoveryCache` | sempre |
| `inactive-list` | tudo o que pode ser refeito de **uma** lista não ativa: cabeçalhos e pedaços `on_demand`, blocos antigos, projeções, episódios, guia e `titleMetadata` | sempre |
| `active-category` | **uma** categoria `on_demand` da lista ativa: cabeçalho, pedaços e episódios | só no modo `entry` |

1. **Elegível** = `!pinned && refetchable && (mode === 'entry' || scope !== 'active-category')`.
2. **Ordem**: escopo, depois o `lastUsedAt` mais antigo (0 = nunca usado), e em empate a ordem de entrada.
3. **Excesso** = `ledgerBytes + need − capBytes`. Se > 0, acumula na ordem até `liberado ≥ excesso`. Sem elegíveis
   suficientes, devolve todos (o chamador conclui `fits: false`).
4. **Guarda do navegador**: com excesso ≤ 0 mas `reported.usage + need > reported.limit`, devolve **no máximo um**
   elegível. Se nada passa do limite, devolve `[]`.
5. Puro: sem banco e sem relógio.

## 4. `makeRoomFor(sourceId, need, { mode, protectCategoryId, now, database, config })`

1. Lê a cota (`readStorageEstimate`), calcula o teto ou usa `config.capBytes`, e lê a conta (§2).
2. Monta os candidatos:
   - **`refetchable`**: `false` para `eager`/`stored` (M3U). Conserta R-005: o bugfix liberava `stored`;
   - **`pinned`**: `protectCategoryId`, uso há menos de `PIN_WINDOW_MS`, a categoria do item tocando, e **as categorias
     da lista ativa que contêm favorito ou item de "Continuar assistindo"**. Para achá-las, resolve os `userStates` da
     lista por `resolveStableIdsIn` no índice de identidade; o trabalho é limitado ao que a pessoa já interagiu
     (achado A-01);
   - `lastUsedAt` de `inactive-list` = `SourceRecord.lastActivatedAt`.
3. Planeja e libera na ordem, um candidato por transação:
   - **categoria**: apaga o cabeçalho e os pedaços (faixa de chave), os blocos e linhas antigos, a projeção e os
     episódios, e faz `categories.update(id, { itemsFetchedAt, itemsCount, itemsSignature, seriesEpisodesFetchedAt,
     storedBytes: undefined })`;
   - **lista inativa**: as categorias como acima, mais o guia (`epgChunks`/`epgPrograms` com `epgLastSyncAt` vazio:
     "ainda não sincronizado") e o `titleMetadata`;
   - **temporário**: `sectionStaging` de outras listas e `discoveryCache`.
4. Avisa `onCatalogReleased(sourceId, categoryIds)`. A raiz invalida `category-content`, `category-preview`,
   `catalog-counts`, `catalog-all-pages`, `catalog-search-index` e `global-search-index`.
5. Devolve `fits = conta − liberado + need ≤ teto`. **Nunca lança** por quota.

`need` = **o tamanho codificado** da gravação. A fase 1 do §4 de `formato-comprimido.md` já o conhece antes da
transação. Para a pré-carga, que decide antes de buscar, a estimativa é `declaredCount × média de bytes por item da
lista` (pela conta); sem histórico, `declaredCount × 60 B`.

| Chamador | Modo |
| --- | --- |
| `categoryLoader.fetchAndStore` (entrada) | `options.budgetMode ?? 'entry'` |
| `prefetch/index.ts` `runCategory` | `'prefetch'` (passa `budgetMode: 'prefetch'`) |
| `sectionLoader` (Worker) | `'prefetch'` |
| `seriesLoader` (episódios) | `'entry'` |
| `epgSync` (Worker) | `'prefetch'` |

Resultado `fits: false`:
- **entrada**: `{ outcome: hadItems ? 'stale-served' : 'failed', reason: 'storage_full' }`, só no caso excepcional;
- **pré-carga**: `'storage_full'`, e o agendador para (cobertura parcial, §6);
- **guia**: `epgLastErrorKind: 'storage_full'`.

## 5. Uso recente

- `touchCategory(categoryId, now, database)`:
  - grava num `Map` em memória com chave `${database.name}:${id}`;
  - grava `categories.lastUsedAt` no disco no máximo 1×/h;
  - erros são engolidos.
- Quem marca o uso: `ensureCategory` no modo `entry`, `seriesLoader` ao abrir uma série, `resolvePlaybackUrl` (a
  categoria do item), e as telas de detalhe e o player ao montar (A-02).
- `SourceRecord.lastActivatedAt` é gravado em `usePrefetchForSource`.

## 6. Cobertura parcial honesta

Quando `progress.stoppedReason === 'storage_full'` e `ready < total`, o Início mostra a chave nova
`home.status.partial` (pt/en/es). É um texto não alarmante, como "Parte da lista fica no aparelho; o resto carrega ao
entrar". Nunca STO-01.

## 7. O que não muda

- `withStorageRelief` continua como último recurso das gravações críticas. A liberação normal dele usa os candidatos do
  §4 (modo `entry`, sem proteger a lista ativa além do `pinned`), e a emergência continua.
- A fachada não reexporta o orçamento (contrato da 063).
