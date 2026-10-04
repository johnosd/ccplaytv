# Lógica — Top 10 da semana e Dica (feature 057)

Regras que um executor poderia errar. Os testes de contrato travados (`discoveryRules.*.contract.test.ts`,
`tmdbDiscovery.*.contract.test.ts`, `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`) são a definição executável; este arquivo
explica o porquê e o "como". Os stubs já existem: `lib/metadata/tmdbDiscovery.ts`, `lib/metadata/discoveryRules.ts`,
`useWeeklyTop10`/`useDailyTip`/`DiscoveryPick` em `features/catalog/catalogApi.ts`, `hasTop10`/`hasTip`/`'tip'` em `vodShowcaseRows.ts`.

## 1. Fonte e requisições (`tmdbDiscovery.ts`)

Só o TMDB, só pela chave BYOK (feature 032), só por `tmdbGet` (`tmdbConnector.ts`) — nunca `fetch` direto, nunca `console.*`.

| Carregador | Endpoint | Parâmetros | Guarda |
| --- | --- | --- | --- |
| `loadWeeklyTrending(kind)` | `/trending/movie/week` ou `/trending/tv/week` | `language` (idioma do app → `APP_LANGUAGE_LOCALE`) | as `TRENDING_LIMIT` (10) primeiras posições, `rank` = índice + 1 |
| `loadTipPool(kind)` | `/discover/movie` ou `/discover/tv`, páginas `1..TIP_PAGES` (8) | `language`, `sort_by=popularity.desc`, `include_adult=false`, `vote_average.gte=7`, `vote_count.gte=TIP_MIN_VOTES[kind]`, filme: `primary_release_date.gte=<anoCorrente−15>-01-01`, série: `first_air_date.gte=<anoCorrente−15>-01-01` | todos os títulos das páginas obtidas, `rank` = ordem de chegada |

- Mapeamento (filme / série): `id`; `title` / `name`; `original_title` / `original_name`; `release_date` / `first_air_date` → `year` por
  `yearOfDate` (`tmdbMatch.ts`); `vote_average`, `vote_count`, `popularity` (número finito, senão `0`). Item sem `id` numérico ou sem
  título legível é descartado **antes** de contar a posição (a posição é a do item no resultado do TMDB, não a do filtrado: descartar
  não renumera os demais; na prática o TMDB sempre traz os campos).
- Páginas do `discover`: a 1ª é obrigatória (falhou ⇒ falha geral); as demais são best-effort, em lotes de até 4 em paralelo; o que
  chegou é o que se guarda. Sem resultados ⇒ falha.
- **Resultado** (`DiscoveryResult`): `{ status: 'ok'|'no_key'|'unavailable', titles, stale }`. Os carregadores **nunca lançam**.
  - sem credencial → `{ status:'no_key', titles:[], stale:false }`, **zero** requisição (nem leitura de cache: `removeTmdbKey` já a esvazia);
  - `credential.state === 'refused'` ou `pausedUntil > now` → **zero** requisição; devolve o cache guardado, se houver (`ok`, `stale` conforme o período), senão `unavailable`;
  - período vigente em cache → devolve o cache, `stale:false`, **zero** requisição;
  - senão consulta; sucesso → grava e devolve `ok`/`stale:false`; falha (`TmdbError` ou qualquer exceção) → cache de outro período se houver
    (`ok`/`stale:true`), senão `unavailable`. Erro de serviço atualiza o estado exibido como em `tmdbPeople.ts` (`markTmdbState`, exceto `not_found`); sucesso após
    estado diferente de `connected` marca `connected`.
- Uma obtenção por (banco, fonte, tipo, idioma) de cada vez: `inFlight` `Map` como em `tmdbPeople.ts` (FR-016).
- Guardar só dados públicos do TMDB (nada da credencial, nenhuma URL de imagem: o pôster que a pessoa vê é o da lista).

## 2. Cache (`db.ts` v16, `discoveryCache`)

