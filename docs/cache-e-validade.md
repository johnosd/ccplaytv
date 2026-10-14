# Cache e validade (TTL) no app da TV

Levantamento de 2026-10-10 sobre `tv-web/src`. Descreve o código daquela data. Se uma constante mudar, o código é a autoridade.

O app tem três camadas de cache, cada uma com sua regra:

1. **IndexedDB (Dexie)**: persiste entre sessões e tem prazos explícitos. É a única camada que guarda dados vindos da rede.
2. **React Query**: fica em memória, só durante a sessão. Quase tudo aqui lê do IndexedDB, então o cache só evita reler o disco.
3. **Memos de módulo**: ficam em memória e não vencem por tempo. São apagados por escrita, por evento ou por limite de tamanho.

Nenhuma camada guarda **bytes de imagem**. Não há Service Worker, `caches.open` nem `createObjectURL`: capas e backdrops dependem do cache HTTP do navegador da TV (veja a §4).

## 1. IndexedDB: dados persistidos

| Dado | Validade | Onde |
|---|---|---|
| Atualizar a lista ao abrir (reimportação silenciosa) | **10 min** desde a última sincronização bem-sucedida | `lib/catalog/freshness.ts`, `REFRESH_ON_OPEN_MIN_MS` |
| Itens de uma categoria (Xtream, sob demanda) | **24 h** (`isCategoryFresh`). Hoje é só uma garantia extra para sessões longas: a renovação normal vem da atualização ao abrir (feature 038). Categoria `eager` (M3U) nunca vence; é servida do disco até a fonte sincronizar de novo | `lib/catalog/freshness.ts`, `STALE_AFTER_MS` |
| Prefetch em segundo plano | Quando termina, olha de novo o que venceu a cada **10 min** | `lib/catalog/prefetch/prefetchScheduler.ts`, `RECHECK_WHEN_DONE_MS` |
| EPG | **12 h**; depois disso, abrir a fonte sincroniza o guia de novo | `lib/epg/epgStatus.ts`, `EPG_STALE_AFTER_MS` |
| Situação da conta do painel (validade/expiração) | **24 h**; depois disso, escolher a lista faz uma consulta leve (limite de 5 s) | `lib/catalog/sourceAccount.ts`, `ACCOUNT_CHECK_MAX_AGE_MS` |
| Metadata do provedor (`get_vod_info`/`get_series_info`) | **24 h** (reaproveita `isCategoryFresh`) **e** exige `PROVIDER_FIELDS_VERSION` igual a 2; mudar a versão invalida tudo | `lib/metadata/titleMetadata.ts`, `titleMetadataStore.ts` |
| Metadata do TMDB (inclusive "sem correspondência" e "id morto") | **182 dias**, pelos termos do TMDB. Também vence antes do prazo se o idioma do app mudar ou se faltarem campos de features novas (trailers 033, similar 035, certificações 061) ou a busca de vídeos for de uma versão antiga (`trailerVideosVersion`, sem pt-BR); nesses casos busca de novo uma vez | `lib/metadata/titleMetadata.ts`, `TMDB_CACHE_MS` |
| Filmografia de pessoa (TMDB) | **182 dias**. Em outro idioma conta como vencida, mas é usada se a nova busca falhar | `lib/metadata/tmdbPeople.ts` |
| Descoberta TMDB: Top 10 / trending | **Semana ISO** local (vira na segunda-feira). Se a nova busca falhar, mostra o antigo marcado `stale` | `lib/metadata/tmdbDiscovery.ts`, `weekKey` |
| Descoberta TMDB: Dica | **Dia local** (vira à meia-noite), com o mesmo comportamento em caso de falha | `lib/metadata/tmdbDiscovery.ts`, `localDay` |
| Entradas M3U guardadas (`storedEntries`) | Sem prazo. Valem pela geração da fonte e só são trocadas por uma nova importação | feature 014 |

Não é cache, mas tem prazo parecido: o TMDB pausado por rate limit fica **10 min** por padrão, no máximo **1 h** (`lib/metadata/tmdbKeyRepository.ts`, `RATE_LIMIT_PAUSE_MS` / `MAX_PAUSE_MS`).

