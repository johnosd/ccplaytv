# Implementation Plan: Paridade visual de Filmes e Séries com o Design System V14

**Slug**: `050-filmes-series-paridade-v14` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/050-filmes-series-paridade-v14/spec.md`

## Summary

Aproximar o catálogo de Filmes e Séries do protótipo V13.2 (`catalog()`, `sortModal()`) e da Spec V14 §13.2/§32
**sem mudar comportamento** (decisão do usuário, FR-013). É a 048 aplicada ao `VodCatalogScreen`: a hero band
compacta vira um painel (rótulo `CCPLAY CINEMA`/`CCPLAY SÉRIES`, título grande, metadados reais, capa real ao
fundo sob degradê); a sidebar vira painel com cabeçalho "Categorias" e itens no padrão V14; a toolbar ganha o
campo Pesquisar com ícone + dica "OK" e o botão Ordenar com rótulo + valor; o modal de Ordenar usa a lista V14;
sidebar e grade ganham indicador de continuação e anel de foco inteiro, reaproveitando `useOverflowEdges` e a
receita de folga da 048.

Tudo é markup/CSS em `VodCatalogScreen.tsx` + `vod.css` (+ um componente folha `VodHeroArt.tsx`). Nenhum dado
novo, nenhuma consulta, nenhuma ADR tocada. **As fileiras horizontais do protótipo ficaram fora** (precisam de
uma nova zona de foco, o que contradiz "só visual"); **os detalhes de filme e série também** (escolha do
usuário).

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108` — não remover, CLAUDE.md).

**Primary Dependencies**: as existentes (`@tanstack/react-query`, `@tanstack/react-virtual`). Nenhuma nova.

**Storage**: nenhum. Tudo que a hero e a toolbar mostram já é lido pela tela hoje.

