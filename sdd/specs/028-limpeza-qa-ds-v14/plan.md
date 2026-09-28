# Implementation Plan: Limpeza e QA do Design System V14 (Onda 7)

**Slug**: `028-limpeza-qa-ds-v14` | **Date**: 2026-09-28 | **Spec**: `sdd/specs/028-limpeza-qa-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Última onda da migração V14: nada de função nova. A feature:

- esconde as barras de rolagem nativas de Filmes e do Início e
  redistribui o Início para ocupar o palco com o conteúdo real;
- prova, com teste por tela, que todo botão de estado de
  carregando/vazio/erro responde a OK;
- roda a matriz §34 em todas as telas, corrigindo o que é de apresentação
  e registrando o resto no backlog;
- garante nome acessível em todo controle por um verificador
  (`findUnnamedControls`) usado nos testes de tela;
- elimina `features/screens.css` preservando a cascata, com paridade
  pixel a pixel antes/depois;
- corrige o `Icon` (`var()` em atributo SVG);
- fecha a documentação (`CLAUDE.md` 024–026 e 028, ADR-007, trava da
  017).

A exploração mostrou três fatos que moldam o plano:

1. O Chromium headless do Playwright roda com `--hide-scrollbars` — por
   isso nenhum E2E pegou o bug. E o Chromium 108 da TV não suporta
   `scrollbar-width`: só `::-webkit-scrollbar` resolve lá.
2. `screens.css` fica no meio da ordem de import (depois de `live`/`vod`,
   antes de `player`…`search`), e várias classes dele são declaradas também
   em outros arquivos. Mover regra muda o vencedor da cascata se não for
   feito pela regra de `logic/migracao-css.md`.
3. As telas fora das três corrigidas pela 014 (detalhes, Busca,
   Configurações, Perfis, player, Importação) **já roteiam** o OK nos
   estados de erro/vazio. A US2 é auditoria + teste por tela, não correção
   em massa.

## Technical Context

**Language/Version**: TypeScript 6 (strict), React 19, Vite 8 (`build.target: 'chrome108'`), CSS puro com tokens em `tv-web/src/index.css`

**Primary Dependencies**: componentes V14 da 022 (`EmptyState`, `ErrorState`, `Rail`, `Modal`...), `useRemoteNav` (ADR-009), `Icon`/`iconPaths.ts` (021), `PosterArt`; nos testes, `@testing-library/react` + `dom-accessibility-api` (já instalada como dependência transitiva, versão 0.5.16 no topo de `node_modules`)

**Storage**: nenhum — sem migração Dexie

**Testing**: Vitest + Testing Library + jsdom (`src/setupTests.ts`) — jsdom **não** aplica CSS nem layout; Playwright E2E (`tv-web/e2e/*.mjs`, `tv-web/e2e.mjs`) contra `npm run dev`

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), palco 1920×1080 (`Stage`)

**Performance Goals**: nenhuma regressão; nada de CSS que custe caro no motor da TV (sem blur/filtro novo)

**Constraints**:

- Só apresentação e atributos (FR-012). Nada de fluxo, dado, tela ou componente novo.
- Só tokens V14 em CSS novo. Literais existentes movidos não viram token (mudaria pixel) — isso é item de matriz, se for o caso.
- Nenhum arquivo novo emitido pelo build (os CSS entram no bundle único).
- Travas de contrato de outras features intactas.

**Scale/Scope**: ~13 telas, ~754 linhas de `screens.css`, 14 arquivos CSS

## Decisões Invariantes

- **D-001 — Ordem de execução por dependência, não por prioridade.** US1 →
  US2 → **US5** → US4 → US3 → US6. A US5 (mover CSS) vem antes da matriz
  para as correções da matriz caírem no arquivo definitivo. A baseline de
  paridade "antes" é capturada no Setup, antes de **qualquer** mudança de
  CSS/TSX.
- **D-002 — Barra nativa escondida por utilitário.** Novo `.no-scrollbar`
  em `tv-web/src/styles/utilities.css` com `::-webkit-scrollbar { display:
  none }` (o que funciona no Chromium 108) e `scrollbar-width: none`. A
  classe é aplicada no TSX dos contêineres roláveis: trilha e grade de
  Filmes (`VodCatalogScreen`, que serve Filmes **e** Séries), `.home-content`
  e o próprio `Rail` (que o Início usa). Nunca `overflow: hidden` no lugar
  de `auto`: a rolagem por foco (`scrollIntoView`/virtualização) precisa do
  contêiner rolável.
- **D-003 — Regra de destino do CSS** de `logic/migracao-css.md` §2: novo
  `tv-web/src/styles/shared.css` no slot exato do `screens.css`; topo de
  `player.css` para a camada de reprodução; qualquer outro destino só se a
  classe não aparece em arquivo entre o destino e o slot.
- **D-004 — Paridade automatizada** por `tv-web/e2e/paridade-limpeza.mjs`
  (`antes`/`depois`/`comparar`, comparação pixel a pixel em canvas, sem
  dependência nova), com a lista `INTENTIONAL` como única fonte das
  diferenças aceitas. O script da 021 não é reusado (tem o glob
  `**/live/**` que derruba o app).
- **D-005 — Início: o espaço livre vai para o hero.** Os rails mantêm as
  dimensões fixas de card da 022 (`Rail` exige `itemWidth`/`itemHeight`).
  O hero, que já é conteúdo real (capa, título, metadados), cresce para
  ocupar a altura livre do palco, sem cair abaixo do mínimo atual. Nenhum
  rail, card, seção ou texto novo.
- **D-006 — `ConfirmDialog` sai.** `components/ConfirmDialog.tsx` e o teste
  só existem para si mesmos (o `Modal` da 022 o substituiu); com
  `.confirm-dialog*` removido, sobraria um componente sem estilo.
- **D-007 — `Icon` dimensionado por estilo.** `width`/`height` saem dos
  atributos e vão para `style` (`var(--icon-size)`), que aceita `var()`. O
  `--icon-size` explícito que a 024 deixou em `.side-category-nav-item`
  continua. Mudança de tamanho visível onde o ícone caía no fallback é
  diferença intencional (FR-023 corrigido no plan).
- **D-008 — `findUnnamedControls` é utilitário de teste**, em
  `tv-web/src/testing/accessibleNames.ts`, nunca importado pelo app. Usa
  `computeAccessibleName` de `dom-accessibility-api`, declarada em
  `devDependencies` com a versão já instalada — **0.6.3** (não 0.5.16, ver
  R-011): é a que `@testing-library/jest-dom` já declara como dependência
  direta (`^0.6.3`) e a única das duas versões presentes no `node_modules`
  cujo `package.json` expõe `"types"` no `exports`, sem download novo.
- **D-009 — Indicador de overflow vertical é o item parcialmente visível**
  (a grade e a trilha já cortam o próximo item); o `Rail` mantém o
  degradê de borda da 022. Nenhum componente de indicador novo nesta
  feature (FR-003 + "nenhum componente novo"). Tela que esconda por
  completo o que vem depois vira achado grande da matriz.
- **D-010 — Trava da 017 aposentada, nunca recriada.** Regravada só com
  `catalogSearch.contract.test.ts` e `useRemoteNav.busca.contract.test.tsx`
  (os dois que ainda existem e estão íntegros), com um `R-00X` anexado em
  `sdd/specs/017-busca-local-catalogo/plan.md` citando a decisão do usuário
  na spec da 028. É a aprovação explícita que a regra de trava exige.
- **D-011 — Documentação por anexação.** Emenda inline
  `**Atualização (028):**` na ADR-007; parágrafos novos em `CLAUDE.md`
  tirados de `## Resultado Final`/`## Estado Atual` de cada `plan.md`;
  nada reescrito.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não toca. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Nenhum texto novo interpola URL; o verificador de nomes só roda em teste. A fixture E2E usa dados fictícios. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca importador nem trilha. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Início redistribuído só com conteúdo real (D-005, FR-005). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Não toca. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Não se aplica. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | É o objetivo da US2; teste por tela. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | ✅ | ✅ | Não toca. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | US2 + critérios Remote/Visual da matriz. Esconder a barra não muda a rolagem por foco (D-002). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Nenhum fluxo muda; E2E existentes continuam como prova. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Não toca. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | Nenhum indicador de overflow inventado (D-009). |
| Documentação do Repositório É Canônica | ✅ | ✅ | US6 fecha as lacunas conhecidas (024–026, trava da 017). |

Sem violação — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/028-limpeza-qa-ds-v14/
├── spec.md
├── plan.md
├── logic/
│   ├── migracao-css.md        # cascata, regra de destino, mapa, paridade, medição de barras
│   ├── matriz-qa.md           # critérios §34, como verificar, pequeno × grande
│   └── nomes-acessiveis.md    # regras de findUnnamedControls e uso nos testes de tela
├── quickstart.md              # inclui o gate da TV física
├── tasks.md
├── contract-tests.lock
├── handoff.md
├── matriz-qa.md               # criado pelo sdd-execute (US3)
└── evidencias/paridade/{antes,depois}/   # criado pelo sdd-execute
```

### Source Code (repository root)

```text
tv-web/
├── package.json                      # + dom-accessibility-api (devDependencies); test:e2e + limpeza-qa.mjs
├── e2e/
│   ├── paridade-limpeza.mjs          # novo (antes/depois/comparar)
│   ├── limpeza-qa.mjs                # novo (barras de rolagem, Início)
│   └── fixtures/                     # + fixture com trilha/grade que transbordam
├── src/
│   ├── main.tsx                      # troca ./features/screens.css por ./styles/shared.css (mesmo slot)
│   ├── testing/
│   │   ├── accessibleNames.ts        # STUB → findUnnamedControls
│   │   └── accessibleNames.limpeza-qa-ds-v14.contract.test.tsx   # TRAVADO (2)
│   ├── components/
│   │   ├── Icon.tsx                  # tamanho por style (D-007)
│   │   ├── Icon.limpeza-qa-ds-v14.contract.test.tsx              # TRAVADO (1)
│   │   ├── Rail.tsx                  # .no-scrollbar
│   │   └── ConfirmDialog.tsx/.test.tsx   # removidos (D-006)
│   ├── features/
│   │   ├── screens.css               # REMOVIDO (FR-018)
│   │   ├── vod/VodCatalogScreen.tsx  # .no-scrollbar na trilha e na grade
│   │   ├── home/HomeContent.tsx      # .no-scrollbar em .home-content
│   │   └── */ *.test.tsx             # casos novos de SELECT (US2) e de nomes (US4)
│   └── styles/
│       ├── utilities.css             # + .no-scrollbar
│       ├── shared.css                # novo, no slot do screens.css
│       ├── player.css                # + camada de reprodução no topo
│       └── home.css                  # hero absorve o espaço livre (D-005)
CLAUDE.md                             # 024, 025, 026, 028 + nota da migração concluída
sdd/adr/ADR-007-*.md                  # emenda (028)
sdd/specs/017-busca-local-catalogo/{contract-tests.lock,plan.md}   # trava aposentada (D-010)
.planning/{backlog.md,migracao-design-system-v14.md}               # Onda 7/Fase 1.5 concluídas, bugs absorvidos saem
```

**Structure Decision**: tudo em `tv-web/` (frontend client-first, ADR-008),
mais documentação. `api/` e `CCPlayTv/` não mudam, exceto pelo que
`npm run build:tizen` sincroniza.

## Complexity Tracking

Nenhuma violação da constitution a justificar.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
cd tv-web
npx vitest run <arquivo>        # mais estreito primeiro
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen
node e2e/limpeza-qa.mjs         # com npm run dev no ar
node e2e/paridade-limpeza.mjs comparar
npm run test:e2e
```

