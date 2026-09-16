# 08 — Reuso: Tela de Filmes (grid, card, detalhes e player)

Escopo: como o IPTVnator estrutura a área de filmes/VOD — grid de pôsteres,
card com metadados e badges, tela de detalhes em dois estados (browse/watch) e
as ações de reprodução — e o que dá para reaproveitar no CCPlay (React + Tizen
+ D-pad). O CCPlay **não tem nada construído ainda** para filmes além de mocks
(`MoviesScreen.tsx` e `MovieDetailScreen.tsx` com ruído estático e toast), então
este relatório é um **guia de construção** baseado no que o IPTVnator prova que
funciona.

## Estado atual do CCPlay

- `tv-web/src/features/movies/MoviesScreen.tsx`: grid de 6 colunas com
  `gridNextIndex` (navegação 2D correta) + pôster fake (`poster-box-noise`).
- `tv-web/src/features/movies/MovieDetailScreen.tsx`: backdrop fake +
  sinopse/elenco + dois botões ("Trailer", "Assistir") que só disparam toast.
- Mock em `tv-web/src/features/catalog/mockCatalog.ts` (`MockMovie`: id, title,
  year, genre, rating, dur, synopsis, cast).

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Card de pôster com fallback e badges (tipo, nota, assistido, progresso) | P0 |
| 2 | Skeleton de grid (placeholder por card) durante o carregamento | P0 |
| 3 | Grid virtualizado com navegação por foco (não só CSS grid) | P0 |
| 4 | Empty state distinto: "sem resultados" vs "categoria vazia" | P0 |
| 5 | Detalhe em dois estados: browse → watch (hero colapsa) | P0 |
| 6 | Hero: backdrop + pôster + título + descrição "ver mais" + meta + ações | P0 |
| 7 | Ação primária contextual: Play / Retomar (com posição) / Reiniciar | P0 |
| 8 | Badge de retomada/assistido no próprio card do grid | P1 |
| 9 | Infinite scroll com tail spinner + retry | P1 |
| 10 | Rating IMDb/nota no card (com procedência) | P1 |
| 11 | Restaurar foco/posição ao voltar do detalhe para o grid | P0 |

---

## 1. Card de pôster com fallback e badges (tipo, nota, assistido, progresso)

- **O que é:** cada card resolve o pôster com **fallback em cascata**
  (`poster_url` → `cover` → `stream_icon` → placeholder), normaliza URL de
  "blank icon" e mostra badges sobrepostos: tipo (filme/série), nota, cápsula
  de progresso e "assistido".
- **Onde está no IPTVnator:** `libs/portal/shared/ui/.../grid-list/grid-list.component.ts`
  (`resolvePoster`, `normalizeArtworkUrl` com `BLANK_ARTWORK_URL_PATTERN`,
  `formatGridRating`, `ProgressCapsuleComponent`, `WatchedBadgeComponent`) e
  `content-card.component.html`.
- **Por que reutilizar:** listas IPTV reais trazem URLs de pôster quebradas ou
  `blank-icon.png`. O fallback em cascata + regex de blank evita grids cheios
  de ícone quebrado — um dos maiores degradadores de qualidade visual.
- **Como adaptar/melhorar:** no CCPlay, criar um `PosterCard` React com a mesma
  cadeia de fallback; em TV, **reservar a área do pôster** (aspect-ratio 2/3)
  para o layout não pular quando a imagem chega (ADR-006 §4.1). Melhoria:
  carregar `loading="lazy"` + `decoding="async"` e cachear no IndexedDB.
- **Prioridade: P0** — é o átomo visual de toda a área de filmes.

---

## 2. Skeleton de grid (placeholder por card) durante o carregamento

- **O que é:** enquanto carrega, o grid mostra 12 cards-skeleton (thumb + duas
  linhas de título), sem bloquear a navegação por um spinner de página inteira.
- **Onde está no IPTVnator:** `grid-list.component.ts` (`skeletonRows` = 12;
  `@if (isLoading()) { grid-skeleton-card ... }`).
- **Por que reutilizar:** em TV, uma tela inteira de loading sem skeleton parece
  travada. O skeleton por card comunica "grade vindo" e mantém o layout estável.
- **Como adaptar/melhorar:** no CCPlay, renderizar `PosterSkeleton` (bloco com
  shimmer) enquanto `isLoading`; manter a mesma geometria do card real para
  zero reflow. Melhoria: shimmer com transição suave, mas cuidado com custo de
  CPU em Tizen (preferir bloco estático se a TV for limitada).
- **Prioridade: P0** — barato e melhora a percepção de fluidez.

---

## 3. Grid virtualizado com navegação por foco (não só CSS grid)

- **O que é:** o grid não monta todos os cards; renderiza a janela visível e
  anexa mais conforme o scroll/append, com `loading="lazy"` nas imagens.
- **Onde está no IPTVnator:** `grid-list.component.html` + o padrão
  `appInfiniteScroll` em `live-stream-layout.component.html` (grid "All Items"
  com `infiniteHasMore`/`infiniteLoadMore`). O CCPlay já planeja TanStack
  Virtual (ADR-006 §4.1).
