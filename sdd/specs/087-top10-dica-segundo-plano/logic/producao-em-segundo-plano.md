# Produção do Top 10 e da Dica em segundo plano

Este documento fixa **onde** cada coisa mora e **quando** roda. As regras de seleção (quem entra, em que ordem) não
mudam e não são redescritas aqui — elas vivem em `lib/metadata/discoveryRules.ts` e são reusadas como estão.

## 1. O que existe hoje, e o que muda

| | Hoje | Depois |
| --- | --- | --- |
| Carregar o ranking do TMDB | `loadWeeklyTrending` / `loadTipPool`, chamados por `useDiscoveryRow` na tela | os mesmos, chamados pelo produtor em 2º plano |
| Índice de nomes do tipo | `useDiscoveryIndex` na tela: `iterateKindRecordBatches` por todo o tipo | o produtor, em fatias, na fila do prefetch |
| Casar e selecionar | `matchDiscoveryTitlesAsync` + `selectTop10`/`selectTip`, num efeito da tela | os mesmos, no produtor |
| A tela | calcula e guarda em cache de memória | **lê um registro** por chave primária |

**Nada em `discoveryRules.ts` nem em `tmdbDiscovery.ts` muda.** Se o plano levar a mexer nesses dois, algo foi
entendido errado: eles têm contrato travado da feature 057.

## 2. Onde mora

```
lib/catalog/externalRows.ts        (NOVO)  o produtor: carrega → indexa → casa → seleciona → grava
lib/catalog/showcaseRows.ts        (existe) readExternalRow / writeExternalRow — já prontos e testados
lib/catalog/showcaseTypes.ts       (existe) ShowcaseExternalRowRecord — ganha campos (§3)
lib/catalog/prefetch/index.ts      (existe) chama o produtor no housekeeping
features/catalog/catalogApi.ts     (existe) useWeeklyTop10/useDailyTip passam a ler
```

O produtor fica em `lib/`, não em `features/`: o ratchet proíbe `lib/` → `features/`, e a tela não pode ser dona dele.
A conversão para o item de tela (`toItemOut`) continua em `features/` — o registro guarda `CatalogReadItem`, e a tela
converte na leitura, como já faz com o documento de tela da feature 086.

## 3. O registro

`ShowcaseExternalRowRecord` (já existe, com `id`, `sourceId`, `generation`, `kind`, `row`, `periodKey`, `items`,
`computedAt`) ganha:

```ts
/** Posição no ranking, na MESMA ordem de `items`. Só para `top10`. */
ranks?: number[]
/** Fundo 16:9 que veio do TMDB, por id do item. */
backdrops?: Array<[string, string]>
/** Nota que veio do TMDB, por id do item (feature 061: sem consulta ao focar). */
ratings?: Array<[string, { average: number; votes: number }]>
/** Cobertura no momento da produção, para o aviso de escopo parcial (FR-006 da 052). */
coveredCategories?: number
totalCategories?: number
```

Pares em array, não `Map`: o registro atravessa o `structuredClone` do IndexedDB, e array de pares é o que o resto do
projeto já usa para isso.

**Campos novos não indexados não exigem subir a versão do schema** — não mexa em `db.ts` por causa deles.

## 4. O produtor

```ts
export async function refreshExternalRow(
  sourceId: string,
  kind: 'movie' | 'series',
  row: 'top10' | 'tip',
  options?: { database?: CatalogDb; now?: number; signal?: AbortSignal; language?: AppLanguage },
): Promise<boolean>   // true = fez trabalho

export async function refreshStaleExternalRows(
  sourceId: string,
  options?: ...,
): Promise<boolean>   // true = produziu UMA (há mais a fazer)
```

Ordem obrigatória dentro de `refreshExternalRow`, e o **porquê de cada parada antecipada**:

1. **Geração ativa da lista.** Sem ela, `false` — não há onde ancorar o registro.
2. **Período já guardado?** `periodOf(row, now)` igual ao do registro → `false` **sem tocar a rede**. É isto que
   cumpre o FR-007: no máximo uma produção por semana (Top 10) e uma por dia (Dica).
3. **Carregar o ranking** (`loadWeeklyTrending`/`loadTipPool`). Sem títulos — sem chave, sem rede, sem cache — `false`
   **sem gravar nada** (FR-009). Não insista: a próxima rodada da fila tenta de novo.
4. **Montar o índice** com `iterateKindRecordBatches` + `compactSearchRecord`, **cedendo a vez** (`yieldToMain`) a cada
   lote. Catálogo vazio → `false`.
5. **Casar** (`matchDiscoveryTitlesAsync`, com `yieldFn` e `signal`) e **selecionar** (`selectTop10`/`selectTip`).
6. **Gravar** o registro, **inclusive quando a seleção vem vazia** (abaixo do mínimo): é o período que serve de
   validade, e gravar vazio é o que impede a fila de repetir o trabalho a cada rodada (FR-015).

### O período

```ts
const periodOf = (row, now) => row === 'top10' ? weekKey(now) : localDay(now)
```

`weekKey` já é exportado de `tmdbDiscovery.ts`; `localDay` **não é** — exporte-o lá (uma linha), não reimplemente.

### A semente da Dica

`selectTip` recebe `{ now, seed }`. A semente **tem de ser a mesma de hoje** — `` `${localDay(now)}|${kind}|${sourceId}` `` —
senão a Dica muda de título e o contrato de equivalência (C1) reprova.

## 5. Quando roda

