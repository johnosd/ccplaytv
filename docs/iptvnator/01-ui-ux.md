# 01 — Reuso de UI/UX

Escopo: padrões de interface reaproveitáveis do IPTVnator para o CCPlay TV,
com foco no que importa para uma TV Samsung Tizen controlada por D-pad
(controle remoto): foco direcional, virtualização de grades, linguagem visual
de seleção, composição de telas e dashboards em rails.

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Foco direcional 2D gerenciado por tela (não roving-focus DOM) | P0 |
| 2 | Virtualização de grid com identidade estável + foco explícito | P0 |
| 3 | Linguagem visual única de seleção via tokens | P0 |
| 4 | Um dono de scroll por painel + conteúdo rolável separado do cabeçalho | P1 |
| 5 | Dashboard em rails horizontais (Netflix/Apple TV) com auto-hide | P1 |
| 6 | Estados obrigatórios por superfície: loading/empty/error/selected/hover | P1 |
| 7 | Restaurar foco/posição ao voltar de detalhes/player | P0 |
| 8 | Ações globais × locais com rótulo de escopo explícito | P2 |

---

## 1. Foco direcional 2D gerenciado por tela (não roving-focus DOM)

- **O que é:** em grids e layouts com colunas independentes, cada tela decide o
  que "próximo/anterior" significa para cada direção do D-pad, em vez de
  percorrer elementos focáveis na ordem do DOM.
- **Onde está no IPTVnator:** o IPTVnator é desktop (mouse/teclado), então não
  tem D-pad; o padrão equivalente é a separação entre navegação por lista e
  "scroll owner" — `docs/architecture/iptvnator-ui-guidelines.md` (Core
  Principles 5, "Scroll ownership must be explicit"). No CCPlay, o padrão 2D
  já nasceu certo em `tv-web/src/lib/useRemoteNav.ts` (`gridNextIndex`,
  `clamp`, handlers `onDirection`/`onSelect`/`onBack`).
- **Por que reutilizar:** o IPTVnator confirma o princípio que o CCPlay já
  adota: um único dono de navegação por superfície, com as regras geométricas
  (subir = `-cols`, descer = `+cols`) explicitadas e testáveis em funções
  puras.
- **Como adaptar/melhorar:** extrair a matemática de grade do CCPlay para um
  módulo puro e unit-testável (`gridNextIndex` já é puro — manter e cobrir
  com testes); modelar "subir da primeira linha" e "descer da última" como
  políticas de tela (voltar ao topo, sair para o cabeçalho), e não como
  clamping silencioso — decisão que cada superfície deve poder variar.
- **Prioridade: P0** — é a base de toda a navegação por controle remoto do
  MVP (item 7 do backlog).

---

## 2. Virtualização de grid com identidade estável + foco explícito

- **O que é:** renderizar apenas os cartões visíveis de grades com dezenas de
  milhares de itens, mantendo um identificador estável por cartão e resolvendo
  foco "para um destino ainda não montado" movendo a janela virtual antes de
  focar.
- **Onde está no IPTVnator:** `docs/architecture/m3u-playlist-module.md`
  (seção Module Structure e "90,000+ channels support"); o canal row virtual é
  `libs/ui/components/src/lib/channel-list-container/all-channels-view/` (CDK
  virtual scroll). A decisão equivalente no CCPlay está na ADR-006 §4.1
  ("Foco e virtualização"): TanStack Virtual + Norigin Spatial Navigation,
  com "identificador estável e índice lógico por cartão".
- **Por que reutilizar:** o IPTVnator prova o requisito de escala
  (90k+ canais) e o cuidado crítico: a imagem carregando depois não pode
  mudar dimensões do grid e derrubar a posição de foco.
- **Como adaptar/melhorar:** no CCPlay, manter tamanho reservado para capas
  (aspect-ratio fixo via CSS) e um overscan pequeno; resolver "próximo índice
  → deslocar grade → aguardar montagem → focar" como sequência explícita,
  não depender do algoritmo geométrico achar um nó inexistente no DOM. Usar
  `gridNextIndex` como fonte de verdade do índice, e a virtualização só como
  execução.