- **Por que reutilizar:** catálogos reais têm milhares de filmes; montar todos
  os pôsteres estoura memória e framerate na TV.
- **Como adaptar/melhorar:** no `MoviesScreen`, usar TanStack Virtual com linha
  de tamanho fixo e o padrão "próximo índice → deslocar grade → focar"
  (`02-arquitetura.md` #2). Manter `gridNextIndex` como fonte de verdade do
  índice e a virtualização só como execução.
- **Prioridade: P0** — requisito de escala (item 5/7 do backlog).

---

## 4. Empty state distinto: "sem resultados" vs "categoria vazia"

- **O que é:** quando a busca não acha nada, mostra "sem resultados para X";
  quando a categoria está vazia, mostra "categoria vazia". São mensagens
  diferentes com ícone diferente.
- **Onde está no IPTVnator:** `grid-list.component.ts` (`@empty` →
  `PlaylistErrorViewComponent` com `NO_SEARCH_RESULTS` ou `EMPTY_CATEGORY`).
- **Por que reutilizar:** em TV o empty state precisa de **pelo menos um
  elemento focável** (senão o D-pad fica preso). Distinguir os dois casos dá
  orientação correta ("refine a busca" vs "adicione conteúdo").
- **Como adaptar/melhorar:** no CCPlay, criar `EmptyState` com título +
  descrição + CTA focável; reaproveitar nos três tipos (canais/filmes/séries).
- **Prioridade: P0** — junto com o grid (item 4 do `01-ui-ux.md`).

---

## 5. Detalhe em dois estados: browse → watch (hero colapsa)

- **O que é:** a tela de detalhes tem dois estados. **Browse:** hero no topo
  (backdrop + pôster + título + ações) e episódios embaixo. **Watch:** o hero
  colapsa, o player toma a largura total e os metadados reaparecem num bloco
  "About" abaixo. Escape fecha o player e volta a Browse.
- **Onde está no IPTVnator:** `libs/ui/components/.../portal-detail-shell/portal-detail-shell.component.ts`
  (`playbackActive` → `isWatch`; animação browse↔watch; `onEscape` com guardas
  de overlay/fullscreen) e `portal-detail-shell.component.html` (slots
  `detail-player`, `detail-episodes`, `detail-extras`).
- **Por que reutilizar:** é o padrão de ouro de apps de streaming (Netflix/
  Prime). O CCPlay hoje tem um detalhe **estático** com botão "Assistir" que
  não leva a player nenhum. A separação browse/watch é o que falta.
- **Como adaptar/melhorar:** no `MovieDetailScreen`, modelar `inlinePlayback`
  (null = browse, objeto = watch) como no IPTVnator; Enter em "Assistir" → AVPlay
  no slot do player; Escape → fecha player e volta ao hero. **Melhoria para TV:**
  em vez de só "colapsar", o hero pode virar uma **faixa fina** com o título e o
  player dominando a tela (mais adequado à distância do sofá).
- **Prioridade: P0** — é a estrutura central do detalhe.

---

## 6. Hero: backdrop + pôster + título + descrição "ver mais" + meta + ações

- **O que é:** o hero tem backdrop (com fallback para pôster borrado), pôster
  com placeholder, título, tags (gênero/ano), descrição com botão "ver mais"
  quando há overflow, grade de metadados e botões de ação — tudo em slots.
- **Onde está no IPTVnator:** `content-hero.component.html` (backdrop com
  `hero__backdrop--blurred`, `onBackdropError`/`onPosterError`,
  `isDescriptionExpanded` com `hasDescriptionOverflow`).
- **Por que reutilizar:** o CCPlay tem um `MovieDetailScreen` com backdrop de
  ruído e sinopse fixa. O IPTVnator mostra o refinamento: descrição truncada
  com "ver mais" (sinopses de TMDB são longas) e fallback de imagem.
- **Como adaptar/melhorar:** no CCPlay, trocar o ruído por backdrop real com
  fallback de pôster borrado; adicionar "ver mais" na sinopse. **Melhoria para
  TV:** o "ver mais" deve ser acionável por Enter (foco), não hover; e o texto
  precisa de tamanho de fonte maior que o desktop.
- **Prioridade: P0** — o hero é a primeira impressão do detalhe.

---

## 7. Ação primária contextual: Play / Retomar (com posição) / Reiniciar

- **O que é:** o botão principal muda conforme o estado: sem posição → "Play";
  com posição salva → "Retomar (1h 23min)"; e um botão secundário "Reiniciar"
  reaparece quando há retomada.
- **Onde está no IPTVnator:** `vod-details-route.component.html`
  (`play-btn--resume` com `formatPosition()`, `play-btn--restart`,
  `hasPlaybackPosition()`).
- **Por que reutilizar:** é o coração da experiência de filme. O CCPlay tem
  "Assistir" fixo. O estado "Retomar com posição" é o que faz o usuário voltar.
- **Como adaptar/melhorar:** no `MovieDetailScreen`, derivar a ação primária de
  `playbackPosition`: `null` → "Assistir"; posição → "Retomar (posição)" +
  "Reiniciar". A posição vem do histórico (item 10 do backlog). Em TV, o foco
  inicial deve cair na ação primária.
- **Prioridade: P0** — junto com o histórico (item 10 do backlog).

---

## 8. Badge de retomada/assistido no próprio card do grid

- **O que é:** o card do grid mostra uma cápsula de progresso (barra) quando há
  posição salva e um badge "assistido" (check/olho) quando concluído.
- **Onde está no IPTVnator:** `grid-list.component.ts` (`i.progress` →
  `ProgressCapsuleComponent`; `i.isWatched` → `WatchedBadgeComponent`).
- **Por que reutilizar:** o usuário identifica "já comecei" / "já vi" direto no
  grid, sem abrir o detalhe. O CCPlay planeja isso (ADR-005 §4 e item 10).
- **Como adaptar/melhorar:** no `PosterCard`, adicionar os dois slots de badge;
  em TV, o progresso deve ser uma **barra na base do pôster** (visível de longe),
  não um número pequeno.
- **Prioridade: P1** — quando o histórico existir.

---

## 9. Infinite scroll com tail spinner + retry

- **O que é:** ao rolar até o fim, anexa mais itens; há um spinner de "cauda"
  durante o append e um botão Retry quando o append falha.
- **Onde está no IPTVnator:** `grid-list.component.ts`
  (`isAppending` → spinner; `appendError` → `retryLoadMore`).
- **Por que reutilizar:** em TV, o scroll infinito deve ser **dirigido por
  foco** (focar o último card e anexar antes de chegar), não por wheel. O
  padrão de tail + retry dá feedback claro.
- **Como adaptar/melhorar:** no `MoviesScreen`, anexar a próxima página quando
  o foco se aproxima do fim (overscan), com tail spinner focável e Retry.
- **Prioridade: P1** — quando a API paginar filmes.

---

## 10. Rating IMDb/nota no card (com procedência)

- **O que é:** o card mostra a nota (estrela + valor formatado a 1 casa), com
  preferência por `rating_imdb` sobre `rating` genérico, e tooltip "IMDb".
- **Onde está no IPTVnator:** `grid-list.component.ts`
  (`resolveGridRating` = `rating_imdb` ?? `rating`; `formatGridRating`).
- **Por que reutilizar:** o CCPlay planeja ordenação IMDb (ADR-005 §5 e item
  15 do backlog). A regra "não chamar nota genérica do provedor de IMDb" é
  crucial (ADR-005 §5) — o IPTVnator faz exatamente isso: distingue as duas.
- **Como adaptar/melhorar:** no card, mostrar a nota só quando houver
  procedência conhecida; guardar `rating_source` (imdb/provider/tmdb) no modelo.
  Em TV, badge discreto com estrela + valor.
- **Prioridade: P1** — quando a integração de nota existir.

---

## 11. Restaurar foco/posição ao voltar do detalhe para o grid

- **O que é:** ao voltar do detalhe, o card que originou a navegação volta a ter
  foco e a janela virtual é restaurada.
- **Onde está no IPTVnator:** navegação de detalhe (`portal-detail-navigation.md`)
  e o cuidado com foco no `ChannelScrollFocusDirective`; no CCPlay é requisito
  da ADR-005 §3.
- **Por que reutilizar:** em TV, voltar do detalhe e cair no topo do grid é o
  maior "matador" de UX. O IPTVnator trata isso em toda navegação de detalhe.
- **Como adaptar/melhorar:** no `MoviesScreen`, guardar o índice focal no
  histórico de navegação do `App.tsx` e restaurá-lo no `back()`; a virtualização
  deve reposicionar a janela antes de focar.
- **Prioridade: P0** — barato de modelar agora, caro de corrigir depois.

---

## Resumo de melhorias CCPlay sobre o IPTVnator (específicas de TV)

1. **Foco, não hover** — tudo que no IPTVnator é tooltip/hover ("ver mais",
   botões de ação, rating) vira ação de Enter no CCPlay. Foco visível forte
   (glow/borda).
2. **Hero colapsa para faixa fina em watch** — em TV o player deve dominar a
   tela; o "About" do IPTVnator (desktop) pode virar uma faixa lateral ou ser
   ocultado no watch.
3. **Sem drag-and-drop, sem redimensionar** — favoritos por reordenação
   arrastável e width de rail do IPTVnator não se aplicam.
4. **Botão de ação grande e legível de longe** — o "Assistir/Retomar" precisa de
   contraste e tamanho de fonte de TV, não o botão compacto de desktop.
5. **Badge de progresso na base do pôster** — visível sem abrir detalhe, em
   escala de sala.
6. **Ações secundárias (favorito/download) como linha de ícones focáveis** —
   o IPTVnator usa ícones pequenos; em TV precisam de espaçamento e estado de
   foco claros.