Divisão do que prova o quê:

- **jsdom (Vitest)**: SELECT nos estados (US2), nomes acessíveis (US4),
  `Icon`, regras da matriz verificáveis por DOM (um `.tv-focus` por vez).
- **Playwright**: barras de rolagem e espaço do Início (US1, **só** em
  navegador real, sem `--hide-scrollbars`) e paridade visual (US5).
- **TV física**: colunas só-na-TV da matriz e a confirmação final das
  barras (o bug só apareceu lá).

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx`,
`tv-web/src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx`

Comando: `cd tv-web; npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| aponta, em ordem de documento, só os controles focáveis sem nome acessível | FR-015, FR-017 | Fase 2 | `Error: not implemented` |
| exige que controle soft/hard disabled anuncie a indisponibilidade, com uma entrada só por elemento | FR-016 | Fase 2 | `Error: not implemented` |
| não grava var() nos atributos width/height do `<svg>` | FR-023 | Fase 5 (US5) | `expected 'var(--icon-size)' not to contain 'var('` |

Confirmado vermelho em 2026-09-28 pelos motivos acima. O contrato de nomes
foi validado como **satisfazível** com uma implementação provisória
(2/2 verdes) e o arquivo voltou ao stub.

**Por que as duas stories P1 não têm contrato:**

