# Plano de Migração — Design System V14 Spectrum

**Criado**: 2026-09-26
**Status**: Decisões fechadas na ADR-011. **Onda 0 concluída** (feature
021-fundacao-visual-ds-v14, código completo, 5/5 contratos verdes, zero
mudança de layout). Onda 1 (feature 022) ainda não especificada.
**Branch de trabalho**: `feature/novo-design-system`

Migração do frontend (`tv-web/`) do protótipo antigo de 9 telas
(`docs/design/old/CCPlayTv Prototype - Standalone.html`) para o novo design
system. O objetivo é **manter toda a funcionalidade já entregue (features
001–020)**. O que o protótipo desenha e o app ainda não tem entra como
**mock honesto**, conforme a política da seção 4.

## 1. Fontes de verdade

| Artefato | Papel | Como consultar |
|---|---|---|
| `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` | **Normativo**: tokens, foco, estados, padrões de navegação, regras Tizen, QA | Leitura direta (Markdown) |
| `docs/design/design-system/CCPlayTV_Design_System_Component_Lab_v14_Spectrum.html` | Catálogo visual/interativo de componentes, um `<section id="…">` por componente | Abrir no navegador ou usar `Grep` por `id="<secao>"` |
| `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` | Aplicação das regras em telas reais. Uma função JS por tela: `profiles()`, `home()`, `live()`, `catalog()`, `details()`, `player()`, `settings*()`, `*Modal()` | `Grep` com janela curta, por exemplo `function live\(\).{0,400}`. O arquivo tem 249 KB, com linhas de até 13 mil caracteres |

**Precedência em caso de conflito** (do mais forte para o mais fraco):

1. constitution (`.planning/memory/constitution.md`);
2. ADRs aceitas;
3. Spec V14 (seções 1–35 e 37–48, mais o changelog V14);
4. Component Lab;
5. protótipo.

**Conflitos já identificados nos próprios artefatos**, resolvidos aqui:

- **Spec §36 ("CSS canônico V13")** está obsoleta: accent vermelho
  `#ff5264` e foco branco. Os valores vigentes são os das §5 e §11 (V14,
  laranja `#FF7A3D`). O protótipo ainda carrega blocos `:root` V13
  sobrescritos por CSS posterior; não copiar `:root` do protótipo.
