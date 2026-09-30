# Handoff — 028-limpeza-qa-ds-v14

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Stack:
  React 19 + TS + Vite (Tizen 8 / Chromium 108), client-first, CSS com
  tokens V14.
- Próximo comando: `/sdd-execute 028-limpeza-qa-ds-v14`.
- Backlog: **Planejada**, 0/72 (a contagem inclui o Checklist de Release).
- Durante o plan, o **FR-023 da spec foi corrigido**: corrigir o `Icon` pode
  mudar o tamanho renderizado (hoje o `var()` no atributo é ignorado no
  navegador e instável na TV). Isso é diferença intencional da paridade.
  Releia a spec.

## O que a feature entrega

Nenhuma função nova — só apresentação, atributos, testes e docs.

- **P1 US1**: sem barra de rolagem nativa em Filmes (trilha e grade) e no
  Início. O Início ocupa o palco — o **hero** absorve a altura livre (D-005).
  Nenhum rail/card novo.
- **P1 US2**: teste por tela provando que OK aciona o botão de todo estado
  de carregando/vazio/erro. As telas auditadas no plan já roteiam: é
  auditoria + teste, corrigindo só o que falhar.
- **P3 US5** (executada em 3º, D-001): `features/screens.css` eliminado,
  cascata preservada, paridade pixel a pixel; `ConfirmDialog` morto sai;
  `Icon` com tamanho por `style`.
- **P2 US4**: `findUnnamedControls` em todas as telas, nos estados
  principais; corrigir nomes.
- **P2 US3**: matriz §34 em `matriz-qa.md`; pequeno corrige aqui, grande
  vai pro backlog. Barra nativa achada em outra tela = pequeno (FR-006).
- **P3 US6**: `CLAUDE.md` 024/025/026 (+028 no Polish), emenda na ADR-007,
  trava da 017 aposentada.
- Decisões do usuário: correção de barra **só** Filmes e Início de antemão;
  bug "mensagem de erro sempre diz canal" **fora**; **passada na TV física
  é gate obrigatório**.

## Leitura obrigatória, em ordem

1. `spec.md`: 29 FRs, 8 SCs, 13 clarificações + a correção do FR-023.
2. `plan.md`: D-001 a D-011, a divisão jsdom × Playwright × TV, R-001 a R-009.
3. `logic/migracao-css.md`: **o documento mais importante** — ordem de
   import, regra de destino (§2), mapa (§3), candidatos a remoção (§4), o
   script de paridade (§5) e a medição de barras (§6).
4. `logic/nomes-acessiveis.md`: regras do verificador e como usá-lo nos
   testes de tela.
5. `logic/matriz-qa.md`: telas, critérios, como verificar cada um, pequeno
   × grande, formato do `matriz-qa.md`.
6. `tasks.md`: T001–T057 em 9 fases, na ordem D-001.
7. `quickstart.md`: roteiro de navegador e o gate da TV física.
8. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx`
  — 2 testes, Fase 2.
- `tv-web/src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx` — 1
  teste, Fase 5.
- Rodar: `cd tv-web; npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx`.
  Hoje: 2× `Error: not implemented`, 1× `expected 'var(--icon-size)' not
  to contain 'var('`.
- O contrato de nomes foi validado como **satisfazível** no plan (uma
  implementação simples com `computeAccessibleName` deu 2/2).
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14`.
- As duas P1 não têm contrato de propósito: a US1 é CSS/layout, que o
  jsdom não prova; na US2, um contrato nasceria verde.
- Travas de **outras** features que esta pode quebrar: todas as que
  cobrem telas cujo CSS se move — rode o laço do `quickstart.md` (SC-007)
  no fim de cada fase que tocar CSS/TSX. A da **017 já está FAIL hoje**
  (dois arquivos `[MISSING]`) — é esperado até a T050.

## Stubs criados

- `tv-web/src/testing/accessibleNames.ts`: tipos `UnnamedReason`/
  `UnnamedControl` definitivos; `findUnnamedControls` lança
  `not implemented` (T005).

## Armadilhas já mapeadas

- **Cascata**: `screens.css` está entre `vod.css` e `player.css` em
  `main.tsx`. Várias classes estão também em `live`/`vod`/`components`/
  `utilities`/`home`/`search`... Mover para um arquivo em outra posição
  troca o vencedor. Use `styles/shared.css` **no mesmo slot** ou o topo de
  `player.css` (D-003). A paridade é o que pega o erro — jsdom não aplica
  CSS.
