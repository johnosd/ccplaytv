# Seleções guardadas das fileiras (086)

Stubs: `tv-web/src/lib/catalog/showcaseCandidates.ts` e `tv-web/src/lib/catalog/showcaseRows.ts`.
Contratos: `showcaseCandidates.montagem-rapida.contract.test.ts`, `showcaseRows.montagem-rapida.contract.test.ts`,
`useScreenAssembly.montagem-rapida.contract.test.tsx`.

## 0. Por que duas estruturas e não uma

As fileiras calculadas têm duas origens diferentes, e misturá-las foi o erro que a medição expôs:

| Fileira | Origem | O que muda o resultado |
| --- | --- | --- |
| Adicionados recentemente, Bem avaliados | Só o catálogo local | Gravar uma categoria |
| Top 10, Dica, Porque você assistiu | Serviço externo **cruzado** com o catálogo | Virar a semana/dia, ou o catálogo mudar |

Hoje as duas saem da **mesma varredura** (`loadShowcaseSelections`), que lê o tipo inteiro na abertura da tela. O desenho
separa: **A) candidatos por categoria** (derivado puro do catálogo, incremental) e **B) resultado do casamento externo**
(calculado fora da tela, guardado com o período a que pertence).

## 1. Estrutura A — candidatos por categoria

Uma linha **por categoria**, escrita por quem grava a categoria (`renewCategoryItems`/`storeCategoryItems`), nunca pela tela.

```ts
interface ShowcaseCandidates {
  categoryId: number          // chave primária
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  order: number               // ordem da categoria na fonte — define o desempate da mesclagem
  /** Os `RECENT_CANDIDATES` mais novos DESTA categoria, do mais novo para o mais antigo. */
  recent: ShowcaseCandidateItem[]
  /** Os `RATED_CANDIDATES` melhores elegíveis DESTA categoria, na ordem de qualidade do algoritmo atual. */
  rated: ShowcaseCandidateItem[]
  /** Títulos elegíveis para "Bem avaliados" nesta categoria (sem dedupe entre categorias). */
  eligibleCount: number
  /** Itens da categoria quando os candidatos foram calculados — detecta candidato velho. */
  itemsCount: number
}
```

`ShowcaseCandidateItem` guarda **o que o card precisa**, para a montagem não precisar reabrir o bloco da categoria:
`id`, `name`, `originalName`, `iconUrl`, `year`, `addedAt`, `providerRating`, `providerGenres`, `providerBackdropUrl`,
`seriesId`, `providerStreamId`, `hasPlayback`, `categoryId`, `groupOrder`, `categoryPosition`. É o mesmo conjunto de
`projectReadItem` (`readProjection.ts`) — **reaproveite aquela função**, não escreva outra.

### Limites

```
RECENT_CANDIDATES = 12   // = SHOWCASE_LIMIT
RATED_CANDIDATES  = 48   // RATED_POOL (36) + 12 de folga, ver §2.1
```

### Por que isto é exato (e não uma aproximação)

- **Adicionados recentemente** é um top-12 global por `addedAt`. Um item que não está entre os 12 mais novos **da sua
  categoria** não pode estar entre os 12 mais novos **do tipo**. Guardar 12 por categoria é matematicamente suficiente.
- **Bem avaliados** monta um pool de 36 por qualidade. Mesmo raciocínio, com uma ressalva no dedupe (§2.1).

## 2. Montar a fileira a partir dos candidatos

```
montarFileiras(sourceId, kind):
  access   = getCategoryAccess(sourceId)                 # feature 066 — filtro na LEITURA, não no gravado
  linhas   = showcaseCandidates.where([sourceId+generation+kind]).toArray()
  visiveis = linhas.filter(l => !access.excluded.has(l.categoryId)).sort(por l.order)   # ordem da fonte

  recentes = acumuladorRecentes()                        # createRecentlyAddedAccumulator, o MESMO de hoje
  avaliados = acumuladorAvaliados(seed = `${dayKey(now)}|${kind}|${sourceId}`)   # createRatedSelectionAccumulator
  para cada linha de visiveis (na ordem da fonte):
    para cada item de linha.recent:  recentes.add(item)
    para cada item de linha.rated:   avaliados.add(item)

  return {
    recent: recentes.finish(),
    rated:  avaliados.finish().picked,
    coveredCategories: visiveis.filter(isCovered).length,
    totalCategories:   visiveis.length,
  }
```

**Regra inegociável**: a mesclagem usa **os mesmos acumuladores da varredura de hoje**, alimentados na **mesma ordem**
(categoria na ordem da fonte, itens na ordem do bloco). É isso que torna o resultado idêntico — inclusive os desempates por
ordem de entrada, que dependem da ordem de alimentação. Não reimplemente a seleção.

### 2.1 O caso de borda do dedupe