**Testing**: Vitest + Testing Library (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e/*.mjs`, `npm run dev`
rodando), contratos travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), palco 1920×1080.

**Performance Goals**: nenhum `filter: blur`, nenhuma imagem além da capa que a grade já pede (a hero reaproveita
`icon_url` do card focado); a hero troca só texto e `src` — sem consulta, sem transição de layout (Spec §30).

**Constraints**: constitution 1.7.0; ADR-007/009/011; tokens de `index.css`; **contratos travados de 025, 049,
018, 026 e outros montam esta tela** e fixam classes/teclas (ver D-003). Moldura global (`.screen`, topbar) fora.

**Scale/Scope**: 1 componente novo folha (`VodHeroArt.tsx`), edições de JSX em `VodCatalogScreen.tsx`
(hero, cabeçalho da sidebar, toolbar, modal de Ordenar, molduras de rolagem), CSS em `vod.css`. Sem mudança em
`SideCategoryNav`, `ContentCard`, `PosterArt`, `components.css`, `shared.css`.

## Referências do Design System

Precedência (ADR-011): constitution > ADRs > **Spec V14** > **Component Lab** > protótipo. Onde divergem, vale a
Spec/Lab — cada divergência adotada está abaixo. Valores finais do protótipo (bloco CSS do `catalog-*`) já
coincidem com os tokens: `#15181F`=`--bg-surface`, `#1D212B`=`--bg-elevated`, `#2A2F3C`=`--bg-hover`.

| Elemento | Spec V14 | Component Lab / protótipo | Consequência |
| --- | --- | --- | --- |
| Side nav de categorias | §13.2 (pessoais fixas no topo: ★ Favoritos, ↺ Histórico, Todos), §31.1 Seleção | Lab `#navigation` `.sidenav`, `#categoriesv131`; protótipo `.catalog-sidebar` 252px, item 56px/12px | D-002, D-003 |
| Hero/contexto | §32 "Filmes / Séries" (hero/contexto), §6 (H1 40px; mín. 16px; caixa alta só em kicker) | `.catalog-hero-band` min-height 242, `h3` 48px/800, kicker `#FF7A3D` | D-004, D-005; título em `--fs-h1` (48px do protótipo não adotado, como 048 D-015) |
| Toolbar | §14 Inputs/§18 (digitação é fallback, IME sob demanda) | `.catalog-searchbox` 72px/12px com `.helper` "OK"; `.sort-button` rótulo + valor ▾ | D-006; **sem** modal de busca (comportamento) |
| Overflow | §17 (edge fade), §34 QA | Lab `#rails` `.edge-fade` | D-008, FR-010 |
| Foco | §11.1 anel, §11.2 `no-scale` em linhas/itens, §33, §34 | `#focus`, `#categoriesv131` (`no-scale`) | D-007 |
| Cards | §16 portrait 205×302 | `#cards` | **inalterado** (compartilhado com Home/Busca; FR-016) |
| Ícones | §15 SVG local | `#icons` | `<Icon>` existente para lupa; nenhum glifo de sistema novo como elemento principal |
| Performance | §30.2/§30.3/§30.5 | `#performance` | D-005 (sem blur, imagem no tamanho de uso) |
| Estados | §19, §45 | `#feedback` | FR-015: estados atuais, só reposicionados |

## Decisões Invariantes

- **D-001** Só visual. Teclado, `useRemoteNav`, memória de foco (§41), paginação (049), virtualização, busca
  inline (018), ordenação (025), favoritos/histórico: **nenhum arquivo de lógica muda**. A hero continua
  aparecendo só com `showingContent` (como hoje); não passa a aparecer com o foco na sidebar.
- **D-002** Todo visual novo é escopado a `.vod-screen` (classes `vod-*`) em `vod.css`. `SideCategoryNav`,
  `ContentCard`, `PosterArt` e os CSS compartilhados **não mudam** (servem Live, Home, Busca, Configurações).
  Regras sobre `.side-category-nav-item` entram como `.vod-side-nav .side-category-nav-item…`.
- **D-003** Classes e texto preservados (contratos 025/049/018 e ~12 E2E dependem deles): `.vod-screen`,
  `.vod-body`, `.vod-side-nav`, `.vod-content-column`, `.vod-toolbar`, `.vod-toolbar-title`,
  `.vod-toolbar-search-button`, `.vod-toolbar-search-field`, `.vod-toolbar-sort-button`, `.vod-hero-band`,
  `.vod-hero-title`, `.vod-hero-meta`, `.vod-grid`, `.vod-grid-inner`, `.vod-grid-cell`, `.vod-sort-modal-*`,
  `.side-category-nav-*`, `.content-card-*`, `.fav-hint`. O texto "Pesquisar" do botão e "Ordenar" continuam
  presentes (E2E procura por texto/classe). `.vod-hero-eyebrow` muda de conteúdo (rótulo), não de classe.
- **D-004** Rótulo da hero (FR-003): `CCPLAY CINEMA` / `CCPLAY SÉRIES`; `★ SEUS FAVORITOS` e
  `↺ VISTOS RECENTEMENTE` nas entradas pessoais. O grupo do item **continua** na linha de metadados (já está
  lá), então nada deixa de ser mostrado. Strings em caixa alta literais no JSX (não `text-transform`).
- **D-005** Fundo da hero = capa real (`icon_url` do card focado) em `VodHeroArt` (irmão de `LiveHeroArt`:
  camada `.vod-hero-art` sempre no DOM, `<img>` só com capa utilizável, `onError` esconde e não repete a URL).
  Imagem à direita (≈45%), `object-fit: cover`, `opacity` baixa, sob degradê da cor da superfície; **sem
  blur**. A capa pequena de 80px à esquerda sai (a capa vira o fundo). Sem capa: só o degradê de superfície.
  A hero segue `aria-hidden` e sem elemento focável (FR-004).
- **D-006** Toolbar: o campo Pesquisar em repouso (hoje `.vod-toolbar-search-button`) ganha lupa + texto
  "Pesquisar" + dica `.vod-toolbar-search-hint` "OK", altura ≈72px/`--radius-md`, fundo `--bg-surface`; ativo,
  continua o `<input>` inline (`.vod-toolbar-search-field`, `.search-field`/`.field-box` de `shared.css`
  intocados). O botão Ordenar mostra `.vod-toolbar-sort-label` "Ordenar" e `.vod-toolbar-sort-value` "<opção> ▾"
  (o texto concatenado hoje era "Ordenar · <opção> ▾"; nenhum teste fixa o "·" — conferir na T001).
  Os chips "<entrada>" e "N títulos" continuam à esquerda; título da página não existe nesta tela hoje e não é
  criado (moldura global fora).
- **D-007** Foco sem corte: folga `var(--space-2)` + margem negativa igual nos contêineres rolantes (sidebar e
  grade) — receita da 048 D-010/036 — e itens da sidebar **sem escala** no foco (Spec §11.2), por CSS
  escopado (`.vod-side-nav .side-category-nav-item.tv-focus { transform: none }`). Cards da grade mantêm a
  escala de `ContentCard` (§16); a folga da grade é lateral e vertical o bastante para o anel.
  `ROW_HEIGHT`/`CARD_WIDTH`/`CARD_GAP`/`GRID_COLS` **não mudam** (paginação 049 mede o passo).
- **D-008** Indicador de continuação (FR-010): reutilizar `useOverflowEdges` e o padrão `.live-scroll-frame`
  (overlay `::before/::after`, nunca `mask-image` no contêiner rolável). Versão `.vod-scroll-frame` em
  `vod.css` (CSS escopado; **não** reaproveitar a classe `live-*`); degradê da cor de fundo do painel (sidebar:
  `--bg-surface`) e da tela (grade). `scroll-padding-block` = faixa do degradê + folga, e
  `scrollPaddingStart/End` no virtualizador da grade **só se** o item focado ficar sob o degradê na medição
  (T012) — constantes novas em `vodShell.ts`/no próprio arquivo, nunca tocando `ROW_HEIGHT`.
- **D-009** Painel da sidebar: largura **280px** (como a Live pós-R-009 da 048; o protótipo tem 252px, mas
  nomes reais de categoria de provedor não cabem), fundo `--bg-surface`, borda 1px `--bg-elevated`,
  `--radius-lg`, padding `--space-3`; cabeçalho `.vod-side-head` com "Categorias" (e nenhuma segunda linha
  inventada) e divisória `--bg-elevated`. Itens em repouso `--bg-elevated`/borda `--bg-hover`, altura mínima
  56px, `--radius-md`; selecionado = `--accent-tint` + borda `--accent-tint-border` + texto `--accent`
  (Spec §31.1), distinto do foco; contagem em `--text-annotation`. Rodapé de estado só com dado real (FR-012):
  **nenhum dado de sincronização é lido hoje por esta tela; não é criado** — fica sem rodapé (decisão
  registrada; se o executor achar um dado real já em props/hook da tela, documenta em R-003).
- **D-010** Modal de Ordenar: continua o `<Modal>` existente (foco/teclas da 025 intactos); só a lista muda
  de aparência (linhas `--bg-elevated`, marca ✓ da opção atual em `--accent`, foco no padrão V14), via
  `.vod-sort-modal-*`. Nenhuma opção nova.
- **D-011** Altura da hero: **176px** de referência (`min-height` em tokens), menor que os 242px do
  protótipo, para a grade manter ≥ 1 linha inteira de cards visível além do cabeçalho. É um número a validar
  na medição (R-002); se a linha não couber, reduzir a hero, nunca o card.
- **D-012** Detalhes de filme/série, modal de temporada, fileiras e busca em modal ficam como estão
  (Fora de Escopo). A feature não importa nem altera `MovieDetailScreen`/`SeriesDetailScreen`/`vod-detail-*`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | — |
| Segredos Fora dos Clientes e dos Logs | OK | OK | A capa vem de `icon_url` já validada (`normalizeIconUrl`); nenhuma URL de stream/credencial em DOM novo, log ou erro. |
| Categorias da Fonte São Preservadas | OK | OK | Sidebar mostra só nomes declarados; "CCPLAY CINEMA/SÉRIES" é rótulo de seção, não taxonomia; grupo do item segue na linha de metadados. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Nada do conteúdo fictício do protótipo (relevância %, nota, sinopse, "Sincronizado" sem estado real). |
| Comandos Locais Independem de Rede | OK | OK | Nada de rede novo. |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Mesmas ações e teclas (D-001). |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Anel inteiro (D-007); hero não focável e não toca nada (FR-004); estados vazio/erro mantêm ação focável (FR-015). |
| Voltar Restaura Foco e Posição | OK | OK | Memória da 017/025/046/049 intocada (D-001). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | OK | OK | Nenhum progresso novo; a hero só repete metadados já reais ("Continuar de…", "Assistido", "n/m"). |
| Documentação do Repositório É Canônica | OK | OK | Polish atualiza backlog/plan; nenhuma ADR alterada. |

Sem violação; `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/050-filmes-series-paridade-v14/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── features/
│   │   ├── movies/MoviesScreen.paridade-v14.contract.test.tsx   # TRAVADO (2)
│   │   └── vod/
│   │       ├── VodCatalogScreen.tsx      # hero, cabeçalho da sidebar, toolbar, molduras de rolagem
│   │       └── VodHeroArt.tsx            # NOVO: fundo da hero (irmão de live/LiveHeroArt.tsx)
│   ├── lib/focus/useOverflowEdges.ts     # existente (048) — reutilizado, não alterado
│   └── styles/vod.css                    # todo o visual novo, escopado a .vod-screen
└── e2e/
    ├── filmes-series-paridade-v14.mjs    # NOVO (Polish): capturas + anel inteiro + larguras
    ├── filmes-series-ds-v14.mjs          # existente — pode precisar de ajuste de seletor
    └── run.mjs                           # registrar o roteiro novo
```

**Structure Decision**: frontend único em `tv-web/`; Filmes/Séries compartilham `features/vod/VodCatalogScreen.tsx`
(`MoviesScreen`/`SeriesScreen` são casquinhas), então uma edição cobre as duas telas. CSS em `src/styles/vod.css`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso). A feature é quase toda visual:
o contrato cobre o que o jsdom enxerga (estrutura da hero e do cromo); layout, anel inteiro, larguras e
continuação só se medem no navegador → E2E de capturas + `quickstart.md`.

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run src/features/vod src/features/movies src/features/series src/components src/lib/focus
npm run test
npm run test:e2e        # com `npm run dev` rodando
npm run build
```

Integridade das travas (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para
`050-filmes-series-paridade-v14` **e** para as que esta feature pode quebrar: `025-filmes-series-ds-v14`,
`049-navegacao-por-pagina`, `018-busca-por-categoria`, `046-memoria-foco-key-repeat`, `048-live-paridade-v14`
(a Live usa `SideCategoryNav`/`useOverflowEdges`, que **não** mudam — conferir mesmo assim).

Testes não travados que podem precisar de ajuste (desta área): `VodCatalogScreen.test.tsx`,
`MoviesScreen.test.tsx`, `SeriesScreen.test.tsx` (texto "Ordenar · …", eyebrow da hero, capa de 80px) e os E2E
`filmes-series-ds-v14.mjs`, `capa-real.mjs`, `busca-por-categoria.mjs`, `paridade-visual.mjs`. Ajustar ao
comportamento novo especificado — nunca afrouxar o que protegem.

### Testes de Contrato

Arquivo travado em `contract-tests.lock`: `tv-web/src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx`

Comando (de `tv-web/`): `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `hero: rótulo CCPLAY CINEMA, título do card focado, capa real só quando existe, sem nada focável` | US1/AC1+AC2+AC4, FR-001..FR-004, Constitution: Foco Visível | Fase 2 | `expected 'AÇÃO' to be 'CCPLAY CINEMA'` |
| `sidebar com cabeçalho "Categorias"; toolbar com "Ordenar" + opção atual e dica "OK" na busca` | US2/AC1, US3/AC1+AC2, FR-005, FR-006, FR-011 | Fase 3 | `expected null to be 'Categorias'` |

Vermelho confirmado em 2026-10-02 (2/2 falhando por asserção). Sem stubs: os testes só usam a interface pública
(DOM da tela) e as classes fixadas no cabeçalho do arquivo; nada novo é importado.

Fora do contrato (orçamento folgado, mas o resto não é verificável em jsdom): rótulo de **Séries**
(`CCPLAY SÉRIES`), ★/↺ da hero — teste unitário não travado na Fase 2; anel de foco inteiro (SC-002),
indicador de continuação (FR-010, lógica do hook já testada pela 048), larguras, painéis e idênticos de Live/
Configurações/detalhes (FR-016/SC-004) — E2E de capturas e `quickstart.md`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (baseline) | Concluída — tsc limpo; só os 2 contratos da 050 falhavam; T002 (capturas antes) adiada |
| Fase 2 (US1 hero) | Concluída — `VodHeroArt.tsx` + hero em painel; contrato "hero" verde |
| Fase 3 (US2 sidebar/toolbar) | Concluída — painel 280px, itens V14, toolbar, molduras de continuação, anel inteiro |
| Fase 4 (US3 Ordenar/Pesquisar) | Concluída — modal de Ordenar V14; busca inline intacta |
| Fase 5 (Polish) | Concluída com ressalvas — gate verde (tsc/lint/build/E2E 30/30, 2449/2450 testes); 1 teste instável da Live, sem capturas "antes", sem passada na TV |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Fileiras do protótipo (hero + rails) precisariam de uma nova zona de foco acima da grade, contradizendo "só visual" (FR-013) | Alto se ignorado — mudaria foco/memória/paginação e os contratos 025/049 | Decisão do usuário (2026-10-02): fileiras **fora** desta feature; viram feature futura com desenho de foco próprio. |
| R-002 | Hero maior come altura da grade: com hero de 242px (protótipo) sobra pouco mais de uma linha de cards (302+68px) | Médio — grade ilegível | D-011: 176px de referência; T012 mede no navegador; reduzir a hero, nunca o card. |
| R-003 | Rodapé "Sincronizado" da sidebar do protótipo não tem dado real nesta tela | Baixo | D-009: omitido; só entra se o executor achar dado real já disponível e registrar aqui. |
| R-004 | Capa de pôster (retrato) usada como fundo largo da hero fica recortada em faixa horizontal e pode ficar pouco reconhecível | Baixo — só ambiente, esmaecida | D-005 + opacidade baixa; se a revisão visual reprovar, alternativa registrada: capa nítida no tamanho de uso à direita (sem ampliar), na mesma camada. |
| R-005 | Largura 320→280px da sidebar muda quantas colunas cabem? `GRID_COLS=6` e a largura do grid são fixos (6×205+5×24=1350px); a coluna de conteúdo ganha espaço, nunca perde | Baixo | Conferir no E2E que a grade não ganha scroll horizontal. |
| R-006 | Mudar a hero (eyebrow, capa de 80px) e o texto do botão Ordenar pode quebrar testes não travados (`VodCatalogScreen.test.tsx` etc.) | Baixo | Ajustar o teste ao comportamento novo, sem afrouxar. |
| R-007 | Os E2E têm `http://localhost:5173` fixo; um 2º Vite empurra o seu para 5174 e o gate roda no código errado (aconteceu na 048) | Médio — falsos verdes/vermelhos | Conferir quem escuta na 5173 antes do gate (`Get-NetTCPConnection -LocalPort 5173 -State Listen`). |
| R-008 | A 048 está "Em Execução" (T031/T033 abertas) e mexe em `components.css`/`useOverflowEdges`/`liveColumns` na mesma árvore, ainda sem commit | Médio — conflito de CSS/arquivos | Esta feature só **lê** `useOverflowEdges` e não edita `components.css`; commits separados por feature. |
| R-009 | O `overflow: hidden` de `.vod-content-column` cortava o anel de foco da 1ª coluna de cards e dos botões da toolbar (a grade com margem negativa vazava para fora do recorte); o 1º teste de anel do E2E, que media contra a grade, passou falso-positivo | Alto se ficasse — foco cortado | Resolvido: a coluna ganhou `padding: 16px 24px 0` com margem negativa igual; o E2E agora mede contra todos os recortes (`.vod-grid` e `.vod-content-column`). Lição para próximas telas: medir o anel contra o ancestral que recorta, não contra o contêiner rolável. |
| R-010 | `e2e/filmes-series-ds-v14.mjs` (025) está fora do `SUITE` e falha ao entrar na categoria com `ArrowRight` (a 049 passou a paginar com →; OK entra) | Baixo — roteiro obsoleto fora do gate | Não corrigido aqui; confirmar contra o HEAD e atualizar ou aposentar em feature própria. |
| R-011 | `LiveScreen.paginacao.test.tsx` ("lista curta: → vai ao último canal e ← ao primeiro") falhou uma vez na suíte completa e passa isolado | Médio — flake no gate de uma tela que esta feature não toca | Registrado como problema aberto; investigar com `sdd-bugfix`. |

| R-012 | Pedido do usuário (2026-10-02, após ver a tela com categorias reais): o prefixo "Filmes \|" / "Séries \|" é redundante e os nomes ficavam truncados em 280px | Médio — categoria ilegível | Resolvido: `vodGroupDisplay` (`features/vod/vodGroupDisplay.ts`, irmão de `liveGroupDisplay`) tira o prefixo só na exibição (sidebar, chip, hero, meta do card; identidade segue `groupLabel`); sidebar de **340px** (substitui os 280px de D-009; limite é 346px, senão a grade fixa de 1350px ganha scroll horizontal). E2E mede 340px e a ausência do prefixo. |

| R-052 | Feature 052: a hero deixou de ficar sobre a grade e a sidebar de 340px deixou de existir; o contrato `MoviesScreen.paridade-v14.contract.test.tsx` virou `VodScreens.paridade-v14.contract.test.tsx` (hero da vitrine + cromo da toolbar da categoria). O E2E `filmes-series-paridade-v14.mjs` foi substituído por `vitrine-filmes-series.mjs`. | Registro — emenda de contrato travado | Resolvido: executada pela feature 052 com aprovação do usuário (2026-10-02); trava regravada. |
## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fases 1–5 | Hero em painel com capa ao fundo (`VodHeroArt`), sidebar em painel de 340px, toolbar (Pesquisar com "OK", Ordenar label/valor), molduras de continuação (`useOverflowEdges`), modal de Ordenar V14; E2E novo `filmes-series-paridade-v14.mjs` (achou e corrigiu o anel cortado pela coluna). Gate: tsc/lint/build/build:tizen, 2449/2450 testes, E2E 30/30, 6 travas íntegras. | Teste instável `LiveScreen.paginacao.test.tsx`; capturas antes/depois e TV física |

**PRÓXIMO**: `/sdd-converge 050-filmes-series-paridade-v14`; revisão lado a lado (olho humano) de Filmes/Séries com o protótipo — em especial a capa de retrato como fundo da hero (R-004), a altura de 176px (R-002) e o contraste do foco sobre capas claras (guia T07).

## Arquivos Principais

- `tv-web/src/features/vod/VodCatalogScreen.tsx`, `tv-web/src/features/vod/VodHeroArt.tsx` (novo)
- `tv-web/src/styles/vod.css`
- `tv-web/src/lib/focus/useOverflowEdges.ts` (somente leitura)
- `tv-web/src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx` (travado)
- `tv-web/e2e/filmes-series-paridade-v14.mjs` (novo), `e2e/run.mjs`
- `tv-web/src/features/vod/VodCatalogScreen.paridade-v14.test.tsx`, `tv-web/src/features/series/SeriesScreen.hero-paridade-v14.test.tsx` (testes não travados)

## Cuidados para Retomada

- `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` está **modificado e sem commit** no
  working tree: re-ler `catalog()` (linha ~773) antes de comparar visualmente.
- `scroll-padding`/`scrollPaddingStart/End` e a folga do anel dependem uma da outra (aprendizado da 048): mexeu
  numa, mexa nas duas e rode o E2E.
- `innerText` (Playwright) devolve a caixa alta aplicada por CSS; aqui o rótulo já é literal em caixa alta.
- `npm run test:e2e -- --only a,b --jobs 1` não passa pelo PowerShell/npm: use `node e2e/run.mjs --only a,b --jobs 1`.