```ts
interface DiscoveryCacheRecord {
  id: string               // `${source}:${kind}:${language}` — source = 'trending' | 'pool'
  source: 'trending' | 'pool'
  kind: 'movie' | 'series'
  language: AppLanguage
  periodKey: string        // trending: weekKey(now); pool: dia local `AAAA-MM-DD` (função local de tmdbDiscovery.ts — ver "Camadas" abaixo)
  fetchedAt: number
  titles: DiscoveryTitle[]
}
```

- `this.version(16).stores({ discoveryCache: 'id' })`; sem `.upgrade()` (tabela nova). Sem dependência de fonte/geração (dado do TMDB, não da lista).
- `weekKey(now)`: semana ISO (segunda a domingo) no **fuso local**, `AAAA-Www`; o ano é o ano ISO (31/12 pode ser semana 1 do ano seguinte).
- Período vigente ⇔ `record.periodKey === período de now` **e** `language` igual (a chave do registro já inclui o idioma).
- `removeTmdbKey` (`tmdbKeyRepository.ts`) passa a incluir `discoveryCache.clear()` na mesma transação (a descoberta veio do TMDB — FR-014 da 032).
- O cruzamento com a lista **não** é guardado: refaz-se a cada leitura do índice (a lista muda; o TMDB não).

**Camadas (D-014)**: nada em `src/lib/` importa de `src/features/` (o repositório inteiro respeita isso). Por isso `tmdbDiscovery.ts` e
`discoveryRules.ts` são autossuficientes: trazem uma função de dia local (`AAAA-MM-DD`, mesma saída de `dayKey` de `ratedSelection.ts`), um `fnv1a32`
próprio (mesmo algoritmo de `ratedSelection.ts`, 6 linhas) e normalizam nota (`0 < n ≤ 10`, finita) e data de adição (finita) localmente, no mesmo formato de
`validProviderRating`/`finiteAddedAt` de `vodShowcase.ts`. Os **hooks** (`features/catalog/catalogApi.ts`) podem importar `dayKey` de `features/vod/ratedSelection.ts`.
Não mexa em `ratedSelection.ts`/`vodShowcase.ts` por causa disto.

## 3. Cruzamento com a lista (`discoveryRules.ts`: `versionTier`, `matchDiscoveryTitles`)

Entrada: títulos do TMDB **de um tipo** e os registros da lista **do mesmo tipo** (o hook passa só o índice daquele tipo — FR-010).

- **Chave local** = `comparableTitle(nomeSemLegendadoDublado)|ano`. O nome é o declarado pela fonte (`record.originalName`, como a 035);
  antes de `comparableTitle` remova as palavras soltas `legendado`/`dublado` (`/\b(legendado|dublado)\b/gi`), que `normalizeTitle` não conhece
  (ele já tira `[...]`, `(...)`, ` - AAAA` final e `4K UHD FHD HD SD H265 HEVC DV HDR LEG DUB DUAL NAC`).
  Ano local = `year` do registro, senão `yearHintFromTitle(nome)`; sem ano ⇒ o registro não entra.
- **Chave do TMDB**: para `title` e para `originalTitle` (se houver), `comparableTitle(x)|year`; sem `year` ⇒ o título não casa.
  **Ano exato** (nunca ±1 — emenda R-012 da 035: homônimos vizinhos abriam o filme errado).
- **Escolha entre cópias** (mesma chave): menor `versionTier` → maior nota válida (régua de `validProviderRating`, local por D-014; ausente por último) → `added_at` maior
  (finito, ausente por último) → a primeira da entrada. `versionTier`: `1` se o nome casa `/\[\s*(l|leg|legendado)\s*\]|\(\s*(leg|legendado)\s*\)|\blegendado\b|\b(4k|uhd|2160p)\b/i`, senão `0`.
- **Um título da lista serve a um título do TMDB só** (corrigido na execução, o contrato manda): percorra os títulos na ordem recebida; se a chave
  (título comparável + ano) escolhida já foi usada por um título anterior, o seguinte fica de fora — **não** tenta outra cópia da mesma chave.
