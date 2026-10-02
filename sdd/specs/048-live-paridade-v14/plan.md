# Implementation Plan: Paridade visual da TV ao vivo com o Design System V14

**Slug**: `048-live-paridade-v14` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/048-live-paridade-v14/spec.md`

## Summary

Aproximar a TV ao vivo do protótipo V13.2 (`live()`) e da Spec V14 §25 sem mudar comportamento além de
uma tecla. O preview vira um **destaque** (`.live-hero`: rótulo, nome grande, linha "ao vivo", ações em
linha, fundo com o logo real) seguido de até 3 **cartões de programação** reais, lidos por uma função
pura nova irmã de `nowAndNext` (`lib/epg/upcoming.ts`). As colunas de categorias e canais viram
**painéis** com cabeçalho de duas linhas e larguras V14 (200 / 340 / resto); o anel de foco da lista
deixa de ser cortado (receita de folga da feature 036 + `.no-scale`). Trilha e linhas de canal ganham o
acabamento V14 **só na Live**: o `SideCategoryNav` recebe um `tile` opt-in (★, ∞, iniciais) e o resto é
CSS escopado em `live.css`. O teclado ganha uma única adição: → também avança entre as ações.

Tudo é desenho em `liveColumns.tsx`/`LiveScreen.tsx` + CSS; nenhum dado novo, nenhuma consulta nova,
nenhuma ADR tocada. Regras do "como": `logic/destaque-e-programacao.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite (build `chrome108` — não remover, CLAUDE.md).

**Primary Dependencies**: as existentes (`@tanstack/react-query`, `@tanstack/react-virtual`). Nenhuma nova.

**Storage**: nenhum novo. EPG lido do IndexedDB pelo `useEpgPrograms` que a Live já usa (feature 030).

