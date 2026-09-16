# 09 — Reuso: Dashboard / Home (hero + rails)

Escopo: como o IPTVnator estrutura a tela inicial — hero de "continuar
assistindo" + rails horizontais (continue watching, ao vivo, favoritos,
recentes, fontes, TMDB) — e o que dá para reaproveitar na Home do CCPlay
(React + Tizen + D-pad). O CCPlay hoje tem uma Home de "Minhas Listas"
(fontes) sem nenhum hero nem rail de conteúdo; este relatório é o guia de
evolução dessa tela.

## Estado atual do CCPlay

- `tv-web/src/features/home/HomeScreen.tsx`: grade horizontal de fontes
  ("Minhas Listas"), com ações por card (ressincronizar/excluir) e
  empty-state = "adicionar lista". Navegação 2D por `focusRow`/`focusCol`.
- Não há hero de retomada, nem rails de conteúdo (filmes/séries/ao vivo).
- O backlog já prevê: item 10 (histórico/continuar assistindo), item 26
  (rails TMDB/trending + dashboard).

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Hero "continuar assistindo" (retomada direta) | P0 |
| 2 | Rails horizontais com dois layouts: `cover` (pôster) e `channel` (logo) | P0 |
| 3 | Cada rail resolve seus dados de forma independente | P0 |
| 4 | Rail vazio some; skeleton por rail, não gate de página inteira | P0 |
| 5 | "Ver todos" com contagem real + navegação para coleção | P1 |
| 6 | Scroll horizontal dirigido por foco (não por chevron de mouse) | P0 |
| 7 | Card de rail rico: progresso, badge de episódio, expiração de fonte | P1 |
| 8 | Empty-state de boas-vindas com CTA único | P0 |
| 9 | Fonte ativa na Home: status + expiração sem "abrir" | P1 |

---

## 1. Hero "continuar assistindo" (retomada direta)

- **O que é:** o topo da Home é um hero grande do item mais recente
  (filme/série), com backdrop + pôster + badges (S/E, nota, gênero) + barra de
  progresso + CTA "Continuar assistindo". Clicar leva direto à retomada.
- **Onde está no IPTVnator:** `workspace-dashboard-rails.component.html`
  (bloco `hero`, com `watchProgress`, `remainingLabel`, `episodeBadge`,
  `hero__cta`) e `docs/architecture/workspace-dashboard.md`
  ("hero() = globalRecentItems()[0]").
- **Por que reutilizar:** é o "cartão de visita" do app e o maior impulsionador
  de retomada. O CCPlay tem histórico no backlog (item 10) e ADR-005 §4; o
  hero é o consumidor natural desse histórico.
- **Como adaptar/melhorar:** na Home, quando houver `recentItems`, renderizar
  o hero como primeiro elemento focável (foco inicial nele). Em TV, o hero é
  **uma linha inteira** (não um card de canto): backdrop esticado, título
  grande e CTA focável. Sem item recente, o hero some (não mostra esqueleto
  eterno).
- **Prioridade: P0** — junto com o histórico (item 10 do backlog).

---

## 2. Rails horizontais com dois layouts: `cover` (pôster) e `channel` (logo)

- **O que é:** rails horizontais reutilizáveis com dois layouts visuais:
  `cover` = pôster 2:3 (filmes/séries); `channel` = linha compacta com logo +
  nome + "agora" + progresso (canais ao vivo). Logos de canal inflados em
  pôster 2:3 desperdiçam espaço, por isso o layout `channel`.
- **Onde está no IPTVnator:** `dashboard-rail.component.ts`
  (`DashboardRailLayout = 'cover' | 'channel'`) e o template com
  `rail__card--channel` vs pôster.
- **Por que reutilizar:** é a decisão de design mais importante do dashboard:
  **canais e filmes não usam o mesmo card**. O CCPlay tende a reusar o
  `PosterCard` para tudo; o IPTVnator mostra que canais ao vivo pedem linha
  horizontal (logo pequeno).
- **Como adaptar/melhorar:** no CCPlay, criar `Rail` com prop `layout:
  'cover' | 'channel'`; `cover` reusa o `PosterCard` do `08-tela-filmes.md`,
  `channel` é um `ChannelRow` compacto (logo + nome + agora). Em TV, ambos os
  layouts navegam horizontalmente com D-pad.
