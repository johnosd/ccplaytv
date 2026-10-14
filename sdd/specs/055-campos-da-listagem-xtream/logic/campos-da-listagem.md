# Lógica — campos da listagem (feature 055)

Regras que o executor não deve reinterpretar. Os contratos travados (`contract-tests.lock`) já fixam §1, §2 e §4;
este documento explica o porquê e cobre o que os testes não cobrem (§3, §5, §6).

## 1. Normalização (fonte única: `lib/catalog/classifier.ts`, ao lado de `normalizeIconUrl`/`normalizeYear`)

Todas as funções são puras, **nunca lançam** e devolvem `undefined` para "ausente". Os stubs já existem com
`throw new Error('not implemented')`.

```ts
/** "9.2" | 7.4 | 7 → 9.2 | 7.4 | 7 ; resto → undefined */
export function normalizeProviderRating(raw: unknown): number | undefined
```

- Aceita `number` finito, ou `string` com `^\d+(\.\d+)?$` depois de `trim()`. Vírgula decimal ("7,4"), texto
  ("N/A"), `boolean`, objeto, `null` e negativo → `undefined`. Não é bug rejeitar "7,4": o painel real manda
  ponto (`9.2`, `7.4`); aceitar vírgula pediria adivinhar "1,234" (milhar?) e a spec trata vírgula como inválida.
- Arredonda para **uma casa**: `Math.round(n * 10) / 10`. `6.04 → 6`, `9.2 → 9.2`, `10 → 10`.
- Valida **depois** de arredondar: fica só se `0 < n ≤ 10`. `0`, `"0.0"` e `0.04` (→ 0) → `undefined`;
  `10.01` (rejeitado antes de arredondar, pois > 10) → `undefined`. Aplique `n > 10 → undefined` ao valor
  **antes** de arredondar, para `10.04` não virar `10`.
- Nunca use `rating_5based`. Nunca converta escala.

```ts
export function normalizeProviderGenres(raw: unknown): string | undefined
```

- `string` com `trim()` e espaços internos repetidos colapsados; vazio ou `"0"` → `undefined`. Não separa em lista,
  não traduz, não mapeia para categoria — é texto de exibição (FR-010).

```ts
export function firstBackdropUrl(raw: unknown): string | undefined
```

- `raw` pode ser lista (o painel real) ou string. Percorre na ordem e devolve a primeira que passa em
  `normalizeIconUrl`. Lista vazia, só inválidas ou tipo errado → `undefined`.

## 2. Quem mapeia o quê (`lib/catalog/xtreamConnector.ts`)

| Função | Campos novos |
|---|---|
| `mapVodEntry` | `providerRating` ← `raw.rating`. **Não** lê `genre` nem `backdrop_path` (spec: só série). |
| `mapSeriesEntry` | `providerRating` ← `raw.rating`; `providerGenres` ← `raw.genre`; `providerBackdropUrl` ← `raw.backdrop_path`. |
| `mapLiveEntry` | nada. |

**A chave só entra no objeto retornado quando há valor** (`if (x !== undefined) result.providerRating = x`).
Motivo: o clone estruturado do IndexedDB guarda até chave `undefined`; 43 mil filmes não devem ganhar chaves vazias
(mesmo padrão da feature 044, `importPipeline.ts`). O contrato testa `'providerRating' in item === false`.

Fontes M3U nunca preenchem esses campos (o formato não tem onde). Uma M3U que aponta para painel Xtream
confirmado usa `mapSeriesEntry`/`mapVodEntry` pelo mesmo caminho (feature 014) e os recebe sem código extra (FR-016).

## 3. Caminho até o disco e até a tela

```
mapVodEntry/mapSeriesEntry (MappedChannel = ClassifiedEntry)
  ├─ categoryLoader.toItemRecord()      → CatalogRecord → writeBlockWithin → CategoryBlockRecord.items (BlockItem)
  └─ importPipeline.toStoredRecord()    → StoredCatalogRecord (carga por seção)
blockRecord()/BlockItem ──► catalogApi.itemOut() ──► CatalogItemOut.provider_rating | provider_genres | provider_backdrop_url
```

- `toBlockItem` (`categoryBlocks.ts`) **já** copia todos os campos do registro por espalhamento — não precisa mudar.
- `toItemRecord` e `toStoredRecord` copiam campo a campo: **precisam** ganhar os três (só para `kind === 'series'`
  os de gênero/fundo; `providerRating` para `movie` e `series`), com a mesma regra "só quando existe".