- **US1** é só CSS/layout. O jsdom não aplica folha de estilo nem calcula
  layout, então nenhum teste Vitest prova barra escondida ou espaço
  ocupado. A prova é o E2E `limpeza-qa.mjs` (Fase 3) e a passada na TV.
- **US2**: as telas auditadas no plan já roteiam OK nos estados de
  erro/vazio. Um contrato nasceria verde e não provaria nada. A definição
  de pronto são os testes por tela da Fase 4.

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/testing/accessibleNames.ts` (`findUnnamedControls` lança
`not implemented`; tipos `UnnamedControl`/`UnnamedReason` definitivos).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída. Baseline "antes" capturada (21 telas/estados) antes de qualquer mudança de CSS/TSX; determinismo provado (dupla captura, 0 diferenças fora do limiar de ruído de fonte). `limpeza-qa.mjs` vermelho nos 3 pontos certos do bug (trilha e grade de Filmes, 15px cada). |
| Fase 2 (Foundational) | Concluída. `findUnnamedControls` implementado e testado (contrato 2/2 + 9/9 com os casos extras). `.no-scrollbar` em `utilities.css`. `dom-accessibility-api` direta na versão 0.6.3 (não 0.5.16 — R-011). `tsc`/lint limpos, suíte completa 1279/1283 (flakes conhecidos sob paralelismo, confirmados isolados). |
| Fase 3 (US1) | Concluída. `.no-scrollbar` em Filmes/Séries (trilha+grade) e Início. **Root cause de R-003 corrigida** (não só escondida): padding duplicado `.screen`+`AppShell` em toda tela com topbar (`shell.css`, novo `.app-shell-content > .screen { padding: 0 }`) — sozinho já resolvia o transbordo horizontal da grade, sem tocar `vod.css`. Início: `.home-hero` virou `flex: 1 0 420px`, cresce pra ocupar a folga (106px → 0px nesta fixture). Paridade confirmada (10 diferenças, todas em `INTENTIONAL` com motivo); zero regressão funcional nos 4 E2E existentes de Live/Filmes/Séries/Busca/Configurações tocados. |
| Fase 4 (US2) | Concluída. Inventário de 18 estados de carregando/vazio/erro (`matriz-qa.md`) — 14 já roteavam SELECT corretamente, **3 achados reais em `VodCatalogScreen.tsx`** (carregando, categoria vazia, "Todos" vazio — mesma causa: nenhum ramo do `onSelect` cobria esses três estados), corrigidos com 3 ramos novos. `ImportProgressScreen` registrada como só-na-TV (mecanismo de foco diferente, `useTvKeyNav`, não provável em jsdom sem uma dependência nova). |
| Fase 5 (US5) | Concluída. `features/screens.css` eliminado (754 linhas) — `shared.css` novo no mesmo slot, camada de reprodução no topo de `player.css`, 13 regras mortas removidas, `ConfirmDialog` removido (D-006), `Icon.tsx` corrigido (D-007, contrato 1/1). **Achado real, corrigido**: `.search-field-row`/`.search-coverage` colidiam de verdade com `search.css` (mesmo seletor, mesma especificidade) — mesclado por propriedade (D-003), não duplicado. Paridade confirma zero diferença nova (as mesmas 10 já documentadas). |
| Fase 6 (US4) | Concluída. `findUnnamedControls` aplicado a todos os estados principais de todas as telas (~30 casos novos em arquivos de teste já existentes, T037–T041). **6 achados reais, mesmo padrão (FR-016)**: controle `.is-soft-disabled`/`.is-hard-disabled` sem `aria-disabled` e sem "em breve"/"indisponível" no nome — corrigidos em `ComingSoon.tsx`, `HomeContent.tsx` (hero + dock), `AccessibilityPanel.tsx`, `LiveScreen.tsx` (preview), `Tabs.tsx` (cobre MovieDetail/SeriesDetail de graça); mais 2 achados FR-015 (`<input>` de busca sem `aria-label`) em `LiveScreen.tsx`/`VodCatalogScreen.tsx`. `PlayerLayer.tsx`/`PlayerChrome.tsx` já estavam corretos desde a feature 027 — os 4 testes novos passaram sem correção de produção. Suíte completa 1323/1327 (4 flakes conhecidos sob paralelismo, confirmados isolados), `tsc`/lint limpos, travas 022/023/025/027/028 íntegras. |
| Fase 7 (US3) | Concluída. Matriz §34 completa (`matriz-qa.md`, 3 tabelas Remote/Visual/Performance × telas), sem célula vazia fora de `só-na-TV`/`n/a`. **6 achados reais, mesmo padrão de Fase 3** (barra de rolagem nativa, FR-006), fora de Filmes/Início: `Modal`, lista de canais da Live TV, corpo da Busca, painel de Configurações, `.vod-detail` (MovieDetailScreen/SeriesDetailScreen) e lista de episódios — todos corrigidos com `.no-scrollbar` (T058–T063), cada um com teste unitário. **1 achado "grande" registrado no backlog** (modal de seleção de temporada sem indicador dedicado de overflow para listas muito longas — sem caso real hoje). O bug pré-existente absorvido por esta feature (backlog item 884) ganhou nota de resolução. `limpeza-qa.mjs` e `paridade-limpeza.mjs comparar` (zero diferença nova) verdes; travas íntegras. |
| Fase 8 (US6) | Concluída. `CLAUDE.md` com os 3 parágrafos que faltavam (024/025/026), entre 023 e 027. ADR-007 emendada (`**Atualização (028):**`) registrando a migração V14 concluída e sua forma executável. Trava da 017 aposentada (D-010): achado da 023 confirmado (2 dos 4 arquivos travados não existem mais, superados pela 018) — regravada de 5 para 3 testes; `R-008` anexado no plano da 017. **Todas as 12 travas de contrato do repositório** conferidas íntegras (SC-007). |
| Fase 9 (Polish) | Concluída. Todos os gates automatizados verdes (suíte completa, `tsc`/lint/build/build:tizen, todos os `e2e/*.mjs` + `test:e2e`, paridade zero-diff, 12/12 travas de contrato). Docs de fechamento: parágrafo da 028 em `CLAUDE.md` + seção "Design system" marcando a migração V14 concluída; `.planning/migracao-design-system-v14.md` (Onda 7/Fase 1.5 código-completa); `.planning/backlog.md` (5 bugs absorvidos removidos, M8 fechada). **Passada na TV física cumprida numa sessão seguinte** (R-009): app instalado via `deploy-tv.ps1`, roteiro executado pelo usuário, aprovado em tudo exceto 1 achado real (capas de Filmes/Séries demoram ~4s pra carregar) — registrado no backlog. **Feature `Implementada`**, matriz de QA e R-009 atualizados com o resultado real da TV. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Mover regra de `screens.css` para arquivo em outra posição da ordem de import inverte o vencedor da cascata (várias classes são declaradas em 2+ arquivos) | Mudança visual silenciosa — jsdom não pega | **Resolvido** (Fase 5): de 13 classes com o mesmo nome em outro arquivo, só 2 (`.search-field-row`/`.search-coverage`, ambas em `search.css`) eram colisão de verdade (seletor bare, mesma especificidade) — as outras 11 eram seletores escopados (`.channel-row .poster-box` etc.), que vencem por especificidade independente da ordem. Resolvido por propriedade (D-003): `.search-coverage` já tinha sua única propriedade 100% sobrescrita (removida); `.search-field-row` teve `margin-bottom: 16px` mesclado na regra de `search.css` que já vencia. `paridade-limpeza.mjs comparar` confirma zero diferença nova. |
| R-002 | Baseline "antes" capturada depois de alguma mudança invalida a paridade inteira | SC-006 não provável | T002 é a primeira task de código da feature e bloqueia as demais. |
| R-003 | Esconder a barra da grade de Filmes pode esconder também um transbordo horizontal real (glow/escala do foco maior que a coluna) | Rolagem horizontal "fantasma" ao focar a última coluna | **Resolvido** (Fase 3, T010): era real (1350px precisos pras 6 colunas fixas × 1184px disponíveis). Causa raiz encontrada e corrigida — padding duplicado `.screen` (screens.css) + `AppShell` (shell.css) em toda tela com topbar, `.app-shell-content > .screen { padding: 0 }`. A grade passou a caber com folga (1376px), sem tocar `GRID_COLS`/`vod.css`. |
| R-004 | Hero crescendo no Início pode não ser o que o usuário imagina por "aproveitar a tela" | Retrabalho de layout | Captura do Início "depois" no relato da Fase 3 e confirmação na passada física. Implementado como `flex: 1 0 420px` (cresce, nunca encolhe abaixo do mínimo); folga medida foi de 106px pra 0px nesta fixture — aguardando confirmação visual/física. |
| R-005 | Corrigir o `Icon` muda o tamanho de ícones em telas onde o fallback do navegador valia | Diferenças visuais em várias capturas | Listadas em `INTENTIONAL`; confirmadas na TV (onde antes ficavam enormes). |
| R-006 | Verificador de nomes pode apontar dezenas de controles em telas já convergidas | Fase 5 maior que o previsto | Correções são `aria-label`/texto (pequenas por definição); nenhum contrato de outra feature depende de nome acessível — se algum depender, parar (5b do execute). |
| R-007 | `test:e2e` não roda `player-chrome.mjs`, `filmes-series-ds-v14.mjs`, `capa-real.mjs`... — gate parcial | Regressão fora do conjunto | O Polish roda **todos** os `e2e/*.mjs` explicitamente, além de `test:e2e`. |
| R-008 | Comentários de `screens.css` com texto corrompido (UTF-8 lido como Latin-1: "nÃ£o") | Mover a corrupção junto | **Resolvido** (Fase 5): corrigido ao mover para `player.css` (as regras corrompidas eram as do plano de hardware). |
| R-009 | A passada na TV física é gate obrigatório (spec, SC-008) | Feature não converge sem ela | **Dispensado explicitamente pelo usuário em 2026-09-28** (sessão de execução) — `discover_devices` não achou o QN50Q60DAGXZD na rede naquele momento; perguntado ao usuário, resposta explícita: dispensar. **Cumprido de fato numa sessão seguinte, ainda em 2026-09-28**: a TV ficou acessível (`deploy-tv.ps1` descobriu o IP real e instalou), e o usuário executou um roteiro cobrindo splash, Início, Live TV/zapping, Filmes/Séries, detalhe, player/chrome e repetição rápida (segurar ↓). Resultado ("o restante tudinho funcionou como esperado"): toda a coluna só-na-TV/"hardware real" de `matriz-qa.md` preenchida como aprovada, **exceto um achado real** — capas de filmes/séries demoram ~4s para carregar na grade, nunca visto em desenvolvimento. Registrado no backlog e depois retirado dele por decisão do usuário (ver R-016). A dispensa original fica sem efeito prático — o gate foi cumprido. |
| R-010 | **Achado real (Fase 1)**: comparar pixels via JSON (`Array.from(ImageData.data)`, ~8,3M elementos por frame 1920×1080) entre Node e o browser travava o processo por minutos. | Script de paridade inutilizável | **Resolvido**: `diffPair` carrega os dois PNGs e compara tudo dentro de um único `page.evaluate` — só o resultado (contagem + retângulo) atravessa a fronteira. |
| R-011 | **Achado real (Fase 2)**: `dom-accessibility-api@0.5.16` (a versão inicialmente escolhida, só transitiva de `@testing-library/dom`) não tem `"types"` no `exports` do seu `package.json` — `tsc -b` falha com TS7016 mesmo com o Vitest passando (não checa `.d.ts`). | Contrato satisfazível no plan, mas `tsc` vermelho no execute | **Resolvido**: trocado pra 0.6.3 (dependência direta de `@testing-library/jest-dom`, `"types"` presente no `exports`), já instalada — `npm install --offline` corrigiu o layout físico sem baixar nada. D-008 atualizado. |
| R-012 | **Achado real (Fase 4)**: 3 estados de `VodCatalogScreen.tsx` (carregando, categoria vazia, "Todos" vazio) desenhavam "Voltar" com `.tv-focus`, mas nenhum ramo do `onSelect` os alcançava — caíam em `items[itemIdx]` (`undefined`), sem efeito. | Foco visível sem SELECT funcionar (violação real de "Foco Visível e Sem Becos Sem Saída") | **Resolvido**: 3 ramos novos no `onSelect` (T021), mesmo padrão que `LiveScreen`/014 já usavam. |
| R-013 | `ImportProgressScreen` usa `useTvKeyNav` (foco DOM real + `<button>` nativo), não `useRemoteNav` — Enter sobre um botão focado é ativação nativa do HTML, não algo que o app roteia. O jsdom não sintetiza essa ativação (`fireEvent.keyDown` num `<button>` não dispara `onClick`), diferente de qualquer navegador real. | FR-007/FR-009 não provável por teste Vitest nesta tela específica | Registrada como só-na-TV em `matriz-qa.md`; o teste por clique de mouse já existente prova que o handler está certo. Sem instalar `@testing-library/user-event` (fora do escopo, D-016) não há como fechar essa lacuna de teste — não é um bug de produto. |
| R-014 | **Achado real (Fase 5)**: `.search-field-row`/`.search-coverage` (screens.css) colidiam de verdade com `search.css` (mesmo seletor bare, mesma especificidade — a busca global, que carrega depois, já vencia hoje). | Regra morta ficaria "movida" pra `shared.css` como se ainda fizesse algo, ou a única propriedade viva (`margin-bottom` de `.search-field-row`) sumiria se a regra fosse só apagada | **Resolvido**: `.search-coverage` removida (sua única propriedade já estava 100% sobrescrita); `.search-field-row` teve a propriedade viva mesclada na regra de `search.css` (D-003). Nenhuma das duas telas (Busca global, busca inline de Live/Filmes/Séries) mudou de aparência — confirmado por `paridade-limpeza.mjs comparar`. |
| R-015 | **Achado real (Fase 7)**: a matriz §34 encontrou mais 6 contêineres roláveis sem `.no-scrollbar` fora de Filmes/Início (`Modal`, lista de canais Live, corpo da Busca, painel de Configurações, `.vod-detail`, lista de episódios) — mesmo sintoma do bug de backlog que esta feature absorve. | Barra nativa visível num app navegado só por D-pad, em mais telas do que o backlog original registrou | **Resolvido**: `.no-scrollbar` aplicado nos 6 lugares (T058–T063), cada um com teste unitário; paridade confirma zero diferença de pixel (conteúdo das fixtures nunca chegou a estourar a área visível — correção preventiva). Escondê-la no `Modal` reabriu uma lacuna pré-existente e separada, sem indicador dedicado de overflow para uma lista de modal muito alta (ex.: dezenas de temporadas) — registrada no backlog como achado "grande", não corrigida aqui (exige decisão de design). |
| R-016 | **Achado real na passada física (2026-09-28, sessão seguinte à execução)**: capas de filmes/séries demoram ~4s para carregar na grade da TV real — nunca visto em desenvolvimento. | Percepção de lentidão real num app de TV, causa não diagnosticada (rede/decodificação/tamanho de arquivo) | **Retirado:** registrado no backlog na mesma data e **removido dele por decisão explícita do usuário em 2026-09-28** (reorganização do backlog pós-migração) — sem `sdd-bugfix` planejado, sem diagnóstico nem correção. A observação fica aqui só como histórico. Todo o resto do roteiro da TV física passou sem ressalva. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-28 | Fase 1 (Setup) | `paridade-limpeza.mjs` (antes/depois/comparar) + fixture `limpeza-qa.m3u`; `limpeza-qa.mjs` (medição de barra, sem `--hide-scrollbars`); `dom-accessibility-api` direta. 4 achados reais corrigidos no próprio script (não no produto): diff pixel a pixel via JSON travava o processo (R-010); relógio/timestamp de sync não determinísticos entre capturas (mascarados); ruído de fonte entre processos do Chromium até ~72px (limiar de 150px); navegação da topbar/Configurações tinha 2 bugs no meu próprio script (`FOCUS_ORDER` sem `'profile'`, zona `tabs` sem `left`). Confirmado por baseline: a grade de Filmes tem transbordo horizontal real (R-003) — decisão fica pra T010. | Nenhuma |
| 2026-09-28 | Fase 2 (Foundational) | `findUnnamedControls`/`.no-scrollbar` implementados, contrato 2/2. Achado real: `dom-accessibility-api@0.5.16` sem `"types"` no `exports` quebrava `tsc -b` mesmo com Vitest verde — trocado pra 0.6.3, já instalada, sem download (R-011). | Nenhuma |
| 2026-09-28 | Fase 3 (US1) | `.no-scrollbar` em Filmes/Séries/Início. Achado real (T010): a raiz do transbordo de R-003 era padding duplicado `.screen`+`AppShell` em toda tela com topbar — corrigido em `shell.css`, não em `vod.css`, resolvendo o transbordo por si só (sem tocar `GRID_COLS`). Início: `.home-hero` virou `flex: 1 0 420px` (T011). Paridade e os 4 E2E funcionais de Live/Filmes/Séries/Busca/Configurações confirmam zero regressão. | Nenhuma |
| 2026-09-28 | Fase 4 (US2) | Inventário de 18 estados em `matriz-qa.md`; 3 achados reais em `VodCatalogScreen.tsx` (R-012, mesma causa — onSelect sem ramo para carregando/categoria vazia/"Todos" vazio), corrigidos. `ImportProgressScreen` registrada como só-na-TV (R-013 — mecanismo de foco diferente, não provável em jsdom). Travas 028/025 íntegras. | Nenhuma |
| 2026-09-28 | Fase 5 (US5) | `features/screens.css` eliminado — `shared.css` novo no mesmo slot da ordem de import, camada de reprodução no topo de `player.css`, 13 regras mortas removidas (confirmadas por grep exato, não por contagem ingênua), `ConfirmDialog` removido (D-006), `Icon.tsx` corrigido (D-007). Achado real: `.search-field-row`/`.search-coverage` colidiam de verdade com `search.css` (R-014/R-001) — resolvido por propriedade, não por arquivo inteiro. Paridade, suíte completa, 8 scripts E2E e 5 travas de contrato (028/024/025/026/027) confirmam zero regressão. | Nenhuma |
| 2026-09-28 | Fase 6 (US4) | `findUnnamedControls` aplicado a ~30 estados novos (T037–T041), 8 achados reais corrigidos: 6× `.is-soft-disabled`/`.is-hard-disabled` sem `aria-disabled`/sem "em breve" no nome (`ComingSoon`, `HomeContent` ×2, `AccessibilityPanel`, `LiveScreen`, `Tabs` — este último cobre MovieDetail/SeriesDetail de graça) e 2× `<input>` de busca sem `aria-label` (`LiveScreen`, `VodCatalogScreen`). `PlayerLayer`/`PlayerChrome` já estavam corretos (feature 027) — nenhuma correção lá. Suíte completa, `tsc`/lint e travas 022/023/025/027/028 confirmam zero regressão. | Nenhuma |
| 2026-09-28 | Fase 7 (US3) | Matriz §34 completa (Remote/Visual/Performance × telas, `matriz-qa.md`). 6 achados reais (mesmo padrão da Fase 3, barra de rolagem nativa fora de Filmes/Início): `Modal`, lista de canais Live, corpo da Busca, painel de Configurações, `.vod-detail` (filme+série) e lista de episódios — corrigidos (T058–T063), cada um com teste. 1 achado grande registrado no backlog (modal de temporada sem indicador de overflow em listas muito longas). `limpeza-qa.mjs` e paridade (zero diferença nova) verdes. | Nenhuma |
| 2026-09-28 | Fase 8 (US6) | `CLAUDE.md` (parágrafos 024/025/026), ADR-007 emendada (V14 concluída), trava da 017 aposentada (5→3 testes, 2 arquivos de tela confirmados removidos, superados pela 018) com `R-008` no plano dela. Todas as 12 travas de contrato do repositório conferidas íntegras (SC-007). | Nenhuma |
| 2026-09-28 | Fase 9 (Polish) | T052–T055: `limpeza-qa.mjs` somado ao `test:e2e`; `tsc`/lint/`build:tizen` limpos; **todos** os `e2e/*.mjs` verdes (cadeia inteira + `e2e.mjs`/`filmes-series-ds-v14.mjs`/`player-chrome.mjs` fora dela; `paridade-visual.mjs`/`shell-visual.mjs` deliberadamente não re-executados — evidência histórica de outras features). Quickstart considerado coberto pela evidência real-Chromium desses scripts. `discover_devices` não achou o QN50Q60DAGXZD nesta sessão — perguntado ao usuário, dispensa explícita do gate de TV física. T057: `CLAUDE.md`/ADR-007/migração/backlog fechados (5 bugs absorvidos removidos, M8 fechada). Feature `Implementada`. | Passada física (dispensada nesta sessão) |
| 2026-09-28 | Fase 9 (Polish, passada física numa sessão seguinte) | TV ficou acessível; `deploy-tv.ps1` descobriu o IP real e instalou/lançou o app (skill `tizen-tv`). Usuário executou um roteiro cobrindo splash/Início/Live TV/zapping/Filmes/Séries/detalhe/player/chrome/repetição rápida — aprovado em tudo, **1 achado real**: capas de Filmes/Séries demoram ~4s pra carregar na grade (R-016), registrado no backlog, não diagnosticado nem corrigido às cegas. `matriz-qa.md` atualizada (coluna só-na-TV/"hardware real" preenchida) e R-009 marcado como cumprido de fato. | Achado do carregamento de capas (backlog, precisa de `sdd-bugfix` pra diagnosticar a causa antes de corrigir) |
| 2026-09-28 | Pós-execução (backlog) | Por decisão explícita do usuário, o achado de capas lentas (R-016) foi removido do backlog na reorganização pós-migração; também tirado dos resumos em `CLAUDE.md` e `.planning/migracao-design-system-v14.md`. Histórico mantido aqui, em `tasks.md` e em `matriz-qa.md`, marcado como retirado. | Nenhuma |

**PRÓXIMO**: Feature `Implementada`, com a passada física cumprida. O achado
de carregamento lento de capas (R-016) foi retirado do backlog por decisão do
usuário. Próximo passo normal do pipeline: `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `CLAUDE.md` — 3 parágrafos novos (024/025/026)
- `sdd/adr/ADR-007-design-system-tv-identidade-visual.md` — emenda `**Atualização (028):**`
- `sdd/specs/017-busca-local-catalogo/contract-tests.lock` + `plan.md` (R-008) — trava aposentada de 5 para 3 testes
- `sdd/specs/028-limpeza-qa-ds-v14/matriz-qa.md` — inventário de estados com botão (US2) + matriz §34 completa (US3)
- `tv-web/e2e/paridade-limpeza.mjs` — paridade visual antes/depois/comparar (21 telas/estados, `INTENTIONAL`, `NOISE_PIXEL_THRESHOLD`)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Nunca transferir `ImageData.data` via JSON através de `page.evaluate`** — um frame 1920×1080 tem ~8,3M elementos; `Array.from()` + serialização trava o processo Node por minutos. Faça a comparação inteira (carregar os dois PNGs, desenhar em canvas, comparar) DENTRO do `evaluate`; só o resultado pequeno atravessa a fronteira.
- **Relógio da topbar e "Sincronizada em ..." mudam sozinhos** entre duas rodadas de captura separadas por minutos — sempre mascarar `.topbar-clock` e `.sources-panel-status` (ou qualquer novo elemento com hora/data) em qualquer captura nova que `paridade-limpeza.mjs` ganhar.
- **Ruído de fonte entre processos do Chromium**: mesmo com DOM/CSS/reduzir-movimento idênticos, ~10–70 pixels isolados de antialiasing variam entre "antes" e "depois" (processos separados) — nunca dentro do mesmo processo. `NOISE_PIXEL_THRESHOLD` (150) absorve isso; não abaixe sem entender que pode fazer o script piscar verde/vermelho à toa.
- **Topbar (`FOCUS_ORDER`)**: `['home', 'live', 'movies', 'series', 'profile', 'search', 'settings']` — o indicador de perfil entra ENTRE Séries e Buscar. Um `ORDER` de navegação de E2E que esquece `'profile'` erra o índice de Buscar/Configurações por 1.
- **Zona `tabs` de `SettingsScreen` não trata `ArrowLeft`** (só `up`/`down`/`right`) — sair dela é `ArrowUp` até `TABS[0]` (dispara `goToTopbar()`), nunca `ArrowLeft`.
- **No topo real de uma trilha de categorias (`categoryIdx === 0`, fora do zapping), um `ArrowUp` a mais não clampa** — troca de zona pra topbar. Ao contrário da maioria das outras trilhas do app (que clampam nas pontas), aqui a contagem de teclas de E2E precisa ser exata, nunca "uma sobra por segurança".
- **A grade/trilha são virtualizadas** (feature 009/`Rail`, 022): nunca conte itens no DOM esperando o total da fixture — só a janela visível é renderizada.
- **Padding duplicado é sistêmico, não só de Filmes**: qualquer tela que passe `.screen` como filho de `AppShell` via `withShell()` (Live, Filmes, Séries — feature 024/025) tinha 192px de largura e ~156px de altura úteis a menos, por `.screen` (screens.css) e `.app-shell` (shell.css) empilharem padding. Resolvido globalmente por `.app-shell-content > .screen { padding: 0 }`. Não se aplica ao Início (`.screen.home-screen` é o PAI do `AppShell`, não o filho — a posição `absolute;inset:0` do `AppShell` já ignora o padding do pai) nem às telas de detalhe (`.screen.vod-detail`, sem shell).
- **`.home-hero`'s `flex: 1 0 420px` só funciona porque os rails são `flex: none`** — se algum rail futuro virar flexível também, os dois vão brigar pelo espaço livre e o cálculo desta task para de valer.
- **`jsdom` não sintetiza a ativação nativa de Enter em `<button>`** (`fireEvent.keyDown(button, {key:'Enter'})` não dispara `onClick`, diferente de qualquer navegador real) — nunca escreva um teste que dependa disso pra telas que usam `useTvKeyNav` (foco DOM real). Prove por clique (`fireEvent.click`) e documente como só-na-TV, como em `ImportProgressScreen`.
- **`VodCatalogScreen.tsx` tem DOIS lugares com a lista quase idêntica de condições** (`onDirection`'s cálculo de itens navegáveis e o `onSelect` que a testei) — ao adicionar um estado vazio/erro novo na Fase 7 (matriz), confira os DOIS, não só o que renderiza o botão.
- **"Mesmo nome de classe em dois arquivos" não é sempre colisão** — antes de mover ou mesclar, confira se a outra ocorrência é um seletor ESCOPADO (`.channel-row .poster-box`, `.profiles-screen .screen-subtitle`) — esses sempre vencem por especificidade, não por ordem de import, e a regra base pode morar em qualquer arquivo sem risco. Só é colisão de verdade quando os dois são o MESMO seletor bare com a MESMA especificidade — nesse caso a cascata resolve por PROPRIEDADE, não por bloco inteiro (uma regra pode ter uma propriedade morta/sobrescrita e outra ainda viva ao mesmo tempo — confira cada propriedade, não só se "a classe aparece em outro lugar").
- **`Array.from(root.querySelectorAll(...))` em contagem de uso por grep pode dar falso positivo por substring** — `live-item` "aparecia usado" porque `live-item-name`/`live-item-group` contêm o prefixo. Sempre confira com aspas/limites de palavra antes de decidir que uma classe está viva.
