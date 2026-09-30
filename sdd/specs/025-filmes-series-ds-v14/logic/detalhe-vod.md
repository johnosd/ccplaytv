# Lógica: detalhe de filme e de série no layout V14

Feature 025 — FR-004, FR-005, FR-033..FR-043, FR-046, US5, US6. Sem contrato
travado (P2, apresentação); coberto por testes de componente nos arquivos
existentes (`MovieDetailScreen.test.tsx`, `SeriesDetailScreen.test.tsx`) e
pelo E2E.

## 1. Raiz e plano de hardware

As duas telas passam a ter a raiz `<div className="screen vod-detail">`.
`.screen` já está coberto pela regra de transparência do plano de hardware
em `screens.css` (FR-005). A linha própria de `.movie-detail-layout` sai de
`screens.css` junto com o layout antigo, **depois** de confirmar por busca
que nada mais usa a classe. Sem topbar (FR-004): os detalhes não recebem
`shell`.

## 2. Estrutura

```
hero:   [capa PosterArt portrait fixa]  eyebrow (FILME / SÉRIE)
                                        TÍTULO
                                        meta: ano · categoria · (série: N temporadas · M episódios) · selo
                                        ações (pills, linha)
abas:   Tabs (022)
painel: conteúdo da aba ativa
```

- Nada de backdrop falso, sinopse fixa ou "Elenco: Desconhecido" (FR-036).
  Sem sinopse, o espaço fica sem bloco.
- Meta só com o que existe; campo ausente some, nunca "—" nem
  "Desconhecido".

## 3. Ações

Filme (FR-033), na ordem:

```
[Continuar de mm:ss | Assistir] [Reiniciar (só com retomada)] [Minha Lista | Na Minha Lista] [Trailer] [Marcar assistido | Desmarcar assistido]
```

Série (FR-038):

```
[Continuar TX:EY | Assistir TX:EY] [Minha Lista | Na Minha Lista] [Trailer]
```

- Foco inicial na ação primária (índice 0) — muda a regra atual do filme,
  que usava o índice 1 porque "Trailer" era a primeira. O índice da ação
  primária agora é fixo em 0, e "Marcar assistido" continua a última (019).
- "Minha Lista": `useFavoriteToggle(showToast)` (mesmo toast da grade) sobre
  o `CatalogItemOut` do detalhe; rótulo a partir de `useUserState(stableId)
  .isFavorite` (`useToggleFavorite` já invalida `['user-state', id]`).
- "Trailer": soft disabled (`is-soft-disabled`), focável; OK →
  `showToast('Em breve — ' + getComingSoon('trailer').message)`.
- Reproduzir continua exatamente como hoje (retomada, `startAtMs`, `PlayerLayer`,
  invalidações ao fechar).

### Ação primária da série

Função pura nova em `features/series/episodeNavigation.ts`:

```ts
export type SeriesPrimary =
  | { kind: 'resume'; episode: EpisodeOut; resumeSeconds: number }
  | { kind: 'start'; episode: EpisodeOut }

export function seriesPrimaryAction(
  seasons: Season[],
  stateFor: (episode: EpisodeOut) => UserStateRecord | null,
): SeriesPrimary | null
```

1. Entre os episódios com retomada (`isResumable(progressSeconds)`), o de
   maior `lastWatched` → `resume`.
2. Senão, o 1º episódio da 1ª temporada (ordem de `groupBySeason`) → `start`.
3. Sem episódios → `null` (a tela já está no estado "Episódios ainda não
   disponíveis").

Rótulo: `Continuar T2:E3` / `Assistir T1:E1` com `episodeCode(ep)` =
`T{s}:E{e}` com os dois números, `E{e}` só com episódio, senão o nome do
episódio. OK na ação primária = `openEpisode(ep)` (retoma se houver posição,
como hoje). O "próximo depois do último concluído" não entra: a spec
(US6/AC1) pede só retomada ou o primeiro.

## 4. Abas

- Filme: `Detalhes` (ativa), `Elenco`, `Semelhantes`.
- Série: `Episódios` (ativa), `Detalhes`, `Elenco`, `Semelhantes`.
- `Elenco`/`Semelhantes`: focáveis, soft disabled; OK → toast "Em breve"
  (`getComingSoon('cast')`, `getComingSoon('similar')`); a aba ativa não
  muda. Trocar de aba real só por OK (regra do `Tabs`, 022).
- `Detalhes` do filme: fatos que existem — Tipo "Filme", Categoria
  (`groupLabel`), Ano, "Adicionado em" (data curta pt-BR), "Disponível"/
  "Indisponível" (`playable`). Série: Temporadas conhecidas, Episódios
  conhecidos, Categoria, Ano, e o resumo da 019 ("Em dia" / "N de M
  assistidos", só com cobertura total, regra da 019).

## 5. Episódios (série)

- Linha de controle: botão "Temporada N ▾" (rótulo da `Season`) + texto
  "M episódios". Sempre focável; OK abre o modal mesmo com uma temporada só
  (sem beco sem saída; o modal mostra a única opção marcada).
- Modal de temporada: `Modal` (022), lista vertical das `seasons`, a atual
  com ✓ e foco inicial; ↑/↓ clamp; OK troca `seasonIdx`, fecha e deixa o
  foco no botão; RETURN fecha sem trocar. Trocar de temporada não toca rede.
- Lista: vertical, virtualizada (como hoje), cada linha com `ContentCard`
  landscape (292×164) + texto:
  - imagem: `episode.icon_url` → senão `series.icon_url` → senão fallback do
    `PosterArt`;
  - "TX:EY" (`episodeCode`), título, duração formatada se
    `duration_seconds`;
  - progresso: barra com `progressSeconds / duration_seconds` só com duração
    conhecida; senão "Continuar de mm:ss" (`logic/metadados-vod.md` §4);
  - selo "✓ Concluído" com `completedAt` (`episodeBadge`, inalterado).
  - Altura de linha fixa nova (`EPISODE_ROW_HEIGHT` ajustada à linha de
    164px + padding).
- Autoplay, contagem, troca de temporada no autoplay: **inalterados**
  (máquina `Mode` atual). `playNext` continua movendo `seasonIdx` e o foco.

## 6. Foco no detalhe

Linhas, de cima para baixo: `actions` → `tabs` → (só série com aba
Episódios) `season` → `episodes`.

| Onde | Tecla | Efeito |
|---|---|---|
| actions | ←/→ | move com clamp |
| actions | ↓ | `tabs`, na aba ativa |
| tabs | ←/→ | move o foco entre abas (não troca a ativa) |
| tabs | OK | troca a aba (real) ou toast "Em breve" (mock) |
| tabs | ↑ | `actions`, mesma ação de antes |
| tabs | ↓ | `season` (série, aba Episódios); nada no filme |
| season | OK | abre o modal |
| season | ↓ | `episodes`, 1º episódio (ou o focado antes) |
| season | ↑ | `tabs` |
| episodes | ↑ no 1º | `season` |
| episodes | ↑/↓ | move (inalterado) |
| episodes | OK | reproduz (inalterado) |
| qualquer | RETURN | `onBack()` (inalterado); com modal aberto, o modal fecha primeiro |

Estados de carregando/erro/vazio: os atuais, com `EmptyState`/`ErrorState`
e ação acionável por SELECT (inalterado no comportamento).