- **Trailer preview em foco (§22, ~850 ms) e preview de canal em foco
  (§42.3, ~520 ms)** conflitam com a constitution ("focar um item NÃO DEVE
  iniciar reprodução nem disparar consulta a serviço externo") e com o
  AVPlay ser singleton (feature 016). **Vale a constitution**: o painel de
  preview da Live TV mostra só metadados locais (logo, nome, grupo, slot
  "Agora"), sem vídeo. Trailer só por ação explícita (OK em "Trailer"),
  quando o item 32 do backlog existir.
- **DeepSeek (§20/§21.4)** diverge do backlog, que prevê OpenAI BYOK
  (ADR-001/ADR-008). O provedor de IA é decisão de ADR, não do DS. Na
  migração, só o card mock, com nome genérico ("Assistente de IA").
- **Perfis com Favoritos/Histórico por perfil (§13.3, §48)**: o modelo de
  dados atual (`UserStateRecord`) não tem perfil. **Resolvido pela
  ADR-011: perfil = lista.** O estado já é isolado por `sourceId`, então
  "por perfil" vale sem migração.
- **Mocks com conteúdo inventado no protótipo** ("98% relevante", TMDB 8.7,
  "Agora: Jornal Nacional", "Mais assistidos") violam "IA e Classificação
  Nunca Inventam Dados" e "Progresso e Capacidades São Reais". Nada disso vai
  para a tela com cara de dado real. Ver seção 4.

## 2. Diagnóstico: onde o app está hoje

**O que já está alinhado ao V14** (não precisa migrar, só completar):

- Paleta e marca: `tv-web/src/index.css` já tem `--bg #05060a`, `--surface
  #15181f`, `--accent #ff7a3d`, `--accent-hover #ffa36b`, `--accent-ink
  #2a1206`, textos `#f5f6f8/#a7adbb/#7c8494/#5c6372` e o gradiente de 5 cores.
- Receita de foco: outline de 4 px, offset de 3 px, halo de 8 px, glow de
  40 px, `scale(1.06)` em 140 ms. É idêntica à §11.1.
- Fundamentos de comportamento: `useRemoteNav` com escopos e
  `onLongSelect`/`onFavoriteKey`, virtualização (feature 009), snapshot de
  volta com restauração de foco (feature 017), lifecycle `visibilitychange`
  (feature 020), tecla amarela, `tizenExit`.
- Categorias pessoais: `★ Favoritos` e `Todos` fixos no topo da trilha em
  Live/Filmes/Séries (features 013/018), como pede a §13.2.

**O que diverge** (é o trabalho da migração):

| Área | Hoje | V14 / protótipo |
|---|---|---|
| Fontes | Poppins/Inter via **Google Fonts CDN** (`tv-web/index.html`, `CCPlayTv/index.html`) | Empacotadas localmente, fallback Arial/Helvetica (§2.3) |
| Tokens | Só cor, fonte e foco | Mais espaçamento (8…96), raio (8/12/16/999), elevação 1–3, motion (`--ease`, fast/standard/slow), semânticos (sucesso/aviso/info/live/erro) e camadas z (0/10/50/100) |
| Palco | Sem escalonamento uniforme encontrado no código (`#root { min-height: 100vh }`) | 1920×1080 escalado, safe zone de 96/76 px (§4) |
| Fluxo de entrada | Splash → **Home = lista de fontes** → hub da fonte (3 tiles + "Continuar assistindo") → Live/Filmes/Séries | Splash → **Perfis** → Home com **topbar** (Início, TV ao vivo, Filmes, Séries, Esportes, Infantil + Busca, Configurações, relógio). Fontes ficam em **Configurações › Fontes IPTV & EPG** |
| Home | Lista de fontes | Hero + rails (Continue assistindo, Minha Lista, Agora na TV, Curadoria IA…) + dock de serviços |
| Live TV | Grupos / canais / painel de preview | 3 colunas (Categorias com contagem / Canais com número + logo + "Agora" + progresso / Preview grande com ações Assistir, Favorito, Guia) + cartões "A seguir" |
| Filmes/Séries | Trilha de categorias + grade virtualizada + ícone de busca por categoria | Side nav com blocos "Sua biblioteca" (★ Favoritos, **↺ Histórico**) e "Catálogo" (Todos + categorias), campo de busca, **Ordenar**, hero band, cards 205×302 |
| Detalhe | Filme: backdrop + ações. Série: header + abas de temporada + lista de episódios | Hero de largura total, metadados, ações em pill, abas (Episódios/Detalhes/Elenco/Semelhantes), episódios em cards 16:9 |
| Player | Controles de VOD (feature 011) e zapping (016) | Chrome com auto-hide, live bug, botões de áudio/legenda/qualidade/velocidade/aspecto/info, media keys |
| Modais | `ConfirmDialog` | Um sistema de modal (z 100, um por vez, foco volta à origem) para confirmação, busca, ordenação, temporada, trilhas e erro acionável |
| Estados | Por tela, ad hoc | `EmptyState`/`ErrorState` com código (`NET-01`, `SRC-401`, `PLAY-04`…) e ação primária, banner offline, spinner/skeleton padronizados |
| Acessibilidade | Parcial | `aria-label` em todo focável, região `aria-live`, soft × hard disabled, reduced motion |

## 3. Estratégia

**Strangler por onda, lógica intocada.** Toda a camada `tv-web/src/lib/`
(catálogo, player, foco, estado do usuário) fica **fora do escopo de
reescrita**. A migração troca a apresentação (`features/`, `components/`,
CSS) e reaproveita hooks e repositórios existentes. Uma tela migrada tem de
passar nos mesmos testes de comportamento da versão antiga. Os seletores
podem mudar; o comportamento, não.

**Cada onda vira uma feature SDD** (`sdd-specify` → `sdd-plan` →
`sdd-execute` → `sdd-converge`), com numeração sequencial a partir de 021.
Este documento é o roteiro entre elas, não substitui a spec de cada uma.

**Pré-passo concluído**: as decisões de produto que o DS impõe estão na
**ADR-011** (2026-09-26):

- shell com topbar;
- perfil = lista;
- fonte ativa;
- política de mock;
- número do canal;
- Esportes/Infantil fora da topbar.

A ADR-007 ganhou nota inline apontando para ela.

**Guardas que valem para todas as ondas**:

- **Testes de contrato travados** (`check-contract-tests.ps1`): dois são de
  UI e vão ser tocados pela migração, `LiveScreen.busca-categoria.contract.
  test.tsx` e `PlayerLayer.ciclo-vida-player.contract.test.tsx`. Eles **não
  podem ser editados**. A migração preserva o que eles consultam
  (texto/role/aria) ou reabre o travamento por decisão registrada no
  `plan.md` da onda.
- **E2E** (`tv-web/e2e/*.mjs`, 7 scripts mais `e2e.mjs`): seletores por
  classe vão quebrar. Cada onda atualiza os scripts das telas que tocou e
  roda `npm run test:e2e` como gate (constitution, Fluxo de
  Desenvolvimento).
- **Plano de hardware do AVPlay**: toda tela nova que monta `PlayerLayer`
  precisa estar coberta pela regra de transparência em `screens.css`
  (ver CLAUDE.md). Isso vale sobretudo para a raiz do novo shell.
- **`tizen_web_project.yaml`**: todo arquivo novo emitido pelo build
  (fontes `.woff2`, ícones) entra na lista `files:`. Se faltar, a falha
  aparece só na TV.
- **Sem `:has()`, sem `backdrop-filter` pesado, sem `will-change` em massa**
  (§3, §30). O alvo é Chromium 108.

## 4. Política de mock

O pedido é "manter as funcionalidades existentes e mockar as que ainda não
foram desenvolvidas". A constitution proíbe apresentar dado inventado como
fato. A política que concilia as duas coisas:

1. **Mock é soft disabled (§11.4), nunca conteúdo falso.** O controle
   aparece, é focável e tem aparência reduzida. OK abre um toast ou modal
   curto: "**Em breve** — <o que vai fazer>". Nenhum mock mostra nota,
   percentual, sinopse, programação de EPG, título ou contagem que não venha
   do catálogo real.
2. **Seção sem dado real não renderiza vazia com cara de erro.** Uma rail
   mock (por exemplo, Curadoria IA) vira um único card "Em breve", nunca
   seis pôsteres fictícios.
3. **Rastreabilidade**: todo mock é registrado num único módulo
   (`tv-web/src/lib/comingSoon.ts`, proposto), com um id e o item do
   backlog que o substitui. Remover um mock é trocar uma entrada, não caçar
   JSX.
4. **Tela de destino inteira mock** (Descobrir com IA, EPG, parte de
   Configurações) = cabeçalho real + `EmptyState` "Em breve" com
   explicação, o item do backlog e um CTA focável (Voltar). Sem beco sem
   saída.
5. **Fixtures visuais só em dev.** Se for útil ver uma tela "cheia" para
   revisão de design, isso vive atrás de flag de dev
   (`import.meta.env.DEV`) e nunca entra no build Tizen.

## 5. Matriz de funcionalidades: real × mock

| Superfície do protótipo | Tratamento | Origem do dado / item que substitui o mock |
|---|---|---|
| Splash V14 (logo, tagline, loader) | **Real** | `SplashScreen` restilizado |
| Perfis "Quem está assistindo?" | **Real**: perfil = lista (ADR-011). Cartões das fontes + "Adicionar lista"; escolher = fonte ativa | Reaproveita `HomeScreen`. Perfis de pessoa independentes das listas = item 52 |
| Onboarding de fonte (sourceSetup: M3U / Xtream) | **Real** | `AddSourceScreen` + `importApi` (features 001/004/005/014), IME com `inputmode`/`autocomplete` (§37) |
| Progresso de importação | **Real** | `ImportProgressScreen` restilizado; o protótipo não desenha esta tela, usar componentes do Lab |
| Topbar: Início, TV ao vivo, Filmes, Séries | **Real** | Rotas existentes |
| Topbar: Esportes, Infantil | **Fora da topbar** (ADR-011) | Item 53; exige critério que respeite "Categorias da Fonte São Preservadas" |
| Topbar: indicador do perfil ativo (nome da lista) | **Real**. OK volta à tela de perfis | ADR-011 §3 |
| Topbar: Busca global | **Real** | `searchIndex()` (feature 018) sobre filmes, séries e canais já lidos, com aviso de cobertura ("Busca em X de Y categorias") |
| Topbar: relógio | **Real** | Relógio local |
| Home: hero | **Real**: primeiro item de "Continue assistindo", senão o primeiro favorito, senão boas-vindas | Feature 019 + 013. Sem sinopse, nota ou "relevância" (sem TMDB) |
| Home: Continue assistindo | **Real** | `getContinueWatching()` (feature 019) |
| Home: Minha Lista | **Real** (= favoritos de filmes e séries) | `resolveFavorites` (feature 013) |
| Home: Agora na TV | **Real parcial**: canais favoritos, slot "Agora" vazio | EPG = item 42 |
| Home: Curadoria IA, Top/trending | **Mock** (1 card "Em breve") | Itens 30/31 (IA), 45 (trending) |
| Home: dock de serviços (Weather, Speed Test, TMDB, IA) | **Mock** (ícones soft disabled) | Novo item 54; TMDB = item 28 |
| Live: categorias com contagem, ★ Favoritos, Todos | **Real** | Features 010/013/018. Contagem só quando conhecida (categoria sob demanda ainda não carregada = sem número, nunca "0") |
| Live: canal com número, logo, nome | **Real**. Número = posição na ordem da fonte | Números declarados pela fonte (`tvg-chno`) = item 25 |
| Live: "Agora" + barra de progresso do programa | **Slot reservado vazio** (já é assim hoje) | Item 42 (EPG) |
| Live: painel de preview | **Real, sem vídeo**: logo/nome/grupo + Assistir / Favorito | Ver conflito na seção 1 |
| Live: "Guia completo", cartões "A seguir" | **Mock** | Item 42 |
| Live: zapping por cima do vídeo | **Real** | Feature 016, restilizada |
| Live: entrada numérica de canal (§44) | **Fora da migração** | Item 44 |
| Filmes/Séries: ★ Favoritos, Todos, categorias da fonte | **Real** | Features 010/013/018 |
| Filmes/Séries: **↺ Histórico** | **Real (novo)**: itens com `lastWatched`, do mais recente para o mais antigo, incluindo concluídos | `UserStateRecord.lastWatched`/`completedAt` já existem (features 011/012/019), sem migração Dexie |
| Filmes/Séries: campo de busca | **Real** | Feature 018 (filtro sobre o que já foi carregado) |
| Filmes/Séries: Ordenar | **Real parcial**: "Ordem da fonte", "A–Z", "Ano" (se o provedor informar); "Mais vistos"/"Mais recentes" só com dado real | Sem dado = opção ausente (hard disabled) |
| Filmes/Séries: hero band | **Real**: item focado/primeiro da categoria com capa real (feature 015); sem sinopse inventada | Backdrop/sinopse = item 28 |
| Filmes/Séries: rails editoriais ("Em destaque", "Mais assistidos") | **Não adotar**: manter grade virtualizada por categoria | Rail editorial exige sinal que não existe |
| Detalhe filme: Assistir/Continuar, Minha Lista (favoritar), Marcar assistido | **Real** | Features 011/013/019 |
| Detalhe: Trailer, abas Elenco/Semelhantes | **Mock** | Itens 32, 45 |
| Detalhe: aba Detalhes (dados técnicos) | **Real parcial**: só o que o catálogo tem | — |
| Detalhe série: Continuar TX:EY, seletor de temporada, episódios 16:9 com progresso/concluído | **Real** | Feature 012/019 |
| Player VOD: play/pause, ±10 s, timeline, retomada, próximo episódio com countdown | **Real** | Features 011/012/020 |
| Player: episódio anterior | **Real** (soft disabled no primeiro, §43.2) | `episodeNavigation.ts` |
| Player: áudio/legendas, qualidade, velocidade, aspecto, info do stream | **Mock** (soft disabled por capacidade) | Novo item 55; exige estender o contrato de capacidades do `PlayerService` |
| Player: media keys (Play/Pause/FF/RW/Stop) | **Real** se a tecla estiver disponível, senão ausente | Parte do item 44; registrar só as teclas usadas (item 38) |
| Configurações › Fontes IPTV | **Real**: listar, adicionar, editar, ressincronizar, remover, aviso de Modo limitado, fonte ativa | Migra `HomeScreen`/`ListHomeScreen`/`LimitedModeNotice` |
| Configurações › Fontes: EPG por fonte | **Mock** | Item 42 |
| Configurações › Integrações & BYOK | **Mock** | Itens 28 (TMDB), 31 (IA), 54 |
| Configurações › Player & reprodução | **Mock** | Item 55 |
| Configurações › Acessibilidade & sistema | **Real parcial**: "Reduzir movimento" (classe no `<html>` mais a media query); resto mock | Novo item 56 (legendas acessíveis, alto contraste, Voice Guide) |
| Configurações › Parental | **Mock** | Item 52 |
| Configurações › Sobre & créditos | **Real** (versão do app, atribuições) | — |
| Banner offline (§40.4) | **Real**: `navigator.onLine` + eventos, só como sinal | Falha real de request continua sendo a verificação final |
| Modal de saída (Return na Home) | **Real** | `tizenExit` |
| Erros acionáveis com código (§45) | **Real** nos erros que já existem (importação, categoria, reprodução) | Item 19 amplia o diagnóstico |
| Tela "Descobrir com IA" | **Mock** (tela "Em breve") | Itens 30/31 |
| EPG em tela cheia | **Mock** (tela "Em breve") | Item 42 |
| "Não classificados" | **Fora da migração**; o DS não desenha | Item 26 |

## 6. Ondas

Ordem de dependência. Cada onda termina com o app **inteiro funcional**:
nenhuma onda deixa uma funcionalidade 001–020 quebrada ou inalcançável.

### Onda 0 — Fundação visual (feature 021)

- Fontes Poppins/Inter **empacotadas localmente** (`.woff2` sob
  `tv-web/public/fonts/` ou equivalente, conferindo a licença OFL). Remover
  os `<link>` do Google Fonts de `tv-web/index.html` e
  `CCPlayTv/index.html`, adicionar os arquivos em `tizen_web_project.yaml`.
  Fallback `Arial, Helvetica, sans-serif`.
- Completar os tokens em `index.css`: espaçamento, raio, elevação, motion,
  semânticos, camadas z, `--accent-pressed #D9601F`, `--accent-tint`,
  `--bg-elevated`/`--bg-hover`. Manter os nomes atuais como alias, porque
  `screens.css` inteiro depende deles.
- Palco 1920×1080 com escala uniforme e safe zone (§4), conferindo que
  `PlayerService` continua passando `setDisplayRect` em espaço 1920×1080.
- Utilitários globais: `.no-scale`, `.pressed`, soft/hard disabled,
  `prefers-reduced-motion` mais a classe de preferência interna.
- Ícones SVG locais (a família mínima da §15) no lugar de glifos e emoji
  (`★`, `🔍`) usados como elemento principal.
- Região `aria-live` global mais o helper `announce()`.
- **Critério**: as telas atuais continuam iguais em comportamento, e todos
  os testes e E2E passam. É uma onda sem mudança de layout.

### Onda 1 — Biblioteca de componentes (feature 022)

Absorve o item 15 do backlog. Componentes em `tv-web/src/components/`,
cada um com teste e com os estados default/focused/pressed/disabled/
loading/error. A referência é o Component Lab (`id=` entre parênteses).

- `Button` (primary pill laranja / secondary / ghost / accent), `IconButton`
  52×52 com rótulo no foco, `Chip`, `Tabs` (`#actions`, `#navigation`).
- `ContentCard` nas variantes portrait 205×302, landscape 292×164, wide
  356×200 e compact 250×126, sobre `PosterArt` (feature 015) (`#cards`).
- `ChannelRow` com número, logo, nome, slot "Agora" e progresso
  (`#cards`, `live()` no protótipo).
- `Rail` horizontal virtualizado, com edge fade e indicador de posição
  (`#rails`).
- `SideCategoryNav` com blocos "Sua biblioteca"/"Catálogo" e contagem
  opcional (`#categoriesv131`).
- `Modal` (um por vez, z 100, foco volta a quem abriu, RETURN fecha
  primeiro), `Toast`, `EmptyState`, `ErrorState` (código + ação),
  `OfflineBanner`, `Spinner` (20/32/48), `Skeleton` (`#feedback`,
  `#errorstax`, `#networkv13`).
- `ComingSoon` mais o registro `comingSoon.ts` (seção 4).
- `TextField` com IME (`inputmode`, `autocomplete`, rótulo permanente,
  Next/Done) (`#ime`, `#forms`).
- **Critério**: componentes testados isoladamente. Nenhuma tela ainda
  trocada, ou só trocas triviais (por exemplo, `ConfirmDialog` → `Modal`).

### Onda 2 — Shell, navegação e entrada (feature 023)

- `AppShell` com `TopBar` e `HintBar`:
  - a topbar tem logo, Início/TV ao vivo/Filmes/Séries, indicador do
    perfil ativo, Busca, Configurações e relógio;
  - Esportes/Infantil ficam fora (ADR-011);
  - foco topbar ↔ conteúdo via composição de escopos do `useRemoteNav`
    (ADR-009, sem biblioteca de foco).
- **Perfil = lista** (ADR-011 §2): a `HomeScreen` atual vira a tela "Quem
  está assistindo?", com as fontes como cartões mais "Adicionar lista".
  - Sem listas, só "Adicionar lista".
  - Aparece a cada abertura, com foco na última lista usada.
  - Escolher uma lista define a **fonte ativa** da sessão. Não há
    agregação multi-fonte (item 23).
- Reescrita do roteamento em `App.tsx`: destinos de topo, pilha para
  detalhe/player e RETURN em camadas (modal → tela → Início → modal de
  saída). Preservar `CategoryScreenSnapshot` e o acompanhamento de
  auto-refresh.
- Splash V14, onboarding de fonte ("Adicionar lista") e progresso de
  importação no visual novo.
- Tela "Em breve" para Descobrir com IA (a IA fica como mock dentro da
  Home/Configurações, não como destino de topo).
- Home **provisória** = hub atual (Continuar assistindo + atalhos)
  restilizado. A Home definitiva vem na Onda 5.
- **Critério**: toda funcionalidade de gestão de fonte (criar, editar,
  ressincronizar, remover, Modo limitado) alcançável pelo novo caminho. A
  Home de fontes antiga pode sair.

### Onda 3 — Live TV (feature 024)

- Layout de 3 colunas (§25) com `SideCategoryNav`, lista de `ChannelRow`
  virtualizada e painel de preview sem vídeo.
- Preservar zapping (016), favoritos por segurar OK e pela tecla amarela
  (013), busca por categoria e "Todos" (018), prefetch com debounce (010),
  ciclo de vida (020).
- **Critério**: `LiveScreen.busca-categoria.contract.test.tsx` e
  `zapping-live-tv.mjs`/`busca-por-categoria.mjs`/`favoritos.mjs` verdes.

### Onda 4 — Filmes e Séries: grade e detalhe (feature 025)

- `SideCategoryNav` com **↺ Histórico** (novo, dado real), campo de busca,
  Ordenar (só opções com dado real), hero band, grade virtualizada de
  `ContentCard` portrait.
- Detalhe de filme e de série no layout hero V14, abas (Episódios/Detalhes
  reais, Elenco/Semelhantes mock), episódios em `ContentCard` landscape com
  progresso e selo de assistido.
- Memória de foco por categoria (§41), estendendo o
  `CategoryScreenSnapshot`.
- **Critério**: `capa-real.mjs`, `historico-continuar-assistindo.mjs`,
  `favoritos.mjs` verdes; volta do detalhe restaura o card de origem.

### Onda 5 — Home definitiva, Busca global e Configurações (feature 026)

Absorve o item 16 do backlog.

- Home: hero + rails reais (Continue assistindo, Minha Lista, Agora na TV)
  + cards mock (Curadoria IA) + dock mock.
- Busca global (topbar) com IME e aviso de cobertura.
- Configurações em abas laterais: Fontes (real), Acessibilidade (reduzir
  movimento real), Sobre (real), demais mock.
- **Critério**: o antigo `ListHomeScreen` (hub de 3 tiles) sai do código,
  junto com os testes, CSS e E2E correspondentes. As ações de gestão que
  ficavam no `HomeScreen` (editar, ressincronizar, remover) passam a morar
  em Configurações › Fontes IPTV.

### Onda 6 — Player chrome (feature 027)

- Chrome V14 com auto-hide (§27, §43): live bug e canal/programa no Live;
  timeline e ±10 s no VOD; anterior/próximo episódio.
- Botões de áudio/legenda/qualidade/velocidade/aspecto/info como soft
  disabled, dirigidos pelo contrato de capacidades (nunca por "é AVPlay?").
- Media keys registradas só se disponíveis.
- **Critério**: `PlayerLayer.ciclo-vida-player.contract.test.tsx`,
  `ciclo-vida-player.mjs` verdes; **passada na TV física recomendada**
  (plano de hardware, teclas de mídia).

### Onda 7 — Limpeza e QA (dentro da 027 ou feature própria)

- Quebrar `screens.css` (~30 KB) por componente/tela e remover o CSS morto.
- Matriz de QA Tizen (§34) em todas as telas.
- Varredura de `aria-label`.
- Passada na TV física com a skill `tizen-tv`.
- Atualizar a ADR-007 (emenda final), o CLAUDE.md e o backlog.

## 7. Decisões fechadas pela ADR-011 (2026-09-26)

As decisões que estavam em aberto foram registradas em
`sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md`. Ela prevalece
sobre qualquer trecho deste roteiro que diga outra coisa.

1. **Política de mock**: soft disabled "Em breve", sem conteúdo fictício.
   Fixtures só em build de dev.
2. **Esportes/Infantil**: **fora da topbar** até o item 53 ser avaliado.
3. **Fonte ativa única**, sem agregação (item 23).
4. **Perfil = lista.** A tela "Quem está assistindo?" mostra as fontes
   cadastradas mais o cartão "Adicionar lista". Sem lista, só "Adicionar
   lista". A tela aparece a cada abertura, com foco na última lista usada.
   A `HomeScreen` atual vira esta tela. Favoritos/histórico "por perfil"
   já valem via `sourceId`.
5. **Número do canal** = posição na ordem da fonte (em "Todos"), só
   exibição.

## 8. Riscos

- **R-1: regressão silenciosa de comportamento** ao reescrever telas
  grandes (`LiveScreen.tsx` ~39 KB, `MoviesScreen.tsx` ~32 KB,
  `SeriesScreen.tsx` ~29 KB). Mitigação: trocar a apresentação por
  componentes sem mexer nos hooks. Os testes de comportamento existentes
  são o critério de paridade.
- **R-2: custo de render na TV**: rails, hero e glow em muitos cards.
  Mitigação: virtualização obrigatória (§30), glow só no item focado,
  medição na TV física ao fim das Ondas 3 e 5.
- **R-3: fontes locais aumentam o `.wgt`**. Mitigação: subset latino, só os
  pesos usados (Poppins 600/700/800, Inter 400/500/600/700).
- **R-4: o protótipo é HTML imperativo com navegação geométrica**, e o app
  usa `useRemoteNav` por estado (ADR-009). O layout do protótipo pode supor
  saltos diagonais que a navegação por estado não faz. Mitigação: cada tela
  define vizinhos explícitos (§33), sem portar o `navigate()` do protótipo.
- **R-5: E2E com caminho de Chromium Linux fixo** (ver CLAUDE.md). Rodar
  local no Windows exige override temporário em cada script.
