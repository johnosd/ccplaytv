# Lógica — Aba Semelhantes (detalhe de filme e de série)

Arquivos: `features/catalog/catalogApi.ts` (`useSimilarTitles`, stub),
`lib/metadata/similarTab.ts` (novo, puro), `features/vod/SimilarPanel.tsx` e
`features/vod/TitleSummaryModal.tsx` (novos), `MovieDetailScreen.tsx`,
`SeriesDetailScreen.tsx`. Contrato: `MovieDetailScreen.semelhantes.contract.test.tsx`.

## 1. Estado da aba (`similarTabStatus`, puro)

Entradas: `tmdbState` (`useTmdbStatus`), `metadata` (`useTitleMetadata`, a
MESMA consulta que o detalhe já montou — react-query compartilha), se a
resolução local ainda está rodando.

```text
tmdbState === 'not_configured'                → 'no_key'
metadata ainda não chegou                      → 'loading'
metadata.tmdbMatch === 'matched':
    similar ausente                            → 'loading'   (não deveria ocorrer depois da 035)
    similar.length === 0                       → 'empty'
    resolução local rodando                    → 'loading'
    senão                                      → 'ready'
metadata.tmdbMatch ∈ {'no_match','dead_id'}   → 'no_match'
tmdbMatch ausente e tmdbState ∈ {refused, offline, rate_limited} → 'unavailable'
tmdbMatch ausente (connected: série esperando o provedor, consulta em voo) → 'loading'
```

Dado já guardado vence estado ruim do serviço: um `matched` em cache aparece
mesmo com o TMDB offline agora.

`useSimilarTitles(itemId, enabled)` devolve `SimilarTabView`
(`{ status, titles, coverage }`). Só roda a resolução (`resolveTmdbTitles`
com `kinds = [kind do item]`) quando `enabled` (aba ativa) e há `similar` não
vazio. Query key sem nada secreto: `['similar-titles', itemId]`, `staleTime: 0`
(categorias abertas desde a última vez entram — mesmo padrão de "Todos").
**Nenhuma requisição externa** nasce aqui (FR-003/SC-005).

## 2. Textos (exatos — os contratos dependem de alguns)

| Estado | Texto | Focável |
| --- | --- | --- |
| cobertura (ready/empty) | `Procurado em X de Y categorias de filmes` / `… de séries` | — |
| loading | `Buscando títulos semelhantes…` | a aba |
| no_key | `Semelhantes vêm do TMDB. Configure uma chave do TMDB para ver títulos parecidos com este.` | botão **`Configurar TMDB`** |
| no_match | `Não foi possível identificar este título no TMDB, então não há semelhantes para mostrar.` | a aba |
| empty | `O TMDB não tem títulos semelhantes a este.` | a aba |
| unavailable | `Semelhantes está indisponível agora. Veja o estado do TMDB em Configurações › Integrações & BYOK.` | a aba |
| chip do não encontrado | `Não encontrado na sua lista` | — |

- O chip aparece **uma vez** como texto visível por cartão não encontrado; o
  nome acessível do cartão sai do conteúdo (título + ano + chip). Não
  duplicar o chip num nó de texto oculto (o contrato conta ocorrências).
- Atribuição (FR-023): `OriginTag origin="tmdb"` ("Dados: TMDB") no painel
  sempre que houver cartões ou fotos do TMDB.
- Estados sem cartão usam a própria fileira de abas como elemento focável
  (a aba continua `tv-focus` e ativável) — nunca um painel sem saída.

## 3. Foco (fileira `panel`)

- Fileiras do detalhe: `more` → `actions` → `tabs` → (`panel` | série:
  `season`/`episodes`).
- `↓` na fileira `tabs` entra em `panel` **só** se a aba focada é a ativa e o
  painel tem focáveis: cartões (`ready`) ou `Configurar TMDB` (`no_key`).
  Senão o foco fica na aba (contrato).
- Em `panel`: `←/→` movem entre cartões (`Rail` de `ContentCard` retrato);
  `↑` volta às abas. O foco do painel é guardado como **chave**
  (`focusKey`), nunca índice; a linha efetiva é derivada: chave ausente da
  lista atual → foco cai na fileira de abas (padrão de `HomeScreen`).
- OK num cartão **encontrado** → `onOpenTitle({ kind, itemId: localItemId },
  { tab: 'similar', focusKey: key })`.
- OK num cartão **não encontrado** → `TitleSummaryModal`.
- OK em `Configurar TMDB` → `onOpenTmdbSettings({ tab: 'similar' })`.
- Mover o foco não dispara nada além de re-render (FR-020).

## 4. `TitleSummaryModal`

`Modal` (feature 022) com: `PosterArt` (posterUrl), título, ano **uma única
vez** (ex.: linha de meta `2003`), sinopse (`overview`) ou
`Sinopse não informada pelo TMDB.`, a frase
`Este título não está nas categorias já abertas da sua lista.` e um botão
`Fechar` com `tv-focus`. **Sem** ação de assistir. OK ou RETURN fecham; o
foco do detalhe continua no mesmo cartão (é estado da tela, o Modal não o
mexe). O Modal já captura as teclas, então RETURN não chega ao `onBack` do
detalhe.

## 5. Mock

`similar` sai de `lib/comingSoon.ts` (e de `comingSoon.test.ts`, que passa a
esperar `getComingSoon('similar')` lançar). As abas perdem `softDisabled`.
