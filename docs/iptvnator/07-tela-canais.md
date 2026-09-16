# 07 — Reuso: Tela de Canais (categorias, seleção, preview e player)

Escopo: como o IPTVnator organiza a tela de canais ao vivo — rail de grupos/
categorias → lista de canais do grupo → seleção → preview/player → EPG — e o
que dá para traduzir para a tela Live do CCPlay (React + Tizen + D-pad), com
melhorias específicas para TV.

## Como cada projeto estrutura a tela hoje

### CCPlay (`tv-web/src/features/live/LiveScreen.tsx`)

Layout de 3 colunas fixas: **Grupos** | **Canais** | **Preview fake**. Navegação
2D já feita com `useRemoteNav` (`col` 0/1, `groupIdx`, `channelIdx`). O preview
é um retângulo com ruído estático ("prévia — {canal}") e Enter dispara só um
toast "Sintonizando canal...". Não há player real, nem EPG por item, nem
virtualização.

### IPTVnator

Duas implementações equivalentes:

- **M3U** (`libs/playlist/m3u/feature-player/src/lib/video-player/`): sidebar
  com a lista de canais (views `all`/`groups`/`favorites`/`recent`) + área de
  conteúdo com **player** e **EPG timeline** logo abaixo.
- **Xtream** (`libs/portal/xtream/feature/src/lib/live-stream-layout/`): a
  referência mais próxima do CCPlay — sidebar com header (categoria atual,
  sort, ocultar painéis) + `portal-channels-list` (virtual scroll) + área de
  conteúdo (player quando há `streamUrl`, senão grid "All Items").

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Separar "selecionar canal" de "reproduzir canal" | P0 |
| 2 | Três estados da área de conteúdo: vazio / selecionado / reproduzindo | P0 |
| 3 | Item de canal rico: logo + nome + EPG "agora" + progresso | P0 |
| 4 | Foco em painel com hand-off direcional (categoria ↔ canais) | P0 |
| 5 | Virtualização da lista de canais com foco | P0 |
| 6 | Restaurar o canal que está tocando (botão "show playing channel") | P1 |
| 7 | Rail de categorias com contagem e ordenação persistida | P1 |
| 8 | Preview real (não placeholder) com EPG do canal selecionado | P1 |

---

## 1. Separar "selecionar canal" de "reproduzir canal"

- **O que é:** focar/clicar um canal **seleciona** (atualiza EPG, status,
  preview); reproduzir é uma ação distinta (duplo clique/Enter), controlada por
  uma preferência do usuário.
- **Onde está no IPTVnator:** `video-player.component.ts` — o item emite
  `channelSelected` vs `channelPlaybackRequested`; `openStreamOnDoubleClick`
  decide se clique já reproduz. No Xtream, `playLive(item, startPlayback =
  !openStreamOnDoubleClick())` e o componente `channel-list-item.component.ts`
  separa `clicked` / `activated` / `keyboardActivated`.
- **Por que reutilizar:** em TV, **focar não pode reproduzir** (ADR-005 §3 do
  CCPlay: "o player não será iniciado ao apenas focar um cartão"). Separar os
  dois eventos permite preview/EPG ao mover o foco, e reprodução só no Enter.
- **Como adaptar/melhorar:** no `LiveScreen.tsx`, trocar o `onSelect` atual
  (toast) por: foco → seleção (atualiza preview + EPG); Enter → `playChannel`.
  Manter a preferência futura "reproduzir no Enter" vs "Enter só seleciona"
  (equivalente ao `openStreamOnDoubleClick`, mas invertido para TV — em TV o
  Enter SEMPRE reproduz; a variante é se a seta já faz auto-preview).
- **Prioridade: P0** — corrige o fluxo atual do CCPlay (que "sintoniza" com
  toast, sem player).

---

## 2. Três estados da área de conteúdo: vazio / selecionado / reproduzindo

- **O que é:** a área à direita tem estados explícitos: nada selecionado
  (empty-state com CTA), canal selecionado (preview/info), e canal reproduzindo
  (player + EPG).
- **Onde está no IPTVnator:** `live-stream-layout.component.html` — `@if
  (streamUrl) { player + EPG } @else if (...) { grid/loading } @else {
  empty-state }`. O empty-state usa
  `PortalEmptyStateComponent` com a mensagem "SELECT_CHANNEL_PLAYBACK".
- **Por que reutilizar:** o CCPlay hoje tem um preview **permanente** (mesmo
  sem seleção), o que em TV consome tela e confunde "o que está tocando". Os
  três estados tornam o estado óbvio.