- Saída na ordem de `titles`. **Nunca muta** as entradas.
- Desempenho: o índice tem dezenas de milhares de registros e `comparableTitle` é regex. Memoize a chave local por registro (`WeakMap<object, string|null>`
  quando o item é objeto) — Top 10 e Dica do mesmo tipo reaproveitam. Constroi um `Map<chave, registros[]>` uma vez por chamada; o laço dos títulos só consulta o mapa.
  Isto é, **nunca** `resolveTmdbTitles` (lê o tipo inteiro do IndexedDB a cada chamada e escolhe a primeira cópia, sem preferir versão).

## 4. Top 10 (`selectTop10`)

- Recebe os `MatchedTitle` na ordem do ranking; devolve `[{ local, rank: title.rank }]` com no máximo `DISCOVERY_LIMIT` (10) e **sem renumerar** (posições ausentes ficam ausentes: 1, 3, 5...).
- Menos de `TOP10_MIN` (3) ⇒ `[]` (fileira ausente).

## 5. Dica (`selectTip`)

Candidato válido: `voteAverage ≥ TIP_MIN_VOTE_AVERAGE (7)` **e** `voteCount ≥ TIP_MIN_VOTES[title.kind]` **e** `year` conhecido com
`anoCorrente − TIP_YEARS ≤ year ≤ anoCorrente` (`anoCorrente` = ano local de `now`; ano futuro fica de fora). Menos de `min` (`TIP_MIN` = 5) válidos ⇒ `[]`.

Sorteio ponderado, **determinístico** (mesma semente + mesmos candidatos ⇒ mesma escolha, em qualquer ordem de entrada):

```ts
const u = (fnv1a32(`${seed}|${title.tmdbId}`) + 1) / 4294967297   // fnv1a32 local de discoveryRules.ts (D-014); u ∈ (0,1)
const weight = Math.sqrt(Math.max(title.popularity, 1))             // popularidade pesa, sem deixar 3 blockbusters ganharem sempre
const key = -Math.log(u) / weight                                    // chave de Efraimidis–Spirakis: menor chave = sorteado
// ordene por (key, tmdbId) e tome os `limit` primeiros; essa ordem é a de exibição
```

- Um candidato novo (nova categoria obtida) só entra se a chave dele for menor que a de algum escolhido: poucos trocam no mesmo dia (como R-012 da 056).
- Semente do hook: `` `${dayKey(now)}|${kind}|${sourceId}` ``; `now` é fixado **uma vez por montagem** da tela (`useState(() => Date.now())`), para a virada do dia com a
  tela aberta não trocar cards sob o foco (edge case da spec).
- Popularidade, nota e ano **não** viram ordem de exibição; só a chave do sorteio.

## 6. Hooks (`catalogApi.ts`: `useWeeklyTop10`, `useDailyTip`)

```ts
const language = useLanguage()
const [now] = useState(() => Date.now())
const tmdb = useQuery({
  queryKey: ['tmdb-discovery', 'trending' /* ou 'pool' */, kind, language],
  queryFn: () => loadWeeklyTrending(kind, { language }),        // nunca lança
  enabled: sourceId !== null,
  staleTime: 30 * 60 * 1000,                                    // o carregador decide pelo período; isto só evita reler o Dexie a cada montagem
})
const titles = tmdb.data?.titles
const index = useQuery({
  queryKey: ['catalog-search-index', sourceId, kind],           // MESMA chave de useTopRated/useRecentlyAdded: o índice é compartilhado e a pré-carga (038) o invalida
  queryFn: () => loadSearchIndex(sourceId as string, kind),
  enabled: sourceId !== null && titles !== undefined && titles.length > 0,   // sem TMDB (sem chave/cache) o índice NÃO é lido por causa destas fileiras
  staleTime: 60_000,
  refetchOnMount: false,                                        // quem já tem o índice em cache não força releitura (as telas hero já o fazem com 'always')
  select,                                                       // estável (`useCallback` por [titles, kind, sourceId, now])
})
```

