# Lógica — detalhe de filme/série com metadata (feature 032, US1)

Telas: `MovieDetailScreen.tsx`, `SeriesDetailScreen.tsx` (mesma regra).
Contrato: `MovieDetailScreen.metadata-tmdb.contract.test.tsx`.

## 1. Dados

`useTitleMetadata(itemId)` (em `catalogApi.ts`, já criado como stub
funcional). A tela **nunca** espera por ele: sem `data`, renderiza como
hoje; com `data`, acrescenta os blocos. Foco não muda quando `data` chega
(FR-005).

## 2. Hero

Ordem visual: backdrop (atrás), eyebrow, título, meta, **sinopse**,
ações.

- **Backdrop**: `<img className="vod-detail-backdrop" alt="">` **filho**
  de um contêiner dentro do `.screen.vod-detail` — nunca `background-image`
  no próprio `.screen` (a regra `:root.video-plane-visible .screen >
  *:not(.player-overlay) { visibility: hidden }` de `player.css` só esconde
  **filhos**; fundo no `.screen` pintaria sobre o vídeo do AVPlay). Erro de
  carregamento (`onError`) remove o backdrop (FR-008). Gradiente por token.
  **Selo do backdrop (FR-022, T046):** imagem cuja origem é o TMDB leva
  `Dados: TMDB` (`.vod-detail-backdrop-origin`, canto do hero), **fora** do
  contêiner `aria-hidden` (a origem é lida) e some junto com a imagem se ela
  falhar; a do provedor não leva selo.
- **Sinopse**: `.vod-detail-synopsis` com `-webkit-line-clamp: 3`.
- **"Ver mais"**: `<button>` com texto "Ver mais", presente só quando
  `synopsis.value.length > SYNOPSIS_PREVIEW_CHARS` (**220**). Regra
  determinística por comprimento, não por medição de layout (jsdom não
  mede; a TV mede diferente do navegador).
- **Selo "Dados: TMDB"** (FR-022): ao lado de cada bloco cuja origem é
  `tmdb`, texto discreto `Dados: TMDB`. Sinopse com `language` →
  "(em {idioma})" via `Intl.DisplayNames(['pt-BR'], {type:'language'})`.

## 3. Foco (linhas)

`row: 'more' | 'actions' | 'tabs'`. Inicial: `actions`, índice 0.

| Em | Tecla | Vai para |
| --- | --- | --- |
| `actions` | ↑ | `more` (se "Ver mais" existe; senão fica) |
| `more` | ↓ | `actions` (mesmo índice de antes) |
| `more` | OK | abre o modal da sinopse |
| `actions`/`tabs` | como hoje | — |

## 4. Modal "Sinopse completa"

`<Modal ariaLabel="Sinopse completa">` com o texto completo num
contêiner `.no-scrollbar` rolável por ↑/↓ (`scrollBy` de ~1/3 da altura).
RETURN (`onBack`) fecha e o foco **continua** em `more` (a linha não muda
ao abrir, então fechar já "devolve"). OK no modal também fecha.

## 5. Abas Detalhes e Elenco

**Detalhes** acrescenta, só com valor real: Gênero, Duração (`h min`, minutos
truncados), Direção, País, Elenco (texto). Mantém os fatos que já existem (Tipo,
Categoria, Ano, Adicionado em, Disponível).

**Elenco** (R-012, ad-hoc T044 — pedido do usuário depois da passada física) é uma
aba **real**, sem `softDisabled`: OK troca o painel (`activateTab` aceita `cast`).
`CastPanel` lista os nomes (`castNames`: separa por `,`/`;`, sem repetição nem
vazio, ordem preservada), com o selo `Dados: TMDB` só se veio de lá. Sem elenco
informado: "O elenco deste título não foi informado." (ou "Carregando o elenco…"
enquanto `useTitleMetadata.isLoading`) — nunca nome inventado. O foco continua
na fileira de abas. Só texto: páginas de ator navegáveis e **Semelhantes**
(`similar`, ainda mock) são o item 45.

## 6. Série

Mesmo hero/linhas em `SeriesDetailScreen`; a aba inicial continua
"Episódios" (abas: Episódios, Detalhes, Elenco, Semelhantes-mock). Duração exibida
como "~{n} min por episódio" quando vier de `episode_run_time`.

**Sinopse do episódio focado (FR-028, T041–T042):** `.vod-episode-synopsis`, entre a
linha da temporada e a lista, mostra `EpisodeOut.synopsis` do episódio focado —
dado **já guardado** pelo `seriesLoader`, então mover o foco nunca faz requisição.
A faixa só existe se algum episódio da temporada tem sinopse e então reserva
3 linhas (a lista não pula); episódio sem sinopse deixa a faixa vazia — nunca cai
na sinopse da série. Fora da lista de episódios a faixa fica vazia.