- **Como adaptar/melhorar:** no `LiveScreen`, modelar `status: 'idle' |
  'preview' | 'playing'` derivado de `channelIdx`/`col`/player. `idle` = CTA
  "Selecione um canal"; `preview` = info do canal + EPG "agora"; `playing` =
  player AVPlay. Em TV, o preview pode ser o próprio player em pausa
  (ver item 8) — mais barato que um painel de preview separado.
- **Prioridade: P0** — estrutura base da tela.

---

## 3. Item de canal rico: logo + nome + EPG "agora" + progresso

- **O que é:** cada linha de canal mostra logo (com fallback), nome, badge de
  catch-up, e — quando há EPG — o programa atual com horários e barra de
  progresso; sem EPG, um placeholder discreto.
- **Onde está no IPTVnator:** `channel-list-item.component.html`
  (`channel-logo` com `onLogoError` → `channel-logo-fallback`; `epg-title`;
  `epg-timeline` com `epg-progress-fill` em `progressPercentage`). O
  `itemSize` é compacto sem EPG (52px) e maior com EPG (68px).
- **Por que reutilizar:** é o que transforma uma lista de nomes num guia de TV.
  O CCPlay já tem o EPG como "a avaliar" (item 23 do backlog); o desenho do
  item já deve prever o slot.
- **Como adaptar/melhorar:** no `LiveScreen`, criar um `ChannelRow` com:
  logo (com fallback de ícone), nome, e slot de "agora + progresso" que hoje
  fica vazio. **Melhoria para TV:** o slot de EPG precisa de contraste alto e
  texto maior (distância do sofá); o progresso deve ser uma barra fina, nunca
  só número.
- **Prioridade: P0** — o slot já entra no layout, mesmo sem EPG real ainda.

---

## 4. Foco em painel com hand-off direcional (categoria ↔ canais)

- **O que é:** ArrowRight numa categoria focada entra no painel de canais;
  ArrowLeft na primeira posição do painel volta à categoria; o scroll nativo
  sobrevive à reciclagem virtual e o foco não "some" num painel oculto.
- **Onde está no IPTVnator:** `libs/ui/components/src/lib/channel-scroll-focus/channel-scroll-focus.directive.ts`
  (`focusLiveChannels` — ArrowRight da categoria `aria-current` → foca
  `#live-channels`; ArrowLeft do painel → foca a categoria ativa). O painel tem
  `tabindex=0` e `role=region`.
- **Por que reutilizar:** o CCPlay faz hand-off via `col` 0↔1 no
  `useRemoteNav`, o que **funciona**, mas o padrão do IPTVnator adiciona o
  detalhe crítico: **foco real** no painel (para scroll + leitor de tela) e
  guardas contra painel oculto/inert.
- **Como adaptar/melhorar:** manter `col`/`groupIdx`/`channelIdx` como estado
  (simples e correto em React), mas adicionar: (a) ao entrar no painel, focar
  o contêiner rolável para o scroll nativo funcionar; (b) ao trocar de grupo,
  resetar `channelIdx` para 0 e **rolar o painel ao topo**; (c) se um painel
  estiver oculto, o hand-off não deve focá-lo.
- **Prioridade: P0** — o CCPlay já tem 90% disso; falta o scroll-owner.

---

## 5. Virtualização da lista de canais com foco

- **O que é:** a lista de canais usa virtual scroll (CDK) com tamanho de item
  fixo, suportando dezenas de milhares de canais; o foco segue o item e o
  scroll acompanha.
- **Onde está no IPTVnator:** `portal-channels-list.component.html`
  (`cdk-virtual-scroll-viewport` + `*cdkVirtualFor` com `itemSize`); no M3U,
  `all-channels-view` (virtual scroll de 90k+ canais). O CCPlay já planeja
  TanStack Virtual (ADR-006 §4.1).
- **Por que reutilizar:** o CCPlay hoje mapeia `activeGroup.channels` direto —
  ok para mock, mas explode com listas reais (310k entradas num painel real,
  como registrado no `importer.py`).
- **Como adaptar/melhorar:** usar TanStack Virtual no `LiveScreen` com tamanho
  de linha fixo (52/68px) e o padrão do `02-arquitetura.md` #2: "próximo
  índice → deslocar grade → aguardar montagem → focar". Guardar o `scrollIndex`
  por grupo para restaurar ao voltar.
- **Prioridade: P0** — requisito de escala (item 7 do backlog).

---