**Testing**: Vitest + Testing Library (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e/*.mjs`, dev
server rodando), contratos travados por `check-contract-tests.ps1`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), palco 1920×1080.

**Performance Goals**: trocar o canal focado não pode ficar mais lento que hoje — nenhum `filter: blur`,
nenhuma imagem além do logo já pedido pela linha, cálculo de próximos programas O(n log n) sobre os
programas de UM canal (já é o custo de `nowAndNext`).

**Constraints**: constitution 1.7.0; ADR-007 (marca só para identidade), ADR-009 (`useRemoteNav` intacto),
ADR-011 (sem preview por foco, sem dado inventado); tokens de `index.css`; **oito arquivos de contrato
travados** de outras features montam a Live (018, 024 ×2, 030 ×2, 031, 046 ×2) e fixam seletores e
teclas (ver Decisões D-003/D-009).

**Scale/Scope**: 1 módulo de lib novo (`lib/epg/upcoming.ts`), 1 módulo de lib extraído
(`lib/initials.ts`), 1 prop opt-in em `SideCategoryNav`, desenho em `liveColumns.tsx` e `LiveScreen.tsx`,
1 ramo em `useLiveKeyboard.ts`, 1 campo em `useLiveCatalog.ts`, CSS em `live.css` (+ 1 regra em
`components.css`).

## Referências do Design System

Precedência (ADR-011): constitution > ADRs > **Spec V14** > **Component Lab** > protótipo. Onde o
protótipo V13.2 diverge da Spec ou do Lab, vale a Spec/Lab — cada divergência adotada está abaixo.

| Elemento | Spec V14 (`CCPlayTV_Design_System_Spec_v14_Spectrum.md`) | Component Lab (`…Component_Lab_v14_Spectrum.html`) | Consequência no plano |
| --- | --- | --- | --- |
| Arquitetura da tela | §25 (Categorias → Canais → Preview; preview maior que painéis auxiliares; Guia completo abre EPG) | — | US1/US2 |
| Painéis | §5.1 (`--bg-surface` = "cards e painéis"), §7 (24px = interior de cards/painéis), §8 (16px = superfícies principais), §31.1 Cards | `#navigation` `.sidenav`, `.panel` | D-014: painel `--bg-surface`, padding `--space-3`, `--radius-lg` (protótipo usava fundo mais escuro e 12px — não adotado) |
| Trilha de categorias | §13.2 (pessoais fixas no topo: ★ Favoritos, Todos), §31.1 Seleção (tint + texto `--accent` + borda tint) | `#categoriesv131` (`.category-item-v131` com `.cat-icon` de iniciais, ★, ∞; `no-scale`; Favoritos com ícone dourado e fundo "pinned"), `#navigation` `.side-item .sicon` | D-008, D-010, D-017 |
| Linha de canal | §25 Channel item (número, logo, nome, programa atual, progresso), §11.2 (rows `no-scale`), §31.1 (progresso laranja) | `#cards` (`.card.compact` para canais) | D-010, D-007; progresso `--accent` (protótipo usava vermelho) |
| Tipografia | §6 (H1/tela 40px/700 Poppins; Display 64px/800; **mínimo 16px**; caixa alta só em kicker/status curto) | `.kicker` | D-015: título da página **fica** em `--fs-h1`; número do canal em `--fs-caption` (protótipo usava 12px — proibido) |
| Botões do destaque | §31.1 Botão primário (64px, `--accent`, texto `--accent-ink`, pill, foco `--accent-light` + anel) e secundário (`--bg-elevated`, borda `--bg-hover`, texto `--text-primary`); §14 "uma ação principal por contexto" | `#actions`, `#states` | D-016 |
| Ícones | §15 (SVG local; **evitar glifos do sistema como elemento principal**), §35 | `#icons` | D-001 revisada: ▶/★ das ações viram `<Icon name="play"/"favorite">` (SVG, sem texto) |
| Ao vivo | §5.5 (`#FF2E87` = live → `--live`), §16.5 (estado AO VIVO) | `.badge.live` | `.live-hero-dot` em `--live` |
| Chips do cabeçalho | §14 Chips ("selected claramente distinto"), §31.1 Seleção | `.chip.selected` | D-015: chip da entrada = `Chip selected` (tint), **não** fundo branco do protótipo |
| Marca | §5.4 (gradiente só em wordmark/ícone/splash) | — | D-007 |
| Foco | §11.1 (anel canônico), §11.2 (no-scale), §33 (vizinhos claros, sem salto diagonal), §34 QA (um foco por vez, foco nunca some) | `#focus`, `#focuspath`, `#qa` | D-009, D-010, R-006 |
| Overflow | §17 (indicar continuação), §34 Visual ("indicador em listas com overflow") | `#rails` (`.edge-fade`) | D-018, FR-021 |
| Performance | §30.2 (imagem no tamanho de uso), §30.3 (transform/opacity, sem filtros permanentes), §30.5 (sem `will-change` geral), §34 ("sem backdrop blur pesado") | `#performance` | D-006 (sem blur) |
| Estados | §19.1–§19.3 (spinner 32/48, empty com ícone + causa + ação) | `#feedback`, `.category-empty-v131` | FR-020: estados existentes, só reposicionados no painel |
| Motion | §10 (140ms, transform/opacity, reduced motion) | `#motion` | sem animação nova; trocas de canal sem transição de layout |

## Decisões Invariantes

- **D-001** Textos das ações ficam **exatamente** `Assistir`, `Favoritar`/`Favorito`, `Guia completo`.
  Os símbolos do protótipo (▶, ☆/★) entram como **ícone SVG local** (`<Icon name="play" />`,
  `<Icon name="favorite" />`, Spec §15) dentro do botão — SVG não altera o `textContent`. Nada de glifo
  de sistema nem `::before` com caractere. "Assistir agora" (protótipo, citado na spec US1) **não** é
  adotado: `e2e/live-tv-ds-v14.mjs` compara `textContent ===` e o contrato da 024 procura por inclusão.
- **D-002** Todo visual novo é **escopado à Live** (`.live-screen`, `.player-zap-columns`, classes
  `live-*`). Componentes compartilhados só ganham opt-in (`SideCategoryNav.tile`); `ChannelRow` e
  `PosterArt` não mudam de markup. As regras-base de `.side-category-nav-*`, `.channel-row*`,
  `.poster-box*`, `.live-state*`, `.live-truncated-note` não mudam (servem outras telas).
- **D-003** Classes existentes preservadas: `.live-preview-panel`, `.live-preview-action`,
  `.live-column-groups`, `.live-column-channels`, `.live-column-title`, `.category-title-row`,
  `.search-icon-button`, `.live-channel-list`, `.live-channel-row`, `.live-item-name`,
  `.side-category-nav-item`/`-label`/`-count`, `.channel-row-now`/`-progress`, `.player-zap-columns`,
  `.live-header`. O texto de `.channel-row-now` continua só o título (contrato 030); o prefixo
  "Agora: " é `::before` em `.live-channel-row .channel-row-now:not(:empty)`.
- **D-004** Os cartões de programação ficam **dentro** de `.live-preview-panel` (o E2E da 030 lê o texto
  do painel). Rótulos em texto normal ("A seguir", "Depois", "Mais tarde"); caixa alta por CSS.
- **D-005** `upcomingAfterNow` segue exatamente a regra de `nowAndNext` (ordenação, sobreposição,
  "depois do atual", deslocamento só na leitura); o 1º item é igual ao `next`. `nowAndNext` não muda
  (contrato travado da 030).
- **D-006** Fundo do destaque = o logo real (`icon_url`), ampliado, `opacity` baixa, sob degradê, **sem
  blur**. Sem logo ou com falha de carga: só o degradê de superfície. Nenhuma outra imagem.
  `.live-hero-art` sempre existe; a `<img>` só quando há logo utilizável.
- **D-007** Placeholder de logo na lista da Live: degradê neutro de superfície (`--bg-elevated` →
  `--bg-hover`), sem a textura listrada, iniciais em `--text-primary`. Nunca `--brand-gradient` (ADR-007:
  marca reservada à identidade do app/lista).
- **D-008** Tile da trilha: ★ (Favoritos, substitui o `icon`), ∞ (Todos), até 2 iniciais do nome
  **declarado pela fonte** (`listInitials` movida para `lib/initials.ts`). Nada inferido por tema.
- **D-009** Teclado: a única mudança é → avançar entre as ações do destaque (clamp na última). ↓/↑
  continuam como hoje; ← volta ao canal de origem de **qualquer** ação (contratos 024 e 031).
- **D-010** Foco sem corte: folga `var(--space-2)` + margem negativa igual nos contêineres com
  `overflow` (lista de canais e trilha), e linhas de canal **e itens da trilha da Live** sem escala no
  foco (Spec §11.2; Lab `#categoriesv131` marca os itens de categoria `no-scale`). Na trilha, como o
  `SideCategoryNav` é compartilhado, a regra é CSS escopado (`.live-column-groups .side-category-nav-item.tv-focus { transform: none }`),
  não a classe no componente. `LIVE_ITEM_ROW_HEIGHT` (84) e a altura da linha (72px) não mudam.
- **D-011** Larguras das colunas como duas medidas locais documentadas em `live.css`
  (`--live-col-groups: 200px`, `--live-col-channels: 340px`, como `guide.css` faz); o destaque ocupa o
  resto. Fora da Live nada muda (`.live-column*` só existe na Live).
- **D-012** Moldura global (padding de `.screen`, topbar, fundo) fora — o ganho de espaço vertical vem
  só da reorganização do conteúdo.
- **D-013** A dica de favoritar (`<FavoriteHint />`) sai da lista da Live; `LIVE_HINTS` já tem
  "Segurar OK — Favoritar" no rodapé. Em Filmes/Séries o `FavoriteHint` continua.
- **D-014** Painéis (Spec §5.1/§7/§8/§31.1): fundo `--bg-surface`, borda 1px `--bg-elevated`,
  `--radius-lg`, padding interno `--space-3`; cabeçalho com divisória `--bg-elevated`. Dentro do painel,
  linhas de canal e itens da trilha em repouso usam `--bg-elevated` (Lab `.category-item-v131`) ou
  transparente, nunca a mesma cor do painel sem distinção.
- **D-015** Cabeçalho (Spec §6, §14, §31.1 prevalecem sobre o protótipo): título **continua** H1
  (`--fs-h1`, Poppins 700) — o "48px/950" do protótipo não é adotado; subtítulo em `--fs-body`
  `--text-secondary`; chips à direita; o chip da entrada usa o `Chip` com `selected` (tint + borda e
  texto `--accent`), **não** o fundo branco do protótipo. FR-015 da spec foi reescrito neste sentido
  (A-002 resolvido em 2026-10-02).
- **D-016** Botões do destaque (Spec §31.1): `Assistir` = primário (altura 64px de referência,
  `--accent`, texto `--accent-ink`, pill; em foco `--accent-light` + anel V14); `Favoritar`/`Favorito` e
  `Guia completo` = secundários (`--bg-elevated`, borda `--bg-hover`, texto `--text-primary`, pill).
  Uma única ação primária (§14).
- **D-017** Tile da trilha (Lab `#categoriesv131`): 34px, `--radius-sm`, fundo `--bg-hover`, texto
  `--fs-caption`; o tile de ★ Favoritos em `--warning` (Lab `.favorite .cat-icon` dourado) e o item
  Favoritos com fundo "fixo" próprio; itens em repouso `--bg-elevated`, `--radius-md`, altura mínima
  48px; selecionado = Spec §31.1 Seleção.
- **D-018** Indicador de continuação (FR-021, Spec §17, Lab `#rails` `.edge-fade`): degradê do fundo
  do painel para transparente, altura `--space-5`, desenhado por **overlay** (`::before`/`::after` de um
  invólucro `position: relative` em volta do contêiner rolável, `pointer-events: none`) — nunca
  `mask-image` no próprio contêiner (esmaeceria o anel de foco). Estado por um hook pequeno
  `useOverflowEdges(ref)` em `tv-web/src/lib/focus/` (scroll passivo + `ResizeObserver`, devolve
  `{ above, below }` e só re-renderiza quando um booleano muda). O item focado nunca fica sob o
  degradê: `scrollPaddingStart`/`scrollPaddingEnd` do virtualizador da lista e `scroll-padding-block`
  na trilha (o `scrollIntoView({ block: 'nearest' })` de `useScrollFocusedIntoView` respeita), ambos
  iguais à altura do degradê. Sem animação contínua (§10/§30.3).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Nada de conta. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | O logo vem de `icon_url` já validada (`normalizeIconUrl`); nenhuma URL de stream/credencial em DOM, log ou erro. |
| Categorias da Fonte São Preservadas | OK | OK | Rótulo e tile derivam só do nome declarado pela fonte (D-008); nenhum ícone/taxonomia externa. |
| IA e Classificação Nunca Inventam Dados | OK | OK | Cartões só com EPG real (D-005); sem EPG, nenhuma faixa/texto; nada do conteúdo fictício do protótipo. |
| Comandos Locais Independem de Rede | OK | OK | Tudo local; nenhuma consulta nova. |
| Trailers e Metadados Não Alteram o Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Mesmas ações e teclas; → passa a funcionar também (D-009). |
| Lista de Catálogo ≠ Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Corrige o anel cortado (D-010); estados vazio/erro mantêm ação focável dentro dos painéis (FR-020); focar não toca nem consulta (ADR-011). |
| Voltar Restaura Foco e Posição | OK | OK | ← volta ao mesmo canal (D-009); memória de foco da 046 intocada. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | Nada de identidade muda. |
| Progresso e Capacidades São Reais | OK | OK | Barra de progresso só com programa atual real; nenhum progresso fictício por canal. |
| Documentação do Repositório É Canônica | OK | OK | Polish atualiza backlog/plan; nenhuma ADR alterada. |

Sem violação; `## Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/048-live-paridade-v14/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    └── destaque-e-programacao.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/
│   │   ├── initials.ts                              # NOVO: listInitials movida de profiles/listAvatar.ts
│   │   ├── focus/useOverflowEdges.ts                # NOVO: bordas com itens ocultos (FR-021, D-018)
│   │   └── epg/
│   │       ├── nowNext.ts                           # pode ganhar helper interno compartilhado (assinatura pública intacta)
│   │       ├── upcoming.ts                          # NOVO (stub do plan): upcomingAfterNow / upcomingForChannel
│   │       └── upcoming.live-paridade-v14.contract.test.ts   # TRAVADO (1)
│   ├── components/
│   │   └── SideCategoryNav.tsx                      # + entry.tile opt-in (stub: tipo já existe, não desenha)
│   ├── features/
│   │   ├── profiles/listAvatar.ts                   # re-exporta listInitials
│   │   └── live/
│   │       ├── LiveScreen.tsx                       # cabeçalho (título, subtítulo, chips à direita)
│   │       ├── liveColumns.tsx                      # painéis, tiles, destaque, cartões, sem FavoriteHint
│   │       ├── useLiveCatalog.ts                    # + activeUpcoming
│   │       ├── useLiveKeyboard.ts                   # → avança entre as ações
│   │       ├── liveTrail.ts                         # comentário de PREVIEW_ACTION_COUNT
│   │       └── LiveScreen.live-paridade-v14.contract.test.tsx  # TRAVADO (4)
│   └── styles/
│       ├── live.css                                 # quase todo o visual novo
│       └── components.css                           # só .side-category-nav-tile
└── e2e/
    ├── live-paridade-v14.mjs                        # NOVO (Polish): capturas + anel inteiro
    └── run.mjs                                      # registrar o roteiro novo
```

**Structure Decision**: frontend único em `tv-web/`; Live em `src/features/live/`, desenho como funções
em `liveColumns.tsx` (regra da 040: não virar componente). CSS da tela em `src/styles/live.css`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run src/features/live src/components src/lib/epg
npm run test
npm run test:e2e        # com `npm run dev` rodando
npm run build
```

Integridade das travas (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>`
para `048-live-paridade-v14` **e** para as travas que esta feature pode quebrar: `018-busca-por-categoria`,
`024-live-tv-ds-v14`, `030-epg-dados-agora`, `031-epg-guia-completo`, `046-memoria-foco-key-repeat`.

Testes não travados que **vão** precisar de ajuste (são desta área, podem ser editados): 
`LiveScreen.epg.test.tsx` (blocos `.live-epg-*`/"A seguir" do preview antigo), possivelmente
`LiveScreen.test.tsx`/`LiveScreen.favorites.test.tsx` (FavoriteHint, `icon` de Favoritos) e os E2E
`e2e/epg-dados-agora.mjs`/`e2e/live-tv-ds-v14.mjs` se algum seletor do preview antigo for usado.
Ajustar o teste ao comportamento novo especificado — nunca afrouxar o que ele protege.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/epg/upcoming.live-paridade-v14.contract.test.ts`,
`tv-web/src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/lib/epg/upcoming.live-paridade-v14.contract.test.ts src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `devolve min(3, futuros) em ordem, o 1º igual ao "A seguir" de nowAndNext, com deslocamento e lacuna` | FR-009, FR-010, SC-003, D-005 | Fase 2 | `Error: not implemented` |
| `destaque: rótulo do grupo, nome, "Ao vivo" sem EPG, fundo com o logo real só quando ele existe` | US1/AC1+AC2, FR-001, FR-002, FR-005 | Fase 3 | `expected undefined to be 'Canal A'` |
| `ações em linha: → avança e para na última, ↑ volta uma, ← volta ao canal de origem` | FR-004, D-009 | Fase 3 | `expected 'Assistir' to contain 'Favoritar'` |
| `programação: com EPG, o atual na linha "ao vivo" e 3 cartões A seguir/Depois/Mais tarde com os próximos reais` | US3/AC1, FR-002, FR-009, SC-003 | Fase 5 | `expected [] to have a length of 3 but got +0` |
| `trilha: tile antes do rótulo (★, ∞, iniciais), rótulo intacto; SideCategoryNav sem tile não desenha nenhum` | US4/AC1, FR-011, FR-017 | Fase 6 | `expected [ undefined, … ] to deeply equal [ '★', '∞', 'TP', 'NO' ]` |

Vermelho confirmado em 2026-10-02 (5/5 falhando pelo motivo esperado); suíte da área sem regressão
(591 verdes) e `npx tsc -b` limpo com os stubs.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/epg/upcoming.ts`
(`throw new Error('not implemented')`), `tv-web/src/components/SideCategoryNav.tsx` (campo `tile` no tipo,
ainda não desenhado).

Fora do contrato (orçamento de 5 já usado; layout não verificável em jsdom): indicador de continuação
(FR-021/SC-006 — lógica do hook coberta por teste unitário com `scrollTop`/`clientHeight` simulados, e
visual no E2E), anel de foco inteiro (US2/FR-008), larguras (FR-007),
painéis (FR-006), visual dos itens (FR-013) e de Filmes/Séries/Configurações intactos (FR-017/SC-004) —
cobertos pelo E2E de capturas do Polish e por `quickstart.md`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (baseline) | Concluída — tsc limpo; só os 5 contratos da 048 falhavam |
| Fase 2 (próximos programas) | Concluída — `upcoming.ts` + `activeUpcoming` |
| Fases 3 e 5 (US1 destaque, US3 cartões) | Concluídas — `.live-hero` + `.live-schedule`, ações em linha, → entre ações |
| Fase 4 (US2 painéis e foco) | Concluída — 200/340px, anel inteiro, `useOverflowEdges` + degradê overlay |
| Fase 6 (US4 itens) | Concluída — tile, linha de canal V14, `is-playing` no zapping |
| Fase 7 (US5 cabeçalho) | Concluída — subtítulo, chips à direita, dica só no rodapé |
| Fase 8 (Polish) | Parcial — gate verde (lint/tsc/2431 testes/build/build:tizen/E2E 28/28, 6 travas íntegras); T031 e T033 (conferência visual) abertas |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Spec US1 cita "▶ Assistir agora", mas os testes E2E/contratos fixam "Assistir" | Médio — executor poderia trocar o texto e quebrar `e2e/live-tv-ds-v14.mjs` | D-001: texto mantido, glifo por CSS. |
| R-002 | `filter: blur()` num elemento grande custa GPU no Tizen a cada troca de foco | Médio — zapping visual lento | D-006: sem blur; opacidade + degradê. Medir na passada manual se houver. |
| R-003 | A folga de 16px na lista pode cortar parte do `--focus-glow` (40px) | Baixo — anel e halo inteiros | D-010 + `.no-scale`; SC-002 mede contorno/halo, não o brilho difuso. |
| R-004 | Mudar `.live-column-groups`/painéis afeta o overlay de zapping | Médio — layout do zapping | Spec pede o mesmo visual no zapping (FR-014); validar com captura no E2E. |
| R-005 | Testes não travados (`LiveScreen.epg.test.tsx` etc.) dependem do preview antigo | Baixo | Ajustá-los na fase em que o preview muda, sem afrouxar o que protegem. |
| R-006 | Com as ações em linha, ↓ avançando para a ação à **direita** contraria Spec §33 ("evitar ↓ saltar para item diagonal"); mantido porque os contratos travados 024/031 exigem ↓ entre ações (decisão do usuário, spec Clarifications) | Médio — navegação menos previsível que o ideal | Aceito por ora; corrigir de verdade exige reabrir os contratos 024/031 (fazer ↓ não fazer nada no destaque). Ver Analyze A-001. |
| R-009 | Com categorias reais ("Canais | Filmes e Séries") as colunas de 200/340px (FR-007/D-011) ficaram ilegíveis; o prefixo "Canais |" era redundante | Médio — não dava para ler a categoria | Decisão do usuário (2026-10-02, validada na tela): colunas **280/400px** (`--live-col-groups`/`--live-col-channels`) e `liveGroupDisplay` (`liveTrail.ts`) tira o prefixo `Canais |` só na exibição (identidade segue `groupLabel`); linha `Agora:` em uma linha com reticências. Substitui 200/340 de D-011/FR-007; o E2E mede 280/400. |
| R-008 | Em "Todos" o rótulo do grupo (.live-item-group, irmão do ChannelRow na linha) esmagava o nome do canal na coluna de 340px (nome com largura 0) — achado pelo gate E2E (usca-por-categoria, live-tv-ds-v14), invisível em jsdom | Alto — canal ilegível em Todos | Resolvido: o rótulo virou a 3ª linha da coluna de texto (ChannelRow ganhou group/groupClassName opcionais, só a Live os usa); guarda no e2e/live-paridade-v14.mjs. |
| R-007 | Spec §17 e QA §34 pedem indicador de overflow em listas longas; a lista de canais não tem e a spec 048 não pede | Baixo — continuidade pouco perceptível | Resolvido: incluído nesta feature como FR-021 (decisão do usuário, 2026-10-02) — D-018, task T015. |
| R-010 | Feature 049 (navegação por página, 2026-10-02): os 3 botões do destaque (Assistir/Favoritar/Guia completo) saem; OK toca, Segurar OK favorita, o Guia vira o ícone ao lado da lupa; → pagina as listas. O contrato travado desta feature foi emendado (teste de \"ações em linha\" substituído) e a trava regravada. | Médio — a US1 da 048 muda de forma | Registrado em \sdd/specs/049-navegacao-por-pagina/plan.md\ (R-008..R-012). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fases 1–2 | Baseline: tsc limpo, 5 falhas = contratos da 048, travas íntegras. `upcoming.ts` implementado sobre `resolveSchedule` (extraído de `nowNext.ts`), `activeUpcoming` em `useLiveCatalog`, `upcoming.test.ts`. | Nenhuma |

| 2026-10-02 | Fases 3–7 + Polish | Destaque, painéis 200/340, anel inteiro e indicador de continuação, cartões, tile/linha de canal/`is-playing`, cabeçalho. E2E novo `live-paridade-v14.mjs`; E2E 030 ajustado; achado R-008. Gate: lint/tsc/2431 testes/build/build:tizen/E2E 28/28; 6 travas íntegras. | T031 e T033 (conferência visual) |

**PRÓXIMO**: T031 (capturas Filmes/Séries/Configurações) e T033 (revisão lado a lado com o protótipo/Lab e Tizen QA matrix §34) — só então `update-feature-status.ps1 -Status Implementada` e `/sdd-converge`. A-004 (`docs/guia-praticas-app-tv/`) não foi consultado.

## Arquivos Principais

- `tv-web/src/lib/epg/upcoming.ts`, `tv-web/src/lib/epg/nowNext.ts` (helper `resolveSchedule`), `tv-web/src/lib/epg/upcoming.test.ts`
- `tv-web/src/features/live/useLiveCatalog.ts` (`activeUpcoming`)
- `tv-web/src/features/live/liveColumns.tsx` (destaque, painéis, moldura de scroll), `LiveHeroArt.tsx`, `useLiveKeyboard.ts`, `liveTrail.ts`, `LiveScreen.tsx`
- `tv-web/src/styles/live.css`, `components.css` (`.side-category-nav-tile`), `tv-web/src/components/SideCategoryNav.tsx` / `ChannelRow.tsx`, `tv-web/src/lib/focus/useOverflowEdges.ts`, `tv-web/src/lib/initials.ts`
- `tv-web/e2e/live-paridade-v14.mjs` (+ `run.mjs`), `e2e/epg-dados-agora.mjs`

## Cuidados para Retomada

- Os scripts E2E têm `http://localhost:5173` fixo: um 2º Vite (ex.: de um worktree temporário) na 5173 empurra o seu para a 5174 e o gate roda contra o código errado — confira quem escuta na 5173 antes (`Get-NetTCPConnection -LocalPort 5173 -State Listen`). Aconteceu aqui (`AppData\Local\Temp\wt-047-head`) e deu falsos verdes/vermelhos.
- `npm run test:e2e -- --only a,b --jobs 1` não passa pelo PowerShell/npm (vira `--only` do npm): use `node e2e/run.mjs --only a,b --jobs 1`.
- O virtualizador mede a partir do início do conteúdo, sem o padding de 16px do contêiner: por isso `LIVE_EDGE_SCROLL_PADDING_END` = 48 + 2×16. Mexeu na folga do anel, mexa nas duas constantes e rode o E2E da 048.
- `innerText` (Playwright) devolve a caixa alta aplicada por CSS (`text-transform`): compare com `/i`.
- Os CSS de colunas precisam de `.live-column.live-column-*` (2 classes) para vencer `shared.css`, que carrega depois de `live.css`.