- `itemOut` mapeia para `null` quando ausente (`?? null`), como `year`/`added_at`.
- **Sem bump de versão do Dexie**: valor sem índice, como `iconUrl`, `year` (ADR-010, feature 015 D-009).
- Nenhuma tela lê `db.channels`/blocos direto; tudo passa por `catalogApi.ts` (CLAUDE.md, feature 039).

## 4. Assinatura do bloco (`itemsSignature`, `categoryBlocks.ts`) — a armadilha desta feature

`writeBlockWithin` **não regrava** o bloco quando `itemsSignature` coincide. Se os campos novos ficassem de fora
da assinatura, uma lista já importada receberia a nota do painel, o bloco seria considerado idêntico e **a nota
nunca seria gravada** — silenciosamente. Por isso:

- Acrescente os três campos ao vetor **somente quando algum existe no item**, no mesmo bloco condicional da 044
  (`if (item.playbackHeaders || ...)`), para que um item sem eles gere **exatamente** o vetor de antes (lista antiga
  não regrava à toa; contrato: "mesma assinatura de antes").
- Ordem fixa: `providerRating ?? null`, `providerGenres ?? null`, `providerBackdropUrl ?? null`, **depois** dos campos
  da 044. Mudar a ordem muda o hash de listas que já têm os campos.
- A URL de fundo entra no hash (como `iconUrl`); só o hash sai dali, nunca a URL (FR-015).

## 5. Exibição (apresentação apenas — nenhuma busca, nenhum foco novo)

**Formato**: `Intl.NumberFormat(APP_LANGUAGE_LOCALE[t.language], { minimumFractionDigits: 1, maximumFractionDigits: 1 })`
→ pt `7,4`, en `7.4`, es `7,4`; inteiro mostra `8,0`. `showSource` acrescenta o rótulo `t('rating.provider')`
(pt "Provedor", en "Provider", es "Proveedor"). Texto de origem **nunca** diz IMDb/TMDB (FR-014).

`RatingBadge` (stub em `components/RatingBadge.tsx`): `value` fora de `(0, 10]`, `NaN`, `null` ou `undefined` →
`return null`. Sem `tabindex`, sem `button`, sem `aria-label` extra: é texto visível (`★ 7,4`); o leitor lê "7,4".

| Lugar | O que mostrar | Detalhe |
|---|---|---|
| Card (grade `VodCategoryScreen`, fileiras `VodShowcaseScreen` variante `portrait`) | `<RatingBadge value={item.provider_rating} />` dentro do `badge` do `ContentCard` | CSS `.poster-box .rating-badge`: canto **superior esquerdo** (`.fav-star` ocupa o superior direito; `.watched-badge`, o inferior esquerdo — `shared.css:365-376`). Só tokens (`var(--…)`), nenhum px/cor fixos. |
| Hero da vitrine (`renderHero`, `vod-hero-meta`) | `<RatingBadge value showSource />` como mais um `<span>` | Depois do ano. |
| Hero, **só série** | gênero (`provider_genres`) como `<span>` antes do grupo; fundo = `provider_backdrop_url ?? icon_url` em `<VodHeroArt>` | Filme continua com `icon_url`. Hero é `aria-hidden`. |
| Detalhe de filme e de série | `<RatingBadge value showSource />` ao lado de `.vod-detail-meta` | Não entra no `metaParts.join(' · ')` (seria um texto cru sem ★). |
| Card `wide` do "Continue assistindo" | **nada** | Usa backdrop em cache, não é o card da grade. |
| Busca global, Início, Favoritos | **nada** nesta feature | Fora do escopo; não mude `HomeContent`/`SearchScreen`. |

## 6. Precedência (FR-008)

A listagem é o valor **imediato**. O detalhe continua lendo `useTitleMetadata` (provedor `get_*_info` → TMDB) e **não
foi alterado** para gênero/fundo: o que ele obtém já prevalece porque é a única fonte lida ali. Portanto não há troca
de lógica; o único comportamento novo no detalhe é a linha de nota. O hero (vitrine) nunca consulta o detalhe: ao
focar, só lê o que o item já carrega (constituição: focar não dispara consulta externa; FR-013).