- `select` roda `matchDiscoveryTitles` sobre `index.entries` lendo `entry.record` (`originalName`, `year`, `providerRating`, `addedAt`, `id`), depois `selectTop10` / `selectTip`,
  e só então `toItemOut(record, kind)` nos ≤ 10 escolhidos. Devolve `{ items | picks, coveredCategories, totalCategories }`.
- Retorno de `useWeeklyTop10`: `{ data: DiscoveryPick[] | undefined, coveredCategories, totalCategories, isLoading }`; `useDailyTip`: `data: CatalogItemOut[] | undefined`. `data` é `[]` quando a regra manda ausente.
  `isLoading` = qualquer das duas consultas carregando; **nenhum estado de carregamento vira fileira** (fileira só existe com dado).
- Idioma entra na chave do TMDB (054): trocar o idioma recarrega; o cache por idioma guardado antes continua valendo se a pessoa voltar.
- Nenhuma invalidação nova: a pré-carga já invalida `['catalog-search-index', sourceId]`; o TMDB não muda por isso.
- `invalidateQueries(['tmdb-status'])` depois de o carregador marcar estado (como `useTitleMetadata`) — Integrações e dock releem.

## 7. Tela hero (`vodShowcaseRows.ts`, `VodShowcaseScreen.tsx`, `vod.css`, i18n)

- `buildShowcaseRows` — ordem: `continue` → `top10` (só `hasTop10`) → `favorites` → `added` → `rated` → `tip` (só `hasTip`) → `because` (slot) → categorias.
  - `top10`: `{ kind:'items', title: t(movies ? 'showcase.row.top10Movies' : 'showcase.row.top10Series'), format:'top10', seeAll:null, slotId:null }`.
  - `tip`: `{ kind:'items', title: t(movies ? 'showcase.row.tipMovies' : 'showcase.row.tipSeries'), format:'poster', seeAll:null, slotId:null }`.
  - o slot `top10` (e `slotRow` para ele) **sai**; `because` continua slot. `hasTop10`/`hasTip` ausentes = `false`.
- Tela: `const top10Query = useWeeklyTop10(sourceId, copy.kind)`, `const tipQuery = useDailyTip(sourceId, copy.kind)` (`copy.kind` é `'movie'|'series'` aqui — `FavoritableKind` inclui `channel`, então faça o estreitamento).
  `hasTop10: top10.length > 0`, `hasTip: tip.length > 0`.
- `entriesOf`: `top10` → `plainEntries(picks.map(p => p.item))`, `tip` → `plainEntries(tip)`, onde `plainEntries` = `items.slice(0, DISCOVERY_LIMIT)` mapeados para `ItemEntry`, **sem** `SEE_ALL_ENTRY`
  (D-007: nenhuma das duas tem "Ver tudo"). `rankById = new Map(picks.map(p => [p.item.id, p.rank]))`.
- `renderEntry`: no `top10`, `<ContentCard variant="portrait" … rank={rankById.get(entry.item.id)} />`; o selo de nota do provedor segue como nas outras fileiras.
  Atualize o comentário de `ContentCard.rank` (hoje diz "nunca um ranking que o app calcule": agora é a posição real do ranking do TMDB, ainda decorativa/`aria-hidden`).
- Cabeçalho da fileira (`vod-row-head`): para `top10`/`tip` acrescente `<span className="vod-row-source">{t('showcase.source.tmdb')}</span>` (FR-012) e, enquanto
  `covered < total && total > 0`, o aviso `.vod-row-coverage` com `showcase.ratedCoverage` (texto genérico "Com base em X de Y categorias"; D-012). CSS: `.vod-row-source` irmão de `.vod-row-coverage` (`margin-right: auto` só em um dos dois), tokens, `--fs-caption`, `--text-annotation`.