## 2. React Query: memória da sessão

O cliente é `new QueryClient()` sem opções (`main.tsx`). O padrão é **`staleTime: 0`** (relê ao montar, mostrando o dado em cache enquanto isso) e **`gcTime: 5 min`** (o resultado sai da memória 5 min depois de nenhuma tela usá-lo).

Exceções (em `features/catalog/catalogApi.ts`, salvo indicação):

| Query | staleTime | gcTime | Observação |
|---|---|---|---|
| `['epg', …]` (programas do guia) | 5 min | padrão | Uma sincronização de EPG invalida `['epg']` (`App.tsx`) |
| Fileiras TMDB da vitrine (descoberta) | 30 min se `ok` e não `stale`; senão 0 | padrão | |
| Seleções da vitrine (Recém-adicionados, Top avaliados) | 60 s (`SHOWCASE_STALE_MS`) | 30 s | A chave inclui o dia, então vira à meia-noite |
| `cached-title-view` | 60 s | padrão | |
| Prévia de categoria | 10 s (`PREVIEW_STALE_MS`) | 30 s | |
| Índices de busca (global e "Todos") | 0 + `refetchOnMount: 'always'` | 30 s | Categorias abertas desde a última vez entram na próxima busca |
| Similares, filmografia, semente do "Porque você assistiu" (`becauseApi.ts`) | 0 | padrão | Leitura local e barata |
| Backdrops guardados (`cachedBackdrops.ts`) | padrão | 5 min | Veja a §4 |
| Contagem do "↺ Histórico" | padrão | 5 min | O comentário fala em `gcTime: Infinity`, mas o código usa 5 min. Um dos dois está desatualizado |
| Salvar chave TMDB (mutation) | — | 0 | |

## 3. Memos de módulo

| Memo | Limite | Quando é apagado |
|---|---|---|
| `blockMemo` (blocos de categoria lidos) | 2 blocos / 2.000 itens | Qualquer escrita na tabela, inclusive vinda de outra aba ou do Worker via `BroadcastChannel`. Um bloco só entra se não havia escrita pendente |
| `readProjectionMemo` (janela da categoria) | 8 chunks × 240 itens | Quando o contexto (fonte/categoria/revisão) muda, ou por invalidação explícita |
| Regras de acesso (feature 066) | 1 por fonte | Ao gravar uma preferência. O desbloqueio da sessão nunca vem do memo |
| Cor dominante da capa (`features/vod/useCoverColor.ts`) | LRU de 256 URLs | Ao fechar o app; guarda `null` também, para não tentar de novo |
| Normalização da busca (`catalogSearch.ts`) | `WeakMap` por item | Pelo coletor de lixo |

## 4. O caso do backdrop

São três coisas diferentes:

1. **A URL do backdrop** já é persistida por bastante tempo. Ela fica em `titleMetadata` no IndexedDB, como parte da metadata do TMDB (182 dias) ou do provedor (24 h, buscada de novo ao abrir o detalhe).
2. **Os 5 min (`gcTime`) de `useStoredBackdrops`** valem só para o resultado em memória de um `bulkGet` local. Ele existe para que, ao voltar à vitrine, o "Continue" já saiba seu formato (largo ou pôster) sem desenhar um e trocar pelo outro. A chave é o conjunto de `stableId`s da fileira, então cada combinação vira uma entrada. Com `gcTime: Infinity`, as entradas se acumulariam a sessão toda, e reler é barato (uma leitura no IndexedDB). Aumentar esse prazo só evita o estado "pendente" depois de mais de 5 min fora da tela; não poupa rede.
3. **Os bytes da imagem** não têm cache controlado pelo app. Dependem do cache HTTP do navegador da TV (cabeçalhos de `image.tmdb.org` ou do painel do provedor) e da política de descarte do Tizen. Se a TV baixar a imagem de novo, a causa está aqui, não nos 5 min.

Se o objetivo for que o backdrop apareça sem rede ou sem baixar de novo, o caminho é um cache de imagens próprio (por exemplo, guardar os bytes num `Blob` no IndexedDB, com limite de tamanho e despejo). Isso não existe hoje e teria custo de armazenamento na TV.
