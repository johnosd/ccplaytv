# Lógica: o botão "Trailer" no detalhe de filme e de série

Feature 033. Código: `tv-web/src/features/movies/MovieDetailScreen.tsx`,
`tv-web/src/features/series/SeriesDetailScreen.tsx`, helper puro novo
`tv-web/src/features/vod/trailerAction.ts`. Contrato:
`MovieDetailScreen.trailers.contract.test.tsx`.

## 1. Posição (FR-001)

Nada muda na ordem das ações nem no id `'trailer'`:

- Filme: `[Continuar|Assistir] [Reiniciar?] [Minha Lista] [Trailer] [Marcar assistido]`
- Série: `[Continuar|Assistir TX:EY] [Minha Lista] [Trailer]`

A ação primária continua no índice 0; o botão Trailer continua no mesmo índice
em todos os estados.

## 2. Estado (`trailerActionState` — puro, em `features/vod/trailerAction.ts`)

```ts
type TrailerActionState =
  | { status: 'checking' }
  | { status: 'available'; candidates: TrailerCandidate[] }
  | { status: 'unavailable'; tmdbConfigured: boolean }

function trailerActionState(input: {
  metadata: TitleMetadataView | undefined
  checking: boolean
  tmdbState: TmdbState | undefined
}): TrailerActionState
```

- `metadata?.trailers?.length > 0` → `available` (mesmo se ainda atualizando: um
  candidato conhecido já serve).
- senão, `checking` → `checking`.
- senão → `unavailable`, `tmdbConfigured = tmdbState !== undefined && tmdbState !== 'not_configured'`.

`checking` vem das consultas, calculado na tela:

- **Filme**: `metadataQuery.isFetching || metadataQuery.data === undefined`.
- **Série**: o mesmo **ou** `episodesQuery.isPending` — a metadata da série só
  fica completa depois que o `seriesLoader` grava o `get_series_info` e
  `useSeriesEpisodes` invalida `title-metadata` (D-009 da 032). Sem isso o botão
  piscaria "indisponível" antes do trailer chegar.

`tmdbState` = `useTmdbStatus().data?.state` (lê só IndexedDB, nunca rede).

## 3. Rótulo e classe

| Estado | Texto | Classe |
| --- | --- | --- |
| `checking` | `Trailer…` | `is-soft-disabled` |
| `available` | `trailerButtonLabel(candidates[0])` — `▶ Trailer`, `▶ Trailer · Inglês`, `▶ Teaser`… | — |
| `unavailable` | `Trailer — indisponível` | `is-soft-disabled` |

A ação é um `div` como as demais; `aria-disabled="true"` nos estados
soft-disabled (FR-015 da 028: controle soft-disabled precisa se declarar).

## 4. OK (`onSelect` com a ação `trailer` focada)

| Estado | Efeito |
| --- | --- |
| `checking` | toast "Consultando trailer" |
| `unavailable` | toast "Trailer indisponível para este título" + (se `!tmdbConfigured`) " — configure o TMDB em Integrações para encontrar mais trailers." |
| `available` | `setTrailerOpen(true)` — a menos que `playing` (PlayerLayer montado) ou o trailer já esteja aberto (FR-012) |

Nunca mais `getComingSoon('trailer')` — a entrada sai de `comingSoon.ts` (FR-021).

## 5. Camada

```tsx
{trailerOpen && trailerState.status === 'available' && (
  <TrailerLayer title={nome} candidates={trailerState.candidates} onClose={() => setTrailerOpen(false)} />
)}
```

- O detalhe continua montado por baixo com `row === 'actions'` e `actionFocus`
  intactos — fechar devolve o foco ao botão sem restaurar nada (FR-014).
- Enquanto aberta, o `useRemoteNav` modal da camada engole as teclas; o do
  detalhe não reage.
- `onClose` NÃO invalida `user-state` nem nada do catálogo: ver trailer não muda
  estado (FR-016). Diferente do `onClose` do `PlayerLayer`.
- Se `trailerState` deixar de ser `available` com a camada aberta (catálogo
  relido), a camada fecha — condição já no JSX acima.

## 6. Série: episódio tocando

O trailer só é alcançável com o foco na linha de ações do hero — com o
`PlayerLayer` aberto (episódio, autoplay, contagem regressiva) o teclado é dele.
A guarda `if (playing) return` cobre a janela entre um OK repetido e o render.