- Hero: `heroRowKey === 'top10'` → eyebrow `showcase.eyebrow.top10`; `'tip'` → `showcase.eyebrow.tip` (ambos citam TMDB).
- `ShowcaseRowKey` ganhou `'tip'`; `vodShowcaseFocus.ts` **não muda** (linhas de itens sem "Ver tudo" já são elegíveis: `isEligible` exige ao menos um id ≠ `SEE_ALL_ID`).
- i18n (pt/en/es, em `messages/vodShowcase.ts`): `showcase.row.tipMovies` ("Dica de filme"), `showcase.row.tipSeries` ("Dica de série"), `showcase.source.tmdb` ("Fonte: TMDB"),
  `showcase.eyebrow.top10` ("Top 10 da semana · TMDB"), `showcase.eyebrow.tip` ("Dica · TMDB"). Os títulos `top10Movies`/`top10Series` já existem.
- `comingSoon.ts`: remover `vod-top10-movies` e `vod-top10-series` (e as mensagens nos três idiomas e as linhas de `comingSoon.test.ts`); manter `vod-because`.
  Remova também o que só existia para o slot Top 10 em `VodShowcaseScreen.tsx` (`SLOT_CARD_COUNT.top10`, `.vod-ghost-rank`) se sobrar sem uso — o slot `because` usa o ramo `other`.

## 8. Início (`HomeContent.tsx`, `appNav.ts`, `home.css`)

- Ordem: hero → continue → mylist → channels → **top10Movies → top10Series → tipMovies → tipSeries** → ai → dock. `RowKey`/`ALL_ROWS` ganham as 4 chaves.
- Cada uma é um rail como os existentes: `<section className="home-row" aria-label>` + `<h2 className="home-row-title">` + `.home-row-source` (TMDB) + `Rail` + `ContentCard portrait`
  (Top 10 com `rank` e largura de item maior, `RANKED_WIDTH`, CSS em `home.css` espelhando `.vod-screen .content-card--ranked`/`-rank`, com tokens; o CSS atual só vale sob `.vod-screen`).
- Sem skeleton e sem slot: a linha só existe com dado (`rowExists[...] = items.length > 0`), então o foco nunca para numa linha vazia; `effectiveRow` já cai na anterior se a atual some.
- Um `useIdFocus` por linha (hooks fixos, sem condicional); OK → `onOpenItem(item, { zone:'rail', rail:'top10-movies'|'top10-series'|'tip-movies'|'tip-series', itemId: item.id })`.
- `HomeFocus` (`appNav.ts`): a união de `rail` ganha esses 4 valores — **só acréscimo**; os contratos travados de 023/024 e `HomeContent.test.tsx`/`appNav.test.ts` não podem quebrar. `HomeScreen.tsx`/`App.tsx`
  só repassam `initialFocus`; confira se há `switch`/mapa sobre `rail` que precise dos novos valores.
- Aviso de cobertura parcial no Início: igual ao da hero (`.home-row-coverage`), enquanto `covered < total`.
- Os 4 hooks rodam com o `sourceId` ativo; sem chave TMDB custam uma leitura do Dexie cada e **não** leem índice nenhum.

## 9. O que NÃO fazer

- Não usar IMDb em lugar nenhum (nome, rótulo, `imdb_id`, nota). A nota nos cards continua a do provedor, com o rótulo da 055/056.
- Não consultar o TMDB ao focar; não iniciar consulta fora de abrir a tela (Início ou hero).
- Não mostrar título do TMDB que não está na lista; não completar o Top 10 descendo no ranking; não renumerar.
- Não guardar o cruzamento, URL de imagem, nem nada da credencial no `discoveryCache`; não logar nada.
- Não ler `db.channels` direto (039): o cruzamento usa o índice de busca (`loadSearchIndex`), que já passa pelo `catalogRepository`.
- Não criar "Ver tudo", "Em breve" ou cartão "Configure o TMDB" para estas fileiras; não mexer na ordem relativa das demais.
- Não editar os testes de contrato travados; as 5 emendas pontuais de 052/053/056 estão em R-001 do `plan.md` (únicas permitidas).