- **Baseline antes de tudo**: T002 captura `antes` com zero mudança de
  CSS/TSX. Rodar duas vezes e `comparar` tem que dar zero, senão o script
  não é determinístico.
- **`--hide-scrollbars`**: o Chromium headless do Playwright esconde
  barras por padrão. `limpeza-qa.mjs` precisa de
  `ignoreDefaultArgs: ['--hide-scrollbars']`, senão passa sem provar nada.
  A paridade, ao contrário, mantém o padrão.
- **Chromium 108 não suporta `scrollbar-width`** (chegou no 121). Só
  `::-webkit-scrollbar { display: none }` funciona na TV.
- **Não troque `overflow: auto` por `hidden`**: a rolagem por foco e a
  virtualização precisam do contêiner rolável.
- **Glob de rota**: nunca `page.route('**/live/**')`/`vod`/`series` — casa
  com `/src/features/live/*.tsx` do Vite e derruba o app (027).
  `e2e/paridade-visual.mjs` (021) tem esse glob: não copie dele.
- **`VodCatalogScreen` serve Filmes e Séries** e `Rail` serve Início e
  Busca: a `.no-scrollbar` vale nos dois, e isso é esperado.
- **Comentários corrompidos** (UTF-8 lido como Latin-1) em `screens.css`:
  corrija ao mover.
- **`ConfirmDialog`** só é importado pelo próprio teste; comentários em
  `useRemoteNav.ts`, `Modal.tsx`, `PlayerLayer.tsx` e
  `NextEpisodeCountdown.tsx` o citam como precedente — atualize.
- **Rótulos de contratos de outras features**: ao corrigir nome acessível,
  não troque texto que um contrato travado procura (ex.: `Pausar`,
  `Velocidade — em breve` da 027). Se colidir, pare (5b).
- **Flakes conhecidos** sob paralelismo: `*.favorites.test.tsx`,
  `LiveScreen.test.tsx`. Confirme isolado antes de tratar como regressão.
- **E2E no Windows**: override temporário do `executablePath`; reinicie o
  `npm run dev` antes de rodar a sequência.
- **`test:e2e` não cobre todos os scripts** (`player-chrome.mjs`,
  `filmes-series-ds-v14.mjs`, `capa-real.mjs`...): no Polish, rode todos.

## Pendências do Analyze

- **A1 (MEDIUM)**: o FR-004 fala em redistribuir "dimensões de cards/rails
  e espaçamento", mas o D-005 fixa os rails e faz só o hero crescer. Mostre
  a captura do Início ao fim da Fase 3 e confirme com o usuário (R-004). Se
  ele quiser cards maiores, é emenda de plano: o `Rail` exige dimensões
  fixas.
- **A2 (MEDIUM)**: o FR-003 (e o US1/AC5) pede "indicador de overflow do
  DS". O D-009 interpreta, no vertical, como o próximo item parcialmente
  visível, sem componente novo. Nenhuma task mede isso explicitamente.
  Registre na matriz (critério "indicador de overflow") para Filmes e
  Início com captura como evidência.
- **A3 (LOW)**: o FR-024 (só tokens) não tem verificação dedicada para o
  CSS novo das T006/T010/T011. Confira por grep no checkpoint (nenhum
  hex/px literal novo fora de `var(...)`).
- **A4 (LOW)**: a `.no-scrollbar` no `VodCatalogScreen`/`Rail` alcança
  Séries e Busca, além de Filmes/Início. É o esperado pelo FR-006/D-002;
  registre na matriz como `reprovado-corrigido` se a barra existia lá.

## Gate de pronto

- Contrato 3/3 verde e as travas de **todas** as features íntegras
  (inclusive a 017, regravada na T050).
- `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`,
  `npm run build:tizen` limpos.
- E2E: `limpeza-qa.mjs` + `paridade-limpeza.mjs comparar` (sai 0) + todos
  os `e2e/*.mjs` + `npm run test:e2e`.
- `quickstart.md` executado no navegador.
- Docs no Polish: parágrafo da 028 em `CLAUDE.md` e migração V14
  concluída na seção "Design system", `.planning/migracao-design-system-v14.md`,
  `.planning/backlog.md` (M8/Fase 1.5 e as 5 entradas `[Bug]` absorvidas).
- **Passada na TV física obrigatória** (T056, SC-008, skill `tizen-tv`).
  Fechar sem ela só com decisão explícita do usuário registrada em
  `Riscos e Decisões`.