## 6. Restaurar o canal que está tocando (botão "show playing channel")

- **O que é:** um botão condicional no header reaparece quando o canal tocando
  não está visível nos resultados filtrados/na categoria atual; ao clicar,
  limpa busca, volta à categoria acessível e foca a linha do canal, **sem**
  mudar a reprodução.
- **Onde está no IPTVnator:** `live-stream-layout.component.html`
  (`channelNavigation.canReveal()` → botão `list_alt` → `channelNavigation.reveal()`)
  e `docs/architecture/remote-control.md` ("Show playing channel").
- **Por que reutilizar:** em TV é comum o usuário navegar/buscar e "perder" o
  canal que está tocando. Voltar a ele sem reiniciar a reprodução é um atalho
  de ouro.
- **Como adaptar/melhorar:** no `LiveScreen`, manter `playingChannelIdx` (e o
  grupo) separado do `channelIdx` de navegação; botão "Voltar ao canal" só
  aparece quando os dois divergem, e foca a linha sem reiniciar o player.
- **Prioridade: P1** — quando busca e múltiplas categorias existirem.

---

## 7. Rail de categorias com contagem e ordenação persistida

- **O que é:** cada categoria mostra a contagem de canais; a ordenação dos
  canais (server/A-Z/Z-A) é persistida; a largura do rail é redimensionável e
  lembrada por superfície.
- **Onde está no IPTVnator:** `groups-view.component.html` (nav item com
  `group.count`), `live-stream-layout.component.html` (menu de sort), e
  `persistPortalChannelSortMode`/`restorePortalChannelSortMode` em
  `portal/shared/util`.
- **Por que reutilizar:** contagem de canais por grupo ajuda o usuário a
  escolher antes de entrar. A ordenação A-Z é especialmente útil em listas
  grandes sem numeração.
- **Como adaptar/melhorar:** no `LiveScreen`, exibir `group.count` no rail e
  persistir `sortMode` por fonte no localStorage. Em TV, **redimensionar o rail
  não faz sentido** (sem mouse) — largura fixa; a melhoria é focar o conteúdo,
  não o layout.
- **Prioridade: P1** — refino sobre a base do MVP.

---

## 8. Preview real (não placeholder) com EPG do canal selecionado

- **O que é:** o "preview" do canal selecionado mostra o programa atual
  (título, horário, progresso) — e no IPTVnator o player já é o preview: a
  área de conteúdo vira o player no momento da seleção/reprodução, com o EPG
  timeline logo abaixo.
- **Onde está no IPTVnator:** `live-stream-layout.component.html` — player +
  `epg` (timeline/list) compõem a área de conteúdo; o EPG do canal ativo vem
  de `currentEpgItem`/`epgItems`.
- **Por que reutilizar:** o CCPlay tem um preview **fake** (ruído estático).
  O caminho do IPTVnator é mais honesto e barato: **não há preview separado do
  player** — selecionar mostra info + EPG; reproduzir troca a mesma área pelo
  player. Em TV, um player em standby com o EPG embaixo é o preview natural.
- **Como adaptar/melhorar:** no `LiveScreen`, substituir o painel de ruído por:
  estado `preview` = logo grande + nome + "Agora: {programa}" (dados reais do
  EPG quando existirem); estado `playing` = AVPlay + faixa de EPG. **Melhoria
  para TV:** usar o logo do canal (fallback de ícone) em vez de ruído, e
  carregar o "agora" do EPG **sem disparar reprodução**.
- **Prioridade: P1** — depende do EPG (item 23), mas o layout do preview pode
  já sair no MVP com dados do mock.

---

## Resumo de melhorias CCPlay sobre o IPTVnator (específicas de TV)

1. **Enter = reproduzir, foco = preview** — em TV não existe clique duplo; o
   mapeamento do `openStreamOnDoubleClick` deve ser invertido para "foco
   seleciona, Enter reproduz".
2. **Foco visível de longe** — o "selected state" do IPTVnator é feito para
   mouse; na TV precisa de glow/borda mais forte e contraste alto (item 3 do
   `01-ui-ux.md`).
3. **Sem arrastar/redimensionar** — as larguras de rail e o drag-and-drop de
   favoritos do IPTVnator não se aplicam; foco no conteúdo.
4. **Zapping numérico e PageUp/PageDown** — o IPTVnator implementa
   (`switchToChannelByNumber`, PageUp/PageDown no M3U); na TV isso vira teclas
   numéricas e CH+/CH− do controle remoto, já previsto no backlog (item 25).