- **Prioridade: P0** — critério de aceite de fluidez do MVP (grades de canais
  e filmes).

---

## 3. Linguagem visual única de seleção via tokens

- **O que é:** um mesmo "receituário" de seleção (fundo em gradiente, borda e
  brilho) aplicado a item de lista selecionado, canal ativo e cartão de EPG
  atual, dirigido por tokens CSS em vez de cores fixas por componente.
- **Onde está no IPTVnator:** `docs/architecture/iptvnator-ui-guidelines.md`
  (seção "Selection Pattern" e "Shared Tokens") e
  `apps/web/src/m3-theme.scss` (tokens `--app-selection-color`,
  `--app-selection-surface`, `--app-selection-glow`, etc.). Skill
  `iptvnator-ui-design` (`Inspect First` → `m3-theme.scss`) reforça.
- **Por que reutilizar:** em TV, o estado selecionado é a **única** forma de
  o usuário saber onde está; consistência entre listas, grades e EPG é o que
  dá sensação de produto coeso. "Neutro quieto, seleção forte" também ajuda
  em telas densas.
- **Como adaptar/melhorar:** no CCPlay criar o equivalente a `m3-theme.scss`
  como variáveis CSS globais de seleção/foco (só com `:focus-visible` e a
  classe de seleção), aplicadas por todos os cartões; incluir um "glow" mais
  forte que o do IPTVnator porque em TV o foco precisa ser visto de longe
  (distância do sofá), e testar contraste claro/escuro.
- **Prioridade: P0** — barato, transversal e melhora toda a navegação do MVP.

---

## 4. Um dono de scroll por painel + conteúdo rolável separado do cabeçalho

- **O que é:** cabeçalhos e controles ficam fixos; a lista é o único elemento
  que rola; painéis aninhados não competem por scroll.
