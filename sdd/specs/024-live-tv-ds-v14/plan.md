# Implementation Plan: Live TV no Design System V14 (Onda 3)

**Slug**: `024-live-tv-ds-v14` | **Date**: 2026-09-27 | **Spec**: `sdd/specs/024-live-tv-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

A Live TV passa ao layout V14 sob a topbar da feature 023:

- coluna de categorias no padrão `SideCategoryNav`;
- lista virtualizada de `ChannelRow`;
- painel de preview sem vídeo, com três ações ("Assistir", "Favoritar",
  "Guia completo" em "Em breve");
- zapping em 2 colunas.

O comportamento das features 010, 013, 016, 018 e 020 não muda. A troca é
de apresentação dentro de `LiveScreen.tsx`, que ganha uma prop opcional
`shell` para compor `AppShell`+`TopBar` sem quebrar quem a monta sozinha,
incluindo o contrato travado da 018.

Dois dados reais entram na camada de catálogo, em exceção limitada à
estratégia "strangler" (D-001):

- **Logo do canal**: a feature 015 excluiu o canal de propósito; esta
  feature inverte isso.
- **Número do canal**: vem de uma posição gravada por categoria mais as
  contagens conhecidas das categorias anteriores. O `num` do painel Xtream
  entra só se for confirmado como global (R-001).

A navegação ganha a ação `switch-top`, para a topbar da Live trocar de
destino sem empilhar.

## Technical Context

**Language/Version**: TypeScript ~6.0, React 19.2 (`tv-web/`).

**Primary Dependencies**: Vite 8 (alvo `chrome108`), `@tanstack/react-query` 5, `@tanstack/react-virtual` 3, Dexie 4. Componentes da feature 022 (`SideCategoryNav`, `ChannelRow`, `PosterArt`, `ErrorState`, `EmptyState`, `Chip`, `Icon`). Shell da feature 023 (`AppShell`, `TopBar`, `HintBar`).

**Storage**: IndexedDB via Dexie (`tv-web/src/lib/catalog/db.ts`). Dois campos de valor novos em `CatalogRecord`, sem índice e sem bump de versão (`data-model.md`).

**Testing**: Vitest 5 + Testing Library + jsdom + `fake-indexeddb` (global em `src/setupTests.ts`); Playwright via scripts `tv-web/e2e/*.mjs` e `tv-web/e2e.mjs`.

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), palco lógico 1920×1080 (`Stage`).

**Performance Goals**:

- Lista de canais virtualizada: SC-004, 500 canais sem montar mais que a janela visível mais o overscan.
- Glow só no item focado.
- Logos em `loading="lazy"` dentro da janela virtual (feature 015, D-007).

**Constraints**:

- Sem `:has()`, sem `backdrop-filter`, sem `will-change` em massa (roteiro §3).
- Só tokens de `index.css`.
- Foco é estado mais `.tv-focus` (ADR-009).
- `webapis.avplay` é singleton: o preview não reproduz nada (ADR-011).
- Os contratos travados da 018, 020, 022 e 023 não podem ser editados.

**Scale/Scope**: fontes reais com centenas de categorias e dezenas de milhares de canais; uma tela redesenhada (`LiveScreen.tsx`, ~880 linhas hoje).

## Decisões Invariantes

- **D-001 — Apresentação troca, lógica fica.** Os hooks de catálogo, favoritos, busca e prefetch (`catalogApi.ts`, `useCategoryFocusPrefetch`, `useFavoriteToggle`, `searchWithinItems`) e o `PlayerLayer` não mudam de comportamento. A exceção em `lib/` tem três partes, e só elas:
  - capturar `iconUrl` de canal (`classifier.ts`, `xtreamConnector.ts`);
  - gravar `categoryPosition` (`catalogRepository.ts`);
  - condicionalmente, `sourceNumber` (R-001).
- **D-002 — O shell mora na `LiveScreen`, por prop opcional `shell`** (`logic/foco-live-shell.md` §1).
  - Sem `shell`, a tela funciona sozinha, como os testes a montam hoje.
  - Com o player aberto, só o `PlayerLayer` é renderizado, então a topbar some por construção (FR-004) e nada da moldura pinta sobre o plano de hardware (FR-005).
- **D-003 — Composição de foco igual à 023.**
  - `zone: 'topbar' | 'content'` e escopos ativos/inativos.
  - `TopBar` com `modal: active`.
  - O conteúdo nunca muda a zona da topbar, e vice-versa.
  - A única saída para a topbar é ↑ em "★ Favoritos" (índice 0 da trilha).
  - RETURN na topbar da Live chama `onBack` (Início), como na trilha.
- **D-004 — `switch-top` troca o destino de topo sem empilhar.** A topbar da Live em Filmes/Séries despacha `{type:'switch-top'}`. RETURN no destino novo volta ao Início. "Início" na topbar da Live é `back`: a Live só é alcançável a partir do Início, então o topo da pilha é sempre o Início.
- **D-005 — Preview é a coluna 2, com ações empilhadas na vertical** (Assistir → Favoritar/Favorito → Guia completo).
  - → no canal entra sempre em "Assistir".
  - ↑/↓ andam entre as ações, com clamp.
  - ← ou RETURN voltam ao mesmo canal.
  - Vertical, e não em linha como no protótipo, porque ← precisa voltar ao canal a partir de qualquer ação (FR-014; R-4 do roteiro: vizinhos explícitos).
  - Os gestos de favoritar (segurar OK, tecla amarela) valem só na coluna de canais.
- **D-006 — Número do canal = `channelNumberOf(item, categorias)`** (`logic/numero-do-canal.md`).
  - Função pura, com uma só definição de "contagem conhecida" (`knownCategoryCount`), usada também pela contagem da coluna de categorias (FR-008).
  - `source_number` vence o cálculo, mas só existe se o R-001 confirmar.
  - Nunca grava, compara ou indexa pelo número.
- **D-007 — Logo via `PosterArt` com variante `logo`.**
  - O fallback são as iniciais do nome (até 3 caracteres), sem o rótulo "pôster".
  - A variante `poster`, padrão, continua idêntica. O contrato travado da 022 (C5) depende dela.
  - `ChannelRow` passa a usar a variante `logo`.
  - O foco de estado da linha fica no `<button>` que envolve a `ChannelRow`, não no logo.
- **D-008 — Seletores fixados.**
  - Pelo contrato da 018: `.live-item-name` no nome do canal, `.search-icon-button`, `input.search-field`.
  - Pelo contrato da 024: `.side-category-nav-item`, `.topbar-item`, `.live-preview-panel`.
  - A `ChannelRow` ganha `nameClassName` só para manter `.live-item-name`.
- **D-009 — Zapping sem preview e sem topbar.** `renderColumns({ withPreview })`: a tela passa `true`, o `topLayer` do zapping passa `false`.
- **D-010 — Um arquivo CSS próprio.** `tv-web/src/styles/live.css`, importado em `main.tsx` depois de `components.css`. As regras `.live-*` antigas de `screens.css` que ficarem sem uso saem na mesma feature. A quebra geral do `screens.css` é da Onda 7.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada novo de conta; perfil = lista (ADR-011). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | O logo é URL declarada pela fonte, gravada como `iconUrl` (ADR-010 já cobre URLs do catálogo no aparelho). Nunca em log, erro ou texto (FR-032). A verificação do `num` (R-001) não registra credencial. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Ordem e nome da fonte (`groupLabel`), "★ Favoritos"/"Todos" são virtuais e nunca substituem categoria (FR-007). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Número `null` quando não derivável; contagem só quando conhecida; `num` só com confirmação (D-006, R-001). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Navegação, preview e favoritar são locais. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | ✅ | ✅ | Não se aplica: sem trailer nem metadado externo. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Favoritar ganha um terceiro caminho (botão no preview), além de segurar OK e da tecla amarela. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | ✅ | ✅ | Sem mudança no caminho de reprodução. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Pré-design: os estados de topo atuais (carregando/erro/lista vazia) mostram "Voltar"/"Tentar de novo" com `.tv-focus`, mas SELECT não os aciona. Isso é bug pré-existente, corrigido no escopo (FR-027, R-005). O preview sem canal não tem ação focável, e o foco fica na trilha (FR-018). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Preview ↔ canal por `channelId`; topbar ↔ conteúdo sem remontar estado; `switch-top` sempre volta ao Início com o foco de origem. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | O número é só exibição (FR-031); favoritos continuam por `stableIdOf`. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | Slot "Agora" vazio, sem barra; "Guia completo" é mock "Em breve" registrado; "Assistir" soft disabled sem fonte de reprodução. |
| Documentação do Repositório É Canônica | ✅ | ✅ | A ADR-011 §6 ganha nota inline `**Atualização (feature 024):**` sobre a derivação do número (T043). CLAUDE.md e backlog são atualizados no converge. |

Sem violação não justificável. O ⚠️ pré-design é bug pré-existente dentro
do escopo da tela, resolvido pelo próprio design.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/024-live-tv-ds-v14/
├── spec.md
├── plan.md                  # este arquivo
├── research.md              # R1 (`num` do painel), R2 (logo)
├── data-model.md
├── logic/
│   ├── numero-do-canal.md
│   └── foco-live-shell.md
├── quickstart.md
├── contract-tests.lock
└── tasks.md
```

### Source Code (repository root)

Só o que esta feature toca, na estrutura real:

```text
tv-web/
├── e2e/
│   ├── zapping-live-tv.mjs            # atualizar seletores
│   ├── busca-por-categoria.mjs        # atualizar seletores
│   ├── favoritos.mjs                  # atualizar seletores
│   ├── ciclo-vida-player.mjs          # conferir/atualizar
│   ├── m3u-sob-demanda.mjs            # conferir/atualizar
│   └── live-tv-ds-v14.mjs             # NOVO
├── src/
│   ├── App.tsx                        # passa `shell` para a LiveScreen
│   ├── main.tsx                       # importa styles/live.css
│   ├── navigation/
│   │   ├── appNav.ts                  # ação `switch-top` (stub já criado)
│   │   └── appNav.live-tv-ds-v14.contract.test.ts        # TRAVADO
│   ├── components/
│   │   ├── PosterArt.tsx              # variante `logo`
│   │   ├── ChannelRow.tsx             # number?, nameClassName, favorite, unavailable
│   │   └── SideCategoryNav.tsx        # focusedRef, pinnedBadge, className por entrada
│   ├── features/
│   │   ├── shell/TopBar.tsx           # currentItem, onGoHome
│   │   ├── catalog/catalogApi.ts      # campos novos em CatalogItemOut (stub) + toItemOut
│   │   └── live/
│   │       ├── LiveScreen.tsx         # redesenho + shell + preview
│   │       ├── channelNumber.ts       # stub já criado
│   │       ├── channelNumber.live-tv-ds-v14.contract.test.ts   # TRAVADO
│   │       ├── LiveScreen.live-tv-ds-v14.contract.test.tsx    # TRAVADO
│   │       ├── LiveScreen.busca-categoria.contract.test.tsx   # TRAVADO (018) — não editar
│   │       ├── LiveScreen.test.tsx    # atualizar seletores
│   │       └── LiveScreen.favorites.test.tsx  # atualizar seletores
│   ├── lib/
│   │   ├── comingSoon.ts              # mock `epg-guide`
│   │   └── catalog/
│   │       ├── db.ts                  # categoryPosition, sourceNumber (docs de campo)
│   │       ├── classifier.ts          # iconUrl de canal
│   │       ├── xtreamConnector.ts     # stream_icon (+ num, se R-001)
│   │       ├── catalogRepository.ts   # categoryPosition nas duas escritas por categoria
│   │       └── channelLogo.live-tv-ds-v14.contract.test.ts    # TRAVADO
│   └── styles/live.css                # NOVO
sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md   # nota inline em §6
```

**Structure Decision**:

- Frontend único em `tv-web/`; o `api/` não é tocado (fallback congelado, ADR-008).
- Componentes compartilhados em `src/components/`, tela em `src/features/live/`, navegação em `src/navigation/`, dados em `src/lib/catalog/`.
- É a mesma divisão das features 021 a 023.

## Complexity Tracking

Sem violações a justificar.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>          # o mais estreito primeiro
npm run test                      # suíte completa (vitest run)
npx tsc -b
npm run lint
npm run build
npm run build:tizen
npm run dev                       # antes dos E2E
npm run test:e2e                  # e2e.mjs
node e2e/<script>.mjs             # scripts por feature (override do Chromium no Windows)
```

- **Paridade de comportamento**: `LiveScreen.test.tsx` e `LiveScreen.favorites.test.tsx` mudam só seletores e o que o layout novo exige, nunca asserção de comportamento. Uma asserção que parar de fazer sentido é registrada em `Riscos e Decisões` antes de mudar.
- **Flake conhecido**: `*.favorites.test.tsx` e `LiveScreen.test.tsx` falham às vezes sob paralelismo da suíte completa e passam isolados. Confirmado de novo neste plano: 15/15 isolado. Falha nova nesses arquivos precisa ser rodada isolada antes de ser tratada como regressão.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/features/live/channelNumber.live-tv-ds-v14.contract.test.ts`
- `tv-web/src/navigation/appNav.live-tv-ds-v14.contract.test.ts`
- `tv-web/src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx`
- `tv-web/src/lib/catalog/channelLogo.live-tv-ds-v14.contract.test.ts`

Comando (em `tv-web/`):

```powershell
npx vitest run src/features/live/channelNumber.live-tv-ds-v14.contract.test.ts src/navigation/appNav.live-tv-ds-v14.contract.test.ts src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx src/lib/catalog/channelLogo.live-tv-ds-v14.contract.test.ts
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `channelNumberOf` — deriva o número da ordem da fonte, igual em qualquer entrada, e some quando não é derivável | FR-030, FR-031, SC-005, US4/AC3-AC4, Constitution: "Progresso e Capacidades São Reais" | Fase 2 | `Error: not implemented` |
| `appNav` — topbar da Live troca de destino de topo sem empilhar, e RETURN volta sempre ao Início | FR-001, FR-003, D-004 | Fase 2 | `AssertionError: expected { name: 'live' } to deeply equal { name: 'movies' }` |
| logo do canal — M3U (tvg-logo) e provedor (stream_icon) capturam o logo; inválido vira ausência | FR-028, US4/AC1-AC2 | Fase 2 | `AssertionError: expected undefined to be 'http://exemplo.test/espn.png'` |
| `LiveScreen` — sob a topbar: ↑ em ★ Favoritos sobe para "TV ao vivo", ↓ volta ao mesmo item, RETURN na topbar volta ao Início | US1/AC1-AC2, US1/AC5, FR-001..FR-003, SC-003 | Fase 3 | `AssertionError: expected undefined to be defined` (sem `.topbar-item`) |
| `LiveScreen` — preview: sem canal não tem ação; → leva a "Assistir", favoritar alterna o rótulo, ← volta ao canal, Assistir abre o player | US2/AC1-AC3, US2/AC5-AC6, FR-014..FR-016, FR-018, Constitution: "Foco Visível e Sem Becos Sem Saída" | Fase 5 | `AssertionError: expected undefined to be true` (sem "Assistir" no preview) |

Vermelho confirmado em 2026-09-27: 5/5 falhando por asserção ou
`not implemented`, nenhum por import, sintaxe ou tipo. A suíte da área
(`src/features/live`, `src/navigation`, `src/lib/catalog`,
`src/features/shell`) ficou com 396 testes passando mais os 5 contratos
vermelhos. A única outra falha foi o flake conhecido de
`LiveScreen.favorites.test.tsx` (b), que passou 15/15 isolado. `tsc -b`
limpo; lint só com avisos pré-existentes.

**Stubs criados pelo plan** (ponto de partida do execute, não travados):

- `tv-web/src/features/live/channelNumber.ts` (`channelNumberOf` lança `not implemented`; falta `knownCategoryCount`).
- `LiveShellProps` e a prop `shell?` em `tv-web/src/features/live/LiveScreen.tsx` (ainda ignorada).
- A ação `switch-top` na união `AppNavAction` de `tv-web/src/navigation/appNav.ts` (o redutor ainda não a trata).
- Os campos `category_id`, `category_position` e `source_number` em `CatalogItemOut` (`tv-web/src/features/catalog/catalogApi.ts`, ainda não mapeados em `toItemOut`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída. R-001 resolvido (refutado). Mock `epg-guide` registrado. |
| Fase 2 (Foundational) | Concluída. Logo de canal capturado, `categoryPosition`/`channelNumberOf` prontos, `switch-top` tratado, componentes (PosterArt/ChannelRow/SideCategoryNav/TopBar) estendidos. |
| Fase 3 (US1) | Concluída. `LiveScreen` redesenhada por completo sob a topbar (shell, 3 colunas, cabeçalho, estados com componentes V14); bug pré-existente R-005 corrigido. |
| Fase 4 (US3) | Concluída. Zapping em 2 colunas sem preview/topbar; favoritos/busca/prefetch/ciclo de vida intactos. |
| Fase 5 (US2) | Concluída. Preview com as 3 ações (Assistir/Favoritar/Guia completo), navegação vertical, sem preview órfão. |
| Fase 6 (US4) | Concluída. Logo e número do canal ligados na lista, zapping e preview. |
| Fase 7 (Polish) | Concluída. E2E atualizados (T040/T041) + 1 achado real corrigido (R-009, CSS compartilhada) + 1 gap de plano corrigido (R-010, `capa-real.mjs`); novo `live-tv-ds-v14.mjs` (27 verificações); ADR-011 §6 com nota inline; `quickstart.md` executado (7/7 itens da constitution); todos os gates finais (suíte/tsc/lint/build/build:tizen) limpos. Feature código-completa; só a passada na TV física fica como pendência recomendada, não bloqueante. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O `num` de `get_live_streams` pode não ser global (painéis Xtream costumam numerar a própria resposta, recomeçando em 1 a cada categoria filtrada). | Sem ele, a maioria dos canais de uma fonte Xtream fica sem número até as categorias anteriores serem lidas. | **Resolvido (T001, 2026-09-27): refutado.** Verificado contra um painel Xtream real (credencial de teste do `.env` da raiz, nunca impressa) — resposta sem filtro com 2266 canais, `num` único 1..2266; filtrando por 2 categorias fora a primeira, só 5/122 e 0/79 bateram com o `num` sem filtro. `num` não é adotado; `sourceNumber` não é capturado (T004/T017 dispensadas). Live TV usa só a regra derivada (`logic/numero-do-canal.md`). Detalhe em `research.md` R1. |
| R-002 | Seletores de E2E e testes por classe (`.live-item`, `.live-item-favorites`, `.live-column-*`) vão quebrar com o layout novo. | E2E e testes vermelhos sem regressão real. | **Resolvido (T040/T041)**. Testes unitários e os 4 E2E que tocam a Live (`zapping-live-tv.mjs`, `busca-por-categoria.mjs`, `favoritos.mjs`; `ciclo-vida-player.mjs`/`m3u-sob-demanda.mjs` não precisaram de mudança) atualizados e verdes contra um dev server recém-iniciado. `paridade-visual.mjs` (feature 021, evidência histórica) corrigido pra não travar (`.live-item`→`.live-channel-row`), mas não re-executado — rodá-lo sobrescreveria a evidência "zero mudança de layout" da 021 com o layout novo desta feature, que muda de propósito. Os seletores fixados por contrato ficam intactos (D-008). |
| R-003 | Inverte o FR-009 da feature 015 ("canal nunca captura capa"), afirmado por 3 testes não travados (`classifier.test.ts:89`, `xtreamConnector.test.ts:229`, `importPipeline.test.ts:958`). | Três testes passam a contradizer a decisão nova. | **Resolvido**: decisão do usuário na spec (Clarifications). Os três testes foram invertidos na T005, com comentário apontando para esta feature. A 015 não foi reaberta. Confirmado pelo `sdd-converge` (2026-09-27): os três arquivos afirmam hoje o oposto, e passam. |
| R-004 | Registros gravados antes desta feature não têm `categoryPosition`, e fontes M3U `eager` (anteriores à 014) nunca o ganham sem ressincronizar. | Canais sem número até a categoria ser relida ou a fonte ressincronizada. | **Resolvido (aceito)**: é ausência, nunca um número errado (FR-030). Registrado em `logic/numero-do-canal.md` §4. Sem migração forçada. Confirmado pelo `sdd-converge`: `channelNumberOf` devolve `null` para posição ausente, nunca inventa. |
| R-005 | Bug pré-existente: os estados de topo da Live (carregando categorias, erro, lista vazia) mostram "Voltar"/"Tentar de novo" com `.tv-focus`, mas SELECT não os aciona (só o mouse). | Viola "Foco Visível e Sem Becos Sem Saída" (RETURN ainda funciona, então não é beco total). | **Resolvido**: corrigido no escopo — estados reescritos com `ErrorState`/`EmptyState` e SELECT ligado à ação focada (T021), com 4 testes dedicados (T025) e o E2E `live-tv-ds-v14.mjs` confirmando em Chromium real. |
| R-006 | Com a topbar, o conteúdo da Live perde altura. Os cálculos de virtualização (`LIVE_ITEM_ROW_HEIGHT`) e o E2E de virtualização usam medidas antigas. | Janela virtual errada, ou E2E de SC-004 frágil. | **Resolvido**: `LIVE_ITEM_ROW_HEIGHT` mantido em 84px (linha real de 72px + 12px de espaço, igual ao antigo) — a topbar reduz a altura disponível mas não o tamanho da linha; virtualização continua funcionando (T009/T010 de `LiveScreen.test.tsx`, com 5000 itens). A janela real no palco 1920×1080 foi medida no E2E `live-tv-ds-v14.mjs` (T045): categoria com 500 canais monta 12–18 linhas, nunca a categoria inteira. |
| R-007 | Custo de render na TV: logos de rede mais glow em linhas. | Rolagem pesada no QN50Q60. | **Em aberto** — só a TV física decide. Logo `lazy` dentro da janela virtual; glow só no item focado (mitigação de código, já em produção). Passada na TV recomendada pela spec (Assumptions), não gate — não realizada nesta sessão (sem acesso ao aparelho). |
| R-008 | O flake pré-existente de `*.favorites.test.tsx` sob paralelismo da suíte completa (documentado desde a feature 013) se manifestou em 3 pontos diferentes nesta feature (testes (b)/(l)/(n) de `LiveScreen.favorites.test.tsx`, e também em `MoviesScreen.favorites.test.tsx`, arquivo não tocado por esta feature — prova de que é sistêmico, não introduzido aqui). | Ruído em execuções da suíte completa; nenhuma perda de cobertura real. | **Resolvido**: confirmado 88/88 isolado (`LiveScreen.favorites.test.tsx` + `LiveScreen.test.tsx` + `MoviesScreen.favorites.test.tsx`) na passada final do `sdd-execute`. Nenhuma ação — mesmo padrão já aceito nas features 013/019/021/022/023. |
| R-009 | **Bug real introduzido e corrigido durante esta feature** (achado pelo E2E `busca-por-categoria.mjs`, não por nenhum teste unitário — jsdom não aplica CSS): T022 tratou `.live-item`/`.live-item-favorites`/`.live-item-all`/`.category-title-row`/`.search-icon-button`/`.search-field*`/`.search-status`/`.search-coverage`/`.live-state*`/`.live-truncated-note` como exclusivas da Live e as removeu de `screens.css` — mas `MoviesScreen.tsx`/`SeriesScreen.tsx` (ainda não migradas, Onda 4) também dependem delas, sem estilo próprio. | Filmes/Séries ficariam com a trilha de categorias, os estados de erro/vazio e o campo de busca sem nenhum estilo (sem padding, cor, foco visual) — regressão visual real, silenciosa nos testes unitários. | **Resolvido**: as regras compartilhadas voltaram para `screens.css` (com nota explicando a natureza cross-tela), e `live.css` ficou só com o que é exclusivo da Live V14 nova. Confirmado com `busca-por-categoria.mjs` (que exercita Filmes) verde, e reconfirmado pelo `sdd-converge` lendo o CSS final. |
| R-010 | Lacuna do próprio plano: `tv-web/e2e/capa-real.mjs` (feature 015) também toca a Live TV (a asserção original era literalmente "canal nunca mostra capa, FR-009") e não estava listado em nenhuma task de Fase 7 — só apareceu ao rodar os scripts durante T040/T041. | Sem correção, o script ficaria vermelho pra sempre, e por um motivo que é exatamente o oposto de um bug: a feature 024 inverteu aquele FR-009 de propósito (R-003). | **Resolvido**: corrigido como task ad-hoc (T047): seletor de entrada trocado (`.side-category-nav-item.tv-focus`), asserção invertida (canal agora TEM `<img>` de logo). 20/20 verde. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-27 | Fase 1 (Setup) | T001: verificado contra painel Xtream real (credencial de teste do `.env` da raiz, via script isolado que nunca imprimiu a credencial) — `num` de `get_live_streams` **refutado** como global (5/122 e 0/79 bateram filtrando por categoria); `sourceNumber` não será capturado, T004/T017 dispensam a parte condicional. T002: mock `epg-guide` registrado (item 42), teste do registro atualizado. | Nenhuma. |
| 2026-09-27 | Fase 2 (Foundational) | T003–T013 completas: logo de canal capturado (M3U + provedor, sem `sourceNumber`), 3 testes da 015 invertidos, `categoryPosition` gravado pelas duas escritas por categoria, `category_id`/`category_position`/`source_number` mapeados em `toItemOut`, `channelNumberOf`/`knownCategoryCount` implementados (contrato verde), `switch-top` tratado no `appNavReducer` (nota inline na 023), `PosterArt` com `variant="logo"`, `ChannelRow`/`SideCategoryNav`/`TopBar` estendidos sem quebrar nada existente. 508/508 testes da área, `tsc -b` limpo, contratos da 024 (3/3) e travados da 022/023 (6/6) verdes. | Nenhuma. |
| 2026-09-27 | Fases 3–6 (US1/US3/US2/US4) | `LiveScreen.tsx` redesenhada por completo numa só passagem (as 4 fases tocam o mesmo arquivo/`renderColumns`): shell sob a topbar com escopos topbar/conteúdo, 3 colunas V14 (`SideCategoryNav`/`ChannelRow`/preview), cabeçalho com chips, todos os estados com `ErrorState`/`EmptyState`/`Spinner` (corrigindo R-005: SELECT morto nos 3 estados de topo), zapping em 2 colunas sem preview/topbar (D-009), preview com 3 ações verticais (Assistir/Favoritar/Guia completo mock) sem nunca ficar órfão, logo e número do canal ligados em lista/zapping/preview. `live.css` criado, `screens.css` perdeu as regras `.live-*` mortas. Verificado num Chromium real via Playwright (shell, foco, switch-top, RETURN em camadas, preview, glow). 5/5 contratos da 024 verdes, contrato travado da 018 (4/4) e da 020 (4/4) sem edição, contratos da 022/023 intactos. 1094 testes na suíte completa (5 falhas, todas o mesmo flake pré-existente de `*.favorites.test.tsx` sob paralelismo, confirmadas passando isoladas — mesmo padrão já documentado nas features 013/019/021/022/023). `tsc -b`/lint/`build`/`build:tizen` limpos. | Nenhuma. |
| 2026-09-27 | Fase 7 (Polish) | E2E: `zapping-live-tv.mjs` passou sem mudança; `busca-por-categoria.mjs`/`favoritos.mjs` corrigidos (trilha agora `.side-category-nav-item`); `ciclo-vida-player.mjs`/`m3u-sob-demanda.mjs` sem mudança. **R-009 (achado real)**: T022 removeu de `screens.css` regras (`.live-item`, `.category-title-row`, `.search-icon-button`, `.live-state*` etc.) que `MoviesScreen`/`SeriesScreen` (não migradas) também usam — restauradas. **R-010**: `capa-real.mjs` (feature 015) não estava no plano, tocava a Live e afirmava o oposto do que a 024 decidiu (R-003) — corrigido (T047 ad-hoc). Novo `tv-web/e2e/live-tv-ds-v14.mjs` (27 verificações: topbar↔Live, preview, logo quebrado, número estável entre categoria/Todos/Favoritos, virtualização com 500 canais, SC-002 em 5 pontos) — adicionado à cadeia `npm run test:e2e` (9 scripts). ADR-011 §6 com nota inline. `quickstart.md` executado, 7/7 itens da constitution com evidência. Gates finais: 1113 testes (3 flakes conhecidos, 88/88 isolados), `tsc -b`/lint/`build`/`build:tizen` limpos, 5/5 contratos da 024 + 018 confirmados uma última vez. | TV física não realizada nesta sessão (sem acesso ao aparelho) — recomendada, não bloqueante. |

**PRÓXIMO**: Feature código-completa. Falta só a passada na TV física (recomendada, não gate) e rodar `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/live/LiveScreen.tsx` — redesenho completo (shell, 3 colunas, preview, estados).
- `tv-web/src/styles/live.css` — CSS exclusivo da Live V14.
- `tv-web/src/features/screens.css` — perdeu as regras Live mortas; recuperou as compartilhadas com Filmes/Séries (R-009).
- `tv-web/src/styles/components.css` — `.channel-row .fav-star`/`.channel-row-badge`.
- `tv-web/src/App.tsx` — passa `shell` no `case 'live'`.
- `tv-web/e2e/live-tv-ds-v14.mjs` — novo script E2E (27 verificações).
- `tv-web/e2e/busca-por-categoria.mjs`, `favoritos.mjs`, `capa-real.mjs`, `paridade-visual.mjs` — seletores atualizados.
- `tv-web/package.json` — `test:e2e` inclui o novo script.
- `sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md` — nota inline §6.
- `tv-web/src/features/live/channelNumber.ts` — `channelNumberOf`/`knownCategoryCount`.
- `tv-web/src/lib/catalog/classifier.ts`, `xtreamConnector.ts` — logo de canal.
- `tv-web/src/lib/catalog/catalogRepository.ts`, `db.ts` — `categoryPosition`.
- `tv-web/src/features/catalog/catalogApi.ts` — `toItemOut` com os 3 campos novos.
- `tv-web/src/navigation/appNav.ts` — ação `switch-top`.
- `tv-web/src/components/PosterArt.tsx`, `ChannelRow.tsx`, `SideCategoryNav.tsx` — variantes/props novas.
- `tv-web/src/features/shell/TopBar.tsx` — `currentItem`/`onGoHome`.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **`sourceNumber`/`raw.num` não é adotado.** T001 confirmou que o painel
  Xtream real recalcula `num` por resposta (não é global). Nenhuma task
  desta feature deve reintroduzir a captura de `num` sem uma nova
  verificação registrada em `research.md` R1.
- **Credencial de teste**: `.env`/`.env.example` na raiz (`CCPLAY_PROBE_*`)
  é o fixture de teste real do repositório para verificações contra um
  painel de verdade — nunca `docs/m3u/dados.md`. Qualquer script que a use
  deve rodar fora do repositório (scratchpad da sessão) e nunca imprimir o
  valor bruto, só o resultado da checagem.
- **Dev server**: a única lista já importada no dev server local
  (`Debug Busca Categoria`) é uma fixture M3U `stored` de teste (aponta
  para um mock local fora do ar) — não serve para testar o caminho de
  provedor (`on_demand`) manualmente.
- **Seletores da trilha mudaram de verdade** (feature 024): onde os testes
  antigos liam `.live-item`/`.live-item-favorites`/`.live-item-all` com
  `textContent` cru (ex.: `'★Favoritos'`), agora é
  `.side-category-nav-item` com `.side-category-nav-label` (texto sem o
  glifo — o ícone de favorito é SVG, decorativo). Os E2E ainda não foram
  atualizados (Fase 7, T040) — vão quebrar exatamente por isso.
- **`renderLiveWithShell`** (novo helper em `LiveScreen.test.tsx`) é o
  jeito de testar a tela COM a moldura; `renderLive` continua sem `shell`,
  reproduzindo o comportamento anterior à feature 024.
- **Contrato da 018 nunca foi editado** — a trilha por baixo do
  `SideCategoryNav` continua expondo `.live-item-name` (via `nameClassName`
  do `ChannelRow`), `.search-icon-button` e `input.search-field`
  literalmente, exatamente como o contrato exige.
- **`.live-*` em `screens.css` não é tudo "da Live"** (R-009): boa parte
  (`.live-item`, `.live-column*`, `.category-title-row`,
  `.search-icon-button`, `.search-field*`, `.live-state*`,
  `.live-truncated-note`) é compartilhada com `MoviesScreen`/`SeriesScreen`
  (ainda não migradas). A Onda 4 (feature 025), ao redesenhá-las, vai
  precisar do mesmo cuidado inverso: só remover uma regra dali depois de
  confirmar, por busca no código (não por suposição), que nenhuma tela
  ainda a usa.
- **`tv-web/e2e/capa-real.mjs` (feature 015) também toca a Live** — qualquer
  mudança futura no logo/trilha da Live precisa considerar esse script,
  não só os listados no `plan.md` desta feature (R-010, lacuna do próprio
  planejamento).

## Resultado Final

`sdd-converge` em 2026-09-27: **convergida sem achado acionável** — nenhum
CRITICAL/HIGH/MEDIUM, dois LOW informativos sem trabalho restante
(`paridade-visual.mjs`, feature 021, não re-executado de propósito para não
sobrescrever a evidência histórica dela; `SideCategoryNav` marca a entrada
**entrada**, não só a focada, um afordance do componente reusado sem dado
inventado). `tasks.md` não foi tocado — 59/60 tasks, a única em aberto é a
passada na TV física (recomendada pela própria spec, não gate).

O que foi de fato construído bate com a spec em todas as 4 user stories e
todos os 33 requisitos funcionais (FR-001 a FR-033) e 6 critérios
mensuráveis (SC-001 a SC-006). Os dois desvios de maior porte em relação ao
plano original, ambos já documentados como decisões, não como problemas:

- **`sourceNumber`/`num` do painel nunca foi adotado** (R-001) — verificado
  contra um painel Xtream real e refutado como posição global. A Live TV
  usa só a regra derivada (`logic/numero-do-canal.md`), exatamente como o
  plano previu para o caso de refutação.
- **Dois bugs reais, fora do escopo original da spec, foram encontrados e
  corrigidos durante a execução** — nenhum dos dois motivou uma
  clarificação nova na spec, porque os dois são consequência direta de
  como a implementação foi feita, não de ambiguidade na intenção:
  - R-009: a limpeza de CSS da Fase 3 (T022) removeu regras que
    `MoviesScreen`/`SeriesScreen` (não migradas) também usam — corrigido
    antes de prosseguir, achado pelo E2E, não por teste unitário (jsdom
    não aplica CSS).
  - R-010: o E2E `capa-real.mjs` (feature 015) também testava a Live TV e
    não estava listado em nenhuma task — corrigido como task ad-hoc
    (T047).

Estado final dos gates: 1113 testes unitários (3 flakes pré-existentes,
sistêmicos, confirmados 88/88 isolados), 5/5 contratos da própria feature
mais os 4 contratos travados de outras features (018/020/022/023) intactos
e verdes, `tsc`/lint/`build`/`build:tizen` limpos, 9 scripts E2E encadeados
em `npm run test:e2e` verdes contra um dev server recém-iniciado (incluindo
o novo `live-tv-ds-v14.mjs`, 27 verificações). `quickstart.md` executado
com os 7 itens do checklist da constitution evidenciados.

Única pendência: a passada na TV física (QN50Q60DAGXZD) — recomendada pela
spec (Assumptions), nunca gate desta feature, não realizada nesta sessão
por falta de acesso ao aparelho. R-007 (custo de render na TV) continua em
aberto por esse mesmo motivo.