- **Prioridade: P0** — base de qualquer rail de conteúdo.

---

## 3. Cada rail resolve seus dados de forma independente

- **O que é:** cada rail (continue watching, live favorites, recentes, fontes,
  trending) busca e publica seus próprios dados; um rail lento **não esconde**
  os que já carregaram. Não há `dashboardReady` como gate de página inteira.
- **Onde está no IPTVnator:** `workspace-dashboard.component.ts` (regras 1–7 em
  `docs/architecture/workspace-dashboard.md`: "Rails render independently as
  their data sources resolve"; skeleton escopado por rail).
- **Por que reutilizar:** em TV, a percepção de fluidez vem de ver o primeiro
  rail aparecer rápido. Um gate de página inteira (esperar o mais lento) faz o
  app parecer travado.
- **Como adaptar/melhorar:** na Home, cada rail deve ter seu próprio
  `useQuery`/estado e seu próprio skeleton; nenhum `Promise.all` bloqueando a
  renderização da Home inteira.
- **Prioridade: P0** — princípio de arquitetura da Home.

---

## 4. Rail vazio some; skeleton por rail, não gate de página inteira

- **O que é:** rails sem dados **não renderizam** (`@if (items().length > 0)`);
  cada um tem seu skeleton escopado. Não existe "empty widget" com placeholder.
- **Onde está no IPTVnator:** `workspace-dashboard-rails.component.html`
  (`@if (... && cards().length > 0)`) e `skeletonSlots`.
- **Por que reutilizar:** um rail vazio com título "Continuar assistindo"
  seguido de nada é pior que nenhum rail. E o skeleton por rail comunica
  progresso sem bloquear o resto.
- **Como adaptar/melhorar:** no CCPlay, cada `Rail` renderiza `null` quando
  `items.length === 0`; o skeleton é interno ao rail.
- **Prioridade: P0** — regra simples que define a qualidade da Home.

---

## 5. "Ver todos" com contagem real + navegação para coleção

- **O que é:** cada rail tem um link "Ver todos" que, quando há mais itens que
  os exibidos, mostra a contagem total ("Ver todos (24)"); navega para a
  coleção correspondente (favoritos globais, recentes globais).
- **Onde está no IPTVnator:** `dashboard-rail.component.html`
  (`rail__see-all` com `totalCount` e `SEE_ALL_COUNT`).
- **Por que reutilizar:** em TV, "Ver todos" é o destino de saída do rail e
  precisa ser focável (Enter → coleção). O CCPlay ainda não tem coleções
  globais (favoritos/recentes), mas o link deve apontar para elas quando
  existirem.
- **Como adaptar/melhorar:** no `Rail`, um botão "Ver todos (N)" focável no
  fim do rail; o N vem do total real, não do comprimento exibido.
- **Prioridade: P1** — quando coleções globais existirem (itens 9/13).

---

## 6. Scroll horizontal dirigido por foco (não por chevron de mouse)

- **O que é:** o IPTVnator usa chevrons esquerda/direita (mouse) + scroll
  horizontal por clique. Em TV isso vira **foco dirige o scroll**: mover o
  foco para o próximo card rola o rail para trazê-lo à vista.
- **Onde está no IPTVnator:** `dashboard-rail.component.ts`
  (`scrollBy`, `canScrollLeft/Right` via ResizeObserver, `onScroll`) — padrão
  de mouse. O CCPlay já faz isso certo no `MoviesScreen`/`LiveScreen` com
  `gridNextIndex`.
- **Por que reutilizar:** o CCPlay não deve copiar os chevrons (mouse); deve
  manter o padrão de foco. Mas o IPTVnator entrega a lição: **um rail é uma
  lista 1D**, então a navegação é `left/right` = `±1` com scroll automático.
- **Como adaptar/melhorar:** no `Rail`, modelar `focusIdx` 0..N-1; `right` →
  `focusIdx+1` e `scrollIntoView` do card; `left` idem. `up/down` sai do rail
  para o hero/rail vizinho. Sem chevrons, sem arrastar.
- **Prioridade: P0** — a navegação é a alma da Home em TV.

---

## 7. Card de rail rico: progresso, badge de episódio, expiração de fonte

- **O que é:** cada card de rail carrega sinais úteis: barra de progresso de
  filme, badge "S1·E3" para série com posição salva, chip "LIVE" + progresso
  do programa atual em canais, e chip de expiração de fonte (âmbar/erro).
- **Onde está no IPTVnator:** `dashboard-rail.component.ts`
  (`DashboardRailCard`: `watchProgress`, `episodeBadge`, `nowPlaying*`,
  `expiryBadge`).
- **Por que reutilizar:** o CCPlay já mostra `formatStatus` da fonte na Home
  (texto de sincronização); o IPTVnator eleva isso a **chips visuais** e
  adiciona progresso/episódio. Em TV, chips pequenos legíveis de longe.
- **Como adaptar/melhorar:** no card de fonte do CCPlay, trocar o texto de
  status por um chip (sincronizada/erro/expirando) e, nos cards de conteúdo,
  adicionar progresso na base do pôster (item 8 do `08-tela-filmes.md`).
- **Prioridade: P1** — quando histórico e múltiplas fontes coexistirem.

---

## 8. Empty-state de boas-vindas com CTA único

- **O que é:** quando não há playlists, a Home vira um empty-state de
  boas-vindas com um único CTA "Adicionar sua primeira lista" (o resto some).
- **Onde está no IPTVnator:** `workspace-dashboard-rails.component.html`
  (`hasPlaylists() === false` → `<app-empty-state [type]="'welcome-dashboard'">`)
  e `empty-state.component.ts`.
- **Por que reutilizar:** o CCPlay já faz isso (isEmpty → `AddSourceScreen`),
  mas **dentro** da Home, não como tela separada. O IPTVnator mantém o shell e
  troca só o conteúdo — melhor para navegação.
- **Como adaptar/melhorar:** manter a Home como shell e, quando vazio,
  renderizar o `EmptyState` de boas-vindas com CTA focável (não trocar de
  tela). O foco inicial deve cair no CTA.
- **Prioridade: P0** — refinamento do que o CCPlay já tem.

---

## 9. Fonte ativa na Home: status + expiração sem "abrir"

- **O que é:** o card de fonte mostra um chip de expiração (âmbar em 7 dias,
  erro quando expirou) e o status fica **no card**, sem exigir abrir o diálogo
  de conta.
- **Onde está no IPTVnator:** `DashboardSourceExpiryService` (descrito em
  `docs/architecture/workspace-dashboard.md` e no `CLAUDE.md`) — Xtream via
  `exp_date`, Stalker via `stalkerAccountInfo`.
- **Por que reutilizar:** o CCPlay tem `Source.connection_state` e
  `last_successful_sync_at`; ainda não tem expiração. Quando o conector
  Xtream chegar (item 1), o `exp_date` deve virar chip no card da Home.
- **Como adaptar/melhorar:** estender `SourceOut` com `expires_at`/`expiry`
  no backend e renderizar chip passivo no card (detalhes continuam atrás de
  uma ação "Info").
- **Prioridade: P1** — com o conector Xtream.

---

## Resumo de melhorias CCPlay sobre o IPTVnator (específicas de TV)

1. **Foco dirige o scroll horizontal** — sem chevrons de mouse, sem arrastar;
   `left/right` move o foco e o rail rola para acompanhar.
2. **Hero de largura total** — em TV o hero é uma linha inteira com CTA
   focável, não um card de canto com link.
3. **Ordem vertical dos rails importa** — em TV o `up/down` percorre rails; a
   ordem deve refletir prioridade (continue watching → ao vivo → filmes/séries
   → fontes), estável e previsível.
4. **"Ver todos" focável** — o fim de cada rail tem uma saída de foco clara.
5. **Chips grandes e legíveis** — progresso, S/E, expiração em tamanho de TV.
6. **Skeleton com custo baixo** — em Tizen, shimmer animado pode pesar;
   preferir blocos estáticos se a TV-alvo for limitada.

---

## Ordem de construção sugerida para a Home do CCPlay

1. **Agora (MVP):** hero de "continuar assistindo" (item 1) + rails com
   `layout cover/channel` (item 2) + navegação por foco (item 6) + rails
   independentes/skeleton (itens 3, 4).
2. **Pós-MVP:** "ver todos" para coleções globais (item 5), cards ricos com
   progresso/episódio (item 7), expiração de fonte (item 9).
3. **Futuro:** rails TMDB (trending, "porque você assistiu") do item 26 do
   backlog — já documentados em `00-resumo.md`.