- **Onde está no IPTVnator:** `docs/architecture/iptvnator-ui-guidelines.md`
  (Core Principle 5, "Scroll ownership must be explicit. Headers stay
  visible. Lists scroll.") e `libs/ui/styles/_nav-list.scss`.
- **Por que reutilizar:** em TV isso vira "o foco não pode sumir dentro de um
  painel rolável aninhado". Um único dono de scroll por painel simplifica o
  gerenciamento de foco e evita que a grade e o menu rolem juntos.
- **Como adaptar/melhorar:** no CCPlay, declarar por tela o elemento que rola
  e manter cabeçalho/tabs fixos; ao rolar com D-pad, o scroll deve ser
  dirigido pelo foco (focar o próximo cartão e só então rolar para trazê-lo à
  vista), não o inverso.
- **Prioridade: P1** — importante, mas dá para refinar após as grades do MVP
  funcionarem.

---

## 5. Dashboard em rails horizontais (Netflix/Apple TV) com auto-hide

- **O que é:** landing page composta de rails horizontais (`Continue Watching`,
  `Live now on favorites`, `Trending this week`...), cada rail renderizando
  independente, com skeleton escopado e auto-hide quando vazio.
- **Onde está no IPTVnator:** `docs/architecture/workspace-dashboard.md`
  (Page Structure, Render Rules) e
  `libs/workspace/dashboard/feature/src/lib/rails/workspace-dashboard-rails.component.ts`.
- **Por que reutilizar:** é o layout canônico de apps de TV. As regras de
  render são diretamente reaproveitáveis: cada rail resolve seus dados de
  forma independente (uma fonte lenta não esconde conteúdo já pronto),
  skeleton por rail (não gate de página inteira), e rail vazio some.
- **Como adaptar/melhorar:** no CCPlay o dashboard está pós-MVP (hero de
  "continuar assistindo" + rails). Reaproveitar a regra "hero = primeiro item
  do recente; rails independem; empty-state de boas-vindas quando não há
  playlists". Em TV, substituir "chevron no hover" por navegação D-pad
  direta no rail e um "Ver tudo" focável.
- **Prioridade: P1** — é o destino natural do backlog (item 10 e rails TMDB),
  não bloqueia o MVP de importar→navegar→assistir.

---

## 6. Estados obrigatórios por superfície: loading/empty/error/selected/hover

- **O que é:** cada superfície deve tratar explicitamente loading, vazio,
  erro, selecionado e hover/disabled, sem reescrever estilos locais.
- **Onde está no IPTVnator:** skill `iptvnator-ui-design`
  (`Design Contract`: "Preserve sticky controls, keyboard/focus feedback, and
  loading, empty, error, disabled, hover, and selected states") e o empty-state
  reutilizável `libs/playlist/shared/ui/src/lib/recent-playlists/empty-state/empty-state.component.ts`.
- **Por que reutilizar:** em TV o "empty" e o "erro" precisam de uma ação
  focável de saída (não dá para clicar em nada aleatório). A checklist de
  estados evita telas que travam o D-pad.
- **Como adaptar/melhorar:** no CCPlay, transformar a lista em um componente
  `EmptyState` (título + CTA primário focável) e um `ErrorState` com Retry
  focável; garantir que todo estado tenha **pelo menos um elemento focável**
  (senão o controle remoto fica preso).
- **Prioridade: P1** — refino transversal após o fluxo principal.

---

## 7. Restaurar foco/posição ao voltar de detalhes/player

- **O que é:** ao voltar de uma tela de detalhes, do player ou do trailer, o
  item que originou a navegação volta a ter foco e a posição de rolagem é
  restaurada.
- **Onde está no IPTVnator:** o conceito está implícito na navegação de
  detalhes (`docs/architecture/portal-detail-navigation.md`) e no cuidado com
  foco do `navigation-ux-analysis.md` (confusão de escopo gera perda de
  contexto). No CCPlay é requisito explícito da ADR-005 §3 ("Ao voltar,
  restaurar foco/posição quando possível") e da ADR-006 §4.1.
- **Por que reutilizar:** na TV a perda de foco ao voltar é fatal — o usuário
  recomeça do topo da grade. É o tipo de detalhe que distingue um app "de TV"
  de um app web empacotado.
- **Como adaptar/melhorar:** no CCPlay, manter o estado de foco no histórico
  de navegação do `App.tsx` (já há `history` de telas — adicionar o índice
  focal/posição de scroll por tela) e restaurá-lo no `back()`; persistir a
  janela virtual da grade para reposicionar sem refazer o layout.
- **Prioridade: P0** — barato de modelar agora e doloroso de corrigir depois.

---

## 8. Ações globais × locais com rótulo de escopo explícito

- **O que é:** distinguir visualmente o que é global (app) do que é local
  (playlist/fonte ativa), rotulando o escopo quando a posição não o torna
  óbvio.
- **Onde está no IPTVnator:** `docs/architecture/navigation-ux-analysis.md`
  (pontos de confusão A–D e recomendações "Quick Wins": rótulo do nome da
  playlist acima dos links dinâmicos, favoritos global vs local distintos,
  escopo no placeholder da busca). O command palette é citado como o modelo
  correto ("explicit scope labels").
- **Por que reutilizar:** o CCPlay tem o mesmo problema com múltiplas fontes
  (a partir do item 12 do backlog): trocar de fonte muda o conteúdo sem
  aviso. O IPTVnator já mediu onde isso confunde e propôs correções.
- **Como adaptar/melhorar:** na Home/listas do CCPlay, sempre exibir o nome da
  fonte ativa acima da navegação local; manter "Favoritos globais" vs
  "favoritos desta fonte" com rótulos distintos; o placeholder de busca deve
  dizer o escopo ("Buscar em filmes", "Buscar nesta fonte").
- **Prioridade: P2** — relevante quando múltiplas fontes simultâneas chegarem
  (pós-MVP).