**Na fila do housekeeping** (`lib/catalog/prefetch/index.ts`), depois de `refreshMissingScreenDocuments`, uma por
rodada, como as outras tarefas adiáveis:

```ts
if (await refreshStaleExternalRows(sourceId)) return true
```

Essa fila já traz de graça tudo o que esta feature precisa: espera o aparelho ficar quieto (`activityGate`), cede a vez
à primeira tela da sessão (`firstReveal`, feature 086) e se cala durante a carga da lista (`loadActivity`).

**Não** chame o produtor ao fim da carga por seção: a feature 086 passou a medição inteira tirando trabalho daquele
momento.

## 6. A ação da pessoa tem efeito imediato (FR-010, FR-011)

| Ação | O que acontece |
| --- | --- |
| **Salvar** a chave (`useSaveTmdbKey`, `onSuccess`) | acorda a fila (`wakePrefetch`) — a produção não espera a vez |
| **Remover** a chave (`useRemoveTmdbKey`, `onSuccess`) | **apaga** os registros da lista ativa e descarta a consulta da tela |
| **Trocar o idioma** (`subscribeAppLanguage`) | **mantém** o registro e marca para refazer; a fileira troca quando o novo chegar |

A assimetria é deliberada: remover é a pessoa pedindo para o conteúdo sair, então sai na hora; trocar o idioma não é
pedido para esvaziar nada.

## 7. A tela

`useWeeklyTop10` e `useDailyTip` **mantêm a assinatura e a forma do retorno** (`DiscoveryRowResult<R>`): o contrato
travado da feature 057 em `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` **mocka esses dois hooks**, então
mudar a forma do retorno o quebra.

Por dentro, cada um vira uma leitura:

```ts
useQuery({
  queryKey: ['catalog-search-index', sourceId, kind, 'external', row],
  queryFn: () => readExternalRow(sourceId, kind, row),
  staleTime: SHOWCASE_STALE_MS,
})
```

A chave fica **sob `catalog-search-index`** de propósito: a pré-carga e a sincronização já invalidam esse prefixo, e é
isso que faz a fileira aparecer sozinha quando a fila produz (FR-006) — sem canal de aviso novo.

Sai da tela: `useDiscoveryIndex`, `useDiscoveryRow`, `projectTop10`, `projectTip`, `DISCOVERY_READ`,
`discoveryResultKey`, `DiscoveryComputed`, `DiscoveryEntries`, `DiscoveryContext` e `EMPTY_BACKDROPS`.
Fica: `DiscoveryRowResult` e `DiscoveryPick`, que a tela usa.

**Cuidado medido**: `catalogApi.ts` tem teto de linhas no ratchet. Remover esse bloco **reduz** o arquivo, então não há
risco — mas não aproveite para mover outras coisas para lá.

## 8. Os 14 testes que mudam de lugar

`features/catalog/catalogApi.discovery.test.tsx` e `catalogApi.discovery.estados.test.tsx` testam hoje o cálculo **na
tela**. Eles não são contrato travado, e **são o tamanho real desta feature**.

Cada um precisa virar um teste equivalente no lugar novo — produtor ou leitura — mantendo a garantia:

| Garantia de hoje | Onde passa a viver |
| --- | --- |
| cruza com a posição real, a cobertura, sem rede | produtor |
| abaixo do mínimo, vazio | produtor (e grava vazio, FR-015) |
| sem chave não há dado, e o índice nem é lido | produtor (para no passo 3) |
| categoria que chega depois atualiza a fileira | produtor + a invalidação do prefixo |
| o resultado não é calculado na renderização | leitura (trivial agora: a tela só lê) |
| série usa o ranking e o índice de séries | produtor |
| a Dica sorteia igual no mesmo dia; vazia abaixo do mínimo | produtor (semente do §4) |
| o dia fica fixo na montagem | **muda de natureza**: o dia agora é do `periodKey`, não da montagem |
| chave recusada/em pausa: nenhuma requisição, guardado vale | produtor (passo 3) + leitura |
| sem rede: usa o último; sem cache a fileira some | produtor (passo 3) + leitura |
| trocar a lista não dispara consulta | leitura (registro por lista) |
| trocar o idioma refaz no idioma novo | §6 |
| salvar a chave faz as fileiras aparecerem | §6 |
| remover a chave limpa e as fileiras somem | §6 |

A linha em negrito é a única que **muda de significado**, e isso é esperado: a estabilidade do sorteio deixa de ser
"fixado na montagem da tela" e passa a ser "fixado no período gravado" — mais forte, porque sobrevive a remontagens.

## 9. Invariantes

1. **Nada de `discoveryRules.ts` ou `tmdbDiscovery.ts` muda** (contrato travado da 057), exceto exportar `localDay`.
2. **A tela nunca consulta o serviço externo nem percorre o tipo** — é o motivo da feature existir.
3. **A forma do retorno de `useWeeklyTop10`/`useDailyTip` não muda** (contrato de tela da 057 os mocka).
4. **Gravar vazio é intencional** quando a seleção fica abaixo do mínimo; sem isso a fila repete o trabalho.
5. **O registro é projeção descartável**: apagá-lo custa uma fileira ausente até a próxima rodada, nunca conteúdo da
   pessoa.
6. **O produtor nunca roda na carga da lista nem antes da primeira revelação** — herda os três portões da 086.
7. **Nenhum segredo sai**: a chave do TMDB não entra em registro, log ou métrica; o registro guarda só o que o card
   mostra.