"Bem avaliados" deduplica por `titleKey|year` **entre categorias**, mantendo a versão de maior qualidade. Em teoria, uma
duplicata descartada pode abrir vaga para o 37º melhor de uma categoria, que não estaria num top-36 por categoria. A folga de
`RATED_CANDIDATES = 48` cobre esse caso com margem. **O contrato C1 é quem prova**: ele compara a mesclagem com a varredura
completa sobre dados realistas e falha se divergir. Se algum dia divergir, aumente a folga — nunca mude o algoritmo de
seleção para "fazer o teste passar".

### 2.2 Filtros na leitura, não no gravado

Categoria escondida ou travada por PIN é filtrada **na montagem** (`access.excluded`). Assim, mudar a visibilidade ou destravar
o PIN não exige recalcular nada: a próxima montagem já reflete (FR-005). Pelo mesmo motivo, um item cuja categoria não existe
mais, ou cuja geração não é a ativa, é descartado na montagem (FR-010).

## 3. Quando os candidatos são recalculados

| Evento | O que acontece |
| --- | --- |
| Categoria gravada (`renewCategoryItems`, carga por categoria ou por seção) | Recalcula **só** os candidatos daquela categoria, com os itens que já estão em mãos |
| Categoria liberada pelo orçamento (082) | Apaga a linha de candidatos dela |
| Lista apagada / geração trocada | Apaga as linhas da lista / da geração antiga |
| Esconder, mostrar ou travar categoria | **Nada** — o filtro é na leitura (§2.2) |
| Virar o dia (semente de "Bem avaliados") | **Nada** nos candidatos; a semente entra na montagem |

O cálculo por categoria custa O(itens da categoria) e roda **com os itens já na memória do gravador** — nenhuma leitura
extra. Esse é o ponto do desenho: o custo deixa de ser "ler 43 510 por abertura" e passa a ser "olhar os itens que eu já
estou gravando mesmo".

## 4. Estrutura B — resultado do casamento externo

Top 10, Dica e "Porque você assistiu" precisam casar títulos do serviço externo com o catálogo, o que exige o índice de nomes
do tipo inteiro. Esse casamento **sai da tela**: roda em segundo plano e guarda o **resultado**.

```ts
interface ShowcaseExternalRow {
  id: string                  // `${sourceId}|${kind}|${row}` — row: 'top10' | 'tip' | 'because'
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  row: 'top10' | 'tip' | 'because'
  /** Período a que o resultado pertence: semana (top10), dia (tip), semente (because). */
  periodKey: string
  items: ShowcaseCandidateItem[]
  computedAt: number
}
```

Regras:

1. A montagem **lê o que está guardado e pronto** — nunca dispara o casamento nem espera rede (FR-013).
2. O período vencido **não invalida** a fileira: ela mostra o conteúdo guardado até o novo chegar (FR-015). Nada na tela
   indica "desatualizado".
3. O recálculo roda fora da abertura: na pré-carga ou depois de a tela estar pronta, pela mesma fila que já existe. Ele é o
   único lugar que ainda monta o índice de nomes do tipo.
4. Sem chave do serviço, ou com ele recusando/fora do ar: nada é guardado e a fileira não existe, como hoje (FR-016).

## 5. O que sai do caminho da abertura

| Hoje | Depois |
| --- | --- |
| `loadShowcaseSelections` varre o tipo inteiro na abertura (281–298 ms no PC, ~1,2 s estimados na TV, +34–41 MB) | A abertura lê as linhas de candidatos (35 linhas, ~2 100 itens) e mescla |
| A vitrine é invalidada **a cada lote da pré-carga** (até 1/s) e revarre tudo | A invalidação continua, mas reler é barato (§2) |
| Top 10/Dica esperam o serviço externo dentro da montagem | A montagem lê o resultado guardado; o casamento roda fora |

**Atenção ao achado da exploração**: `prefetchApi.ts` → `flush()` limita a remontagem do índice de busca a 1× por 10 s
(`SEARCH_INDEX_REFRESH_MS`), mas a chave da **vitrine** (6 elementos) cai no `predicate: queryKey.length !== 3` e é
invalidada a cada lote. Com a leitura barata isso deixa de ser um problema, mas confirme na medição: se a remontagem por lote
ainda pesar, trate junto (é a mesma linha de código).

## 6. Invariantes que o executor não pode quebrar

1. A montagem **nunca** varre o tipo inteiro, nem direta nem indiretamente (nada de `loadSearchIndex`, `listAllOfKind` ou
   `iterateKindRecordBatches` no caminho da tela).
2. A montagem **nunca** espera rede.
3. O conteúdo das fileiras é **idêntico** ao da varredura de hoje para o mesmo catálogo (contrato C1).
4. Item de categoria escondida ou travada por PIN **nunca** aparece (contrato C2).
5. Toda gravação nova de dado passa por `makeRoomFor` (regra da feature 082).
6. A entrada de uma fileira depois da revelação não move o foco nem a rolagem (constitution: foco).
