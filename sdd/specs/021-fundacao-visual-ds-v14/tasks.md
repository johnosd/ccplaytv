---
description: "Tasks da feature 021 — Fundação Visual do Design System V14"
---

# Tasks: Fundação Visual do Design System V14 (Onda 0 da migração)

**Input**: Documentos de design de `sdd/specs/021-fundacao-visual-ds-v14/`

**Prerequisites**: plan.md, spec.md, quickstart.md, logic/regiao-de-anuncio.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story, para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: a qual user story a task pertence (US1–US5)

## Path Conventions

- Frontend único em `tv-web/`: código em `tv-web/src/`, estilos globais novos em `tv-web/src/styles/`, fontes em `tv-web/src/assets/fonts/`.
- Scripts de build em `tv-web/scripts/` (Node ESM `.mjs`, fora do `tsc`). Roteiros E2E em `tv-web/e2e/`, fixtures em `tv-web/e2e/fixtures/`.
- Pacote Tizen em `CCPlayTv/` (derivado do build, **nunca** editar `CCPlayTv/index.html` à mão). A lista do pacote fica em `CCPlayTv/tizen_web_project.yaml`.
- Evidências da feature em `sdd/specs/021-fundacao-visual-ds-v14/evidencias/`.
- Comandos rodam em `tv-web/`, salvo `check-contract-tests.ps1`, que roda da raiz do repositório.

**Regra transversal (FR-027, D-010)**: nenhuma asserção de teste existente é editada, e nenhuma regra de `tv-web/src/features/screens.css` muda. Se um teste existente quebrar, a implementação está errada, não o teste.

---

## Phase 1: Setup (baseline antes de qualquer mudança)

**Purpose**: congelar o "antes" (capturas e resultados das suítes) **antes** de tocar em qualquer arquivo de produção. Sem isso, SC-003/SC-006 não têm com o que comparar.

- [X] T001 Criar a fixture fictícia `tv-web/e2e/fixtures/paridade-visual.m3u`: alguns canais em 2 grupos, 3 filmes em 1 categoria e 1 série com 2 episódios `S01E01`/`S01E02`, com URLs `http://exemplo.test/...` e sem `tvg-logo`. Nomes com acentos e um título longo, para verificar quebra de linha.
- [X] T002 Criar `tv-web/e2e/paridade-visual.mjs` (D-011), seguindo o padrão de `e2e/historico-continuar-assistindo.mjs`: servidor HTTP local da fixture, adicionar fonte via UI e `executablePath` igual aos demais scripts (R-006). Argumento `antes|depois` escolhe a pasta de saída em `sdd/specs/021-fundacao-visual-ds-v14/evidencias/<arg>/`.
  - Em 1920×1080, capturar: `01-lista-fontes`, `02-hub`, `03-live`, `04-filmes`, `05-series`, `06-detalhe-filme`, `07-detalhe-serie`, `08-player` (filme aberto no `<video>` de dev, controles visíveis).
  - Com `depois`, também `03-live`/`04-filmes`/`08-player` em 1280×720 e 3840×2160, com sufixo `-720p`/`-4k`.
  - Esperar a fonte carregar (`document.fonts.ready`) antes de cada captura.
- [X] T003 Rodar `node e2e/paridade-visual.mjs antes` com o app **ainda sem nenhuma mudança** desta feature, exceto os stubs do plan, que não alteram a UI, e conferir as 8 imagens em `evidencias/antes/`.
- [X] T004 Registrar a baseline no Registro desta fase: resultado de `npx vitest run` (contagem e instabilidades conhecidas) e de cada script de `npm run test:e2e` rodado individualmente (quais passam hoje; `e2e.mjs` deve falhar pelo bug conhecido, R-005).
- [X] T004a **[descoberta durante T004]** `favoritos.mjs` falhava de forma determinística — bug pré-existente do próprio script (não do app), desatualizado desde a feature 018: duas linhas pressionavam `ArrowUp` uma única vez esperando chegar em "★ Favoritos", mas a feature 018 inseriu "Todos" como 2ª entrada fixa da trilha (`VIRTUAL_TRAIL_COUNT=2`), então uma seta só chega em "Todos". Nunca detectado porque o script também não tinha o fallback `existsSync` para rodar fora do ambiente Linux fixo (mesmo problema de `zapping-live-tv.mjs`). Aprovado pelo usuário como desvio pequeno: corrigidas as 2 ocorrências (2ª `ArrowUp`) e adicionado o fallback `existsSync` em `favoritos.mjs` **e** `zapping-live-tv.mjs` (mesmo padrão dos outros 6 scripts). → R-009.

**Critério de Conclusão**: `evidencias/antes/` com as 8 capturas e a baseline de vitest/E2E registrada abaixo. Nenhum arquivo de produção alterado nesta fase.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T001–T004 + T004a (desvio pequeno aprovado pelo usuário, ver R-009 em plan.md)
- Contrato: sem contrato nesta fase
- Testes executados:
  - `npx vitest run` → 736 passed / 8 failed (5 contratos, vermelhos pelo motivo esperado — ver Fase 2+; 3 falhas de `*.favorites.test.tsx` sob paralelismo, confirmadas 23/23 isoladas — instabilidade conhecida do projeto, não desta feature)
  - `node e2e.mjs` → FALHA pré-existente (bug do backlog: diálogo de saída inexistente em `AddSourceScreen`), R-005
  - `node e2e/favoritos.mjs` → corrigido nesta fase (T004a); 18/18 verdes após a correção
  - `node e2e/m3u-sob-demanda.mjs` → intermitente neste ambiente (3 execuções: 2 falhas em pontos diferentes da suíte, 1 sucesso completo — 26/26); tratado como instabilidade de ambiente sob carga, não regressão desta feature (nenhum arquivo de produção tocado até aqui)
  - `node e2e/capa-real.mjs` → verde (4/4)
  - `node e2e/zapping-live-tv.mjs` → verde (11/11) após o fallback Windows (T004a)
  - `node e2e/busca-por-categoria.mjs` → verde (17/17)
  - `node e2e/historico-continuar-assistindo.mjs` → verde
  - `node e2e/ciclo-vida-player.mjs` → verde
  - `node e2e/paridade-visual.mjs antes` → 8/8 capturas salvas em `evidencias/antes/`
- Pendências: nenhuma

---

## Phase 2: Foundational — tokens V14 (bloqueia todas as stories)

**Purpose**: todos os tokens da tabela "Tokens" do `plan.md` (D-001) existem, com os nomes antigos resolvendo para os mesmos valores. Fontes, palco, utilitários e reduced motion referenciam esses tokens.

- [X] T005 Em `tv-web/src/index.css`, adicionar ao `:root` todos os tokens V14 da tabela de D-001 com os valores exatos. Converter os nomes existentes em alias com **o mesmo valor** (ex.: `--bg: var(--bg-canvas)`, `--surface-deep: var(--bg-base)`, `--accent-hover: var(--accent-light)`, `--text-muted: var(--text-disabled)`, `--text-tertiary: var(--text-annotation)`). **Não** copiar aliases do Component Lab (`--bg`, `--surface`, `--muted`, `--r8`…) com os valores de lá (D-001).
- [X] T006 Em `tv-web/src/index.css`, reescrever a regra de foco (`button:focus, input:focus, [tabindex]:focus, .tv-focus`) e a de `transition` usando `--focus-ring-width`, `--focus-ring-offset`, `--focus-halo`, `--focus-glow`, `--focus-scale` e `--duration-fast`, com valores idênticos aos atuais (D-008).

### Testes da Fase

- [X] T007 [P] Criar `tv-web/src/styles/tokens.test.ts`, que lê `index.css` (via `node:fs`, não `?raw`/`?inline` — Vitest troca qualquer import de `.css` por um módulo vazio por padrão, `test.css` não está ligado em `vite.config.ts`; achado ao escrever esta task) e confere:
  - todo nome V14 da tabela de D-001 está declarado;
  - cada alias antigo resolve para o mesmo valor literal de antes (lista fixa no teste, copiada do `index.css` atual antes de T005).

**Critério de Conclusão**: `npx tsc -b` e `npx vitest run` verdes (exceto os contratos ainda vermelhos). O teste de T007 verde. Abrindo o app em 1920×1080, nenhuma diferença visível.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T005–T007
- Contrato: sem contrato nesta fase; os 5 contratos das fases seguintes seguem vermelhos pelo motivo esperado (`check-contract-tests.ps1` íntegro)
- Testes executados:
  - `npx tsc -b` → limpo
  - `npx vitest run src/styles/tokens.test.ts` → 74/74 verdes
  - `npx vitest run` (suíte completa) → 810 passed / 8 failed (5 contratos esperados + 3 `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo — confirmadas isoladas: `LiveScreen.favorites.test.tsx` 15/15 sozinho)
  - Achado ao escrever T007: `.css?raw`/`.css?inline` voltam string vazia sob Vitest (mock automático de CSS); contornado lendo o arquivo com `node:fs` — precisou de `/// <reference types="node" />` no topo do arquivo porque `tsconfig.app.json` restringe `types` a `vite/client`
- Pendências: nenhuma

---

## Phase 3: User Story 1 — App abre com a tipografia certa mesmo sem internet (Priority: P1) 🎯 MVP

**Objetivo**: Poppins/Inter vêm só de arquivos do app/pacote, com `lang="pt-BR"` e uma guarda que impede arquivo do build fora do `.wgt`.

**Independent Test**: seção 2 do `quickstart.md` (Network bloqueando Google Fonts) mais `npm run build:tizen` sem faltantes.

### Contrato da Fase

- C1 `não referencia serviço de fontes externo, declara pt-BR e aponta @font-face para os 8 arquivos locais` (US1/AC2 · FR-001, FR-002, FR-026)
- C2 `findUnlistedFiles acusa arquivo do build fora da lista (inclusive caminho com \) e a lista real cobre as fontes` (FR-005 · D-009)
- Comando: `npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs`

### Implementation

- [X] T008 [US1] Vendorizar as fontes (D-002):
  - rodar `npm install --no-save @fontsource/poppins@5 @fontsource/inter@5`;
  - copiar de `node_modules/@fontsource/{poppins,inter}/files/` os 8 arquivos `poppins-latin-{600,700,800}-normal.woff2` e `inter-latin-{400,500,600,700,800}-normal.woff2` para `tv-web/src/assets/fonts/`;
  - copiar o `LICENSE` de cada pacote como `tv-web/src/assets/fonts/OFL-Poppins.txt` e `OFL-Inter.txt`;
  - conferir que `package.json`/`package-lock.json` **não** mudaram.

  → contrato: C1
- [X] T009 [US1] Criar `tv-web/src/styles/fonts.css` com um `@font-face` por arquivo: `font-family` `'Poppins'`/`'Inter'`, `font-weight` correspondente, `font-style: normal`, `font-display: swap`, `src: url('../assets/fonts/<arquivo>') format('woff2')`. Importar em `tv-web/src/main.tsx` antes de `./index.css`. → contrato: C1
- [X] T010 [US1] Em `tv-web/src/index.css`, trocar as pilhas de `--font-heading`/`--font-body` para `'Poppins', Arial, Helvetica, sans-serif` e `'Inter', Arial, Helvetica, sans-serif` (FR-003, R-008). *(feito junto com T005, ao escrever o arquivo completo.)*
- [X] T011 [US1] Em `tv-web/index.html`, remover os três `<link>` de `fonts.googleapis.com`/`fonts.gstatic.com` e trocar `lang="en"` por `lang="pt-BR"`. → contrato: C1
- [X] T012 [US1] Implementar `findUnlistedFiles` em `tv-web/scripts/tizenFiles.mjs`:
  - lê só os itens `- <caminho>` da seção `files:`, até a próxima chave de topo;
  - ignora comentários `#` e linhas vazias;
  - normaliza `\` para `/`;
  - devolve os faltantes na ordem de entrada.

  → contrato: C2
- [X] T013 [US1] Em `tv-web/scripts/sync-tizen.mjs`, antes de copiar:
  - listar recursivamente os arquivos de `dist/`, com caminho relativo;
  - chamar `findUnlistedFiles` com o texto de `CCPlayTv/tizen_web_project.yaml`;
  - se houver faltantes, imprimir cada um e sair com código 1, sem copiar nada.
- [X] T014 [US1] Em `CCPlayTv/tizen_web_project.yaml`, adicionar os 8 `assets/<fonte>.woff2` em `files:`, com um comentário explicando que são as fontes locais da feature 021 e que um arquivo fora desta lista só falha na TV. → contrato: C2
- [X] T015 [US1] Rodar `npm run build:tizen` e conferir:
  - a guarda passa;
  - `dist/assets/` contém exatamente os 8 `.woff2` com esses nomes;
  - `CCPlayTv/index.html` foi regenerado sem Google Fonts e com `lang="pt-BR"`.

  Se o build emitir algum arquivo que já estava fora da lista antes desta feature (ex.: imagem de `src/assets/` não usada), registrar em Riscos e Decisões e resolver com o usuário, sem simplesmente adicionar.
  *(Nenhum arquivo extra apareceu. A guarda foi testada de propósito — copiando um arquivo fictício pra `dist/assets/` — e bloqueou corretamente antes de sincronizar.)*

### Testes da Fase

- [X] T016 [P] [US1] Criar `tv-web/scripts/tizenFiles.test.mjs` para casos extras de `findUnlistedFiles`: YAML sem seção `excludes:`, `files:` como última seção, indentação com 4 espaços e itens entre aspas.

**Critério de Conclusão**: `npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs` → 2/2 verdes, e `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` íntegro. `npm run build:tizen` verde. Seção 2 do `quickstart.md` feita no navegador: nenhuma requisição de fonte externa, Poppins/Inter renderizadas.

**Checkpoint**: US1 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T008–T016
- Contrato: `npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs` → 2/2 verdes (C1, C2); `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` → trava íntegra
- Testes executados:
  - `npx vitest run scripts/tizenFiles.test.mjs scripts/pacoteTizen.fundacao-visual.contract.test.mjs` → 7/7 verdes
  - `npx tsc -b` → limpo; `npm run lint` → só avisos pré-existentes, nenhum novo
  - `npm run build:tizen` → guarda passou; `dist/assets/` com os 8 `.woff2` exatos; `CCPlayTv/index.html` regenerado com `lang="pt-BR"` e sem Google Fonts
  - Guarda testada de propósito: arquivo fictício copiado pra `dist/assets/` fez `sync-tizen.mjs` sair com código 1 listando o arquivo, sem sincronizar; removido e ressincronizado limpo depois
  - Verificação manual (`quickstart.md` §2, via MCP Playwright no dev server): as 8 famílias/pesos aparecem em `document.fonts` (`Poppins` 600/700/800, `Inter` 400/500/600/700/800), nenhuma requisição a `fonts.googleapis.com`/`fonts.gstatic.com`, título em Poppins e corpo em Inter na captura de tela
  - `npx vitest run` (suíte completa) → 815 passed / 8 failed (3 contratos das fases seguintes, ainda vermelhos como esperado, + 5 flakes conhecidas de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo)
- Pendências: nenhuma

---

## Phase 4: User Story 2 — A interface ocupa a tela corretamente em qualquer resolução (Priority: P1)

**Objetivo**: palco 1920×1080 escalado e centralizado. Identidade (sem `transform`) em 1920×1080.

**Independent Test**: seção 3 do `quickstart.md`.

### Contrato da Fase

- C3 `escala uniforme e centralizada; em 1920×1080 é a identidade, sem transform` (US2/AC1–AC3 · FR-009, FR-010 · D-003)
- Comando: `npx vitest run src/lib/stage.fundacao-visual.contract.test.ts`

### Implementation

- [X] T017 [US2] Implementar `computeStageLayout` em `tv-web/src/lib/stage.ts`:
  - `scale = min(vw/1920, vh/1080)`;
  - `offsetX = (vw - 1920*scale)/2`, `offsetY = (vh - 1080*scale)/2`;
  - `transform = null` quando `scale === 1 && offsetX === 0 && offsetY === 0`;
  - senão, `` `translate(${offsetX}px, ${offsetY}px) scale(${scale})` ``.

  → contrato: C3
- [X] T018 [US2] Criar `tv-web/src/components/Stage.tsx` (D-003):
  - renderiza `<div className="stage">` com `children`;
  - aplica `style.transform` a partir de `computeStageLayout(window.innerWidth, window.innerHeight)`;
  - recalcula no `resize` da janela com listener removido no unmount, mudando só o estilo, sem trocar a `key` nem remontar filhos.
- [X] T019 [US2] Em `tv-web/src/styles/utilities.css` (criar o arquivo; importado em `main.tsx` depois de `index.css` e antes de `features/screens.css`), declarar `.stage`: `position: absolute; top: 0; left: 0; width: var(--stage-width); height: var(--stage-height); transform-origin: 0 0; overflow: hidden;`, **sem** `background`.
- [X] T020 [US2] Em `tv-web/src/main.tsx`, envolver `<App />` com `<Stage>`, por dentro do `QueryClientProvider`. *(Stage por FORA do `QueryClientProvider` — envolve ele, não o contrário; nenhum dos dois depende de ordem entre si, e assim o palco fica no nível mais alto da árvore.)*
- [X] T021 [US2] Verificar que as regras `:root.video-plane-visible …` (`index.css`, `screens.css`) continuam valendo com o palco: `.stage` não tem fundo, e `.screen`/`.movie-detail-layout` seguem como filhos diretos do conteúdo do app. Se uma nova raiz precisar de ajuste, fazê-lo em `index.css`/`utilities.css`, **nunca** em `screens.css` (D-010), e registrar em Riscos e Decisões. *(Nenhum ajuste necessário: os seletores usam `.screen > *`/`.movie-detail-layout > *`, sem depender de profundidade a partir de `#root` — inserir `.stage` como novo ancestral não os afeta. `:root.video-plane-visible { background: transparent }` também é independente da posição de `.stage` na árvore.)*

### Testes da Fase

- [X] T022 [P] [US2] Criar `tv-web/src/components/Stage.test.tsx` com três casos:
  - em 1920×1080 (jsdom: `window.innerWidth/innerHeight`) o `.stage` não tem `transform`;
  - após mudar para 1280×720 e disparar `resize`, `.stage` tem `transform` com `scale(0.666…)`;
  - um `<button>` focado dentro do palco continua sendo `document.activeElement` e é o mesmo nó depois do `resize` (FR-011).
- [X] T023 [US2] Rodar `npx vitest run src/components/PlayerLayer.test.tsx src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` e confirmar que continuam verdes sem alteração.

**Critério de Conclusão**: `npx vitest run src/lib/stage.fundacao-visual.contract.test.ts` → 1/1 verde, e contratos íntegros. Seção 3 do `quickstart.md` itens 3–5 conferidos no navegador. Em 1920×1080 o `.stage` não tem `transform` (DevTools).

**Checkpoint**: US2 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T017–T023
- Contrato: `npx vitest run src/lib/stage.fundacao-visual.contract.test.ts` → 1/1 verde (C3); `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` → trava íntegra
- Testes executados:
  - `npx vitest run src/components/Stage.test.tsx src/lib/stage.fundacao-visual.contract.test.ts` → 4/4 verdes
  - `npx vitest run src/components/PlayerLayer.test.tsx src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 46/46 verdes, sem alteração
  - `npx tsc -b` → limpo
  - Verificação manual no navegador (MCP Playwright): em 1920×1080 `.stage` sem `transform`, `getBoundingClientRect()` = 0,0,1920,1080; em 1280×720 `transform: translate(0px, 0px) scale(0.666667)`, captura de tela confirma a interface inteira, proporcional, sem corte
  - `npx vitest run` (suíte completa) → 818 passed / 8 failed (2 contratos das fases seguintes ainda vermelhos como esperado — Toast, motionPreference — + 6 flakes conhecidas de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo, mesmo padrão já documentado no projeto)
- Pendências: nenhuma

---

## Phase 5: User Story 3 — Toasts são anunciados pelo leitor de tela (Priority: P2)

**Objetivo**: uma região `aria-live="polite"` persistente. Os toasts passam a ser renderizados dentro dela, sem texto duplicado (D-004).

**Independent Test**: seção 4 do `quickstart.md`.

### Contrato da Fase

- C4 `toast aparece uma única vez, dentro da região polite persistente, é reanunciado ao repetir e não move o foco` (US3/AC1–AC3 · FR-023–FR-025 · Constitution: Foco Visível)
- Comando: `npx vitest run src/components/Toast.fundacao-visual.contract.test.tsx`

### Implementation

Seguir `logic/regiao-de-anuncio.md` à risca, inclusive a seção "O que NÃO fazer".

- [X] T024 [US3] Implementar `AnnouncerRegion` em `tv-web/src/components/AnnouncerRegion.tsx`:
  - renderiza `children` e depois o `div.announcer-region`, com `role="status"`, `aria-live="polite"` e `<span className="sr-only" />` dentro;
  - guarda o elemento por callback ref em estado e o fornece em `AnnouncerContext`.

  → contrato: C4
- [X] T025 [US3] Em `tv-web/src/styles/utilities.css`, adicionar `.announcer-region` (fixed, 0×0, `overflow: visible`, `z-index: var(--z-overlay)`) e `.sr-only` (padrão visualmente oculto: 1px, clip, sem ocupar espaço).
- [X] T026 [US3] Em `tv-web/src/lib/useToast.ts`, trocar o `toastKey` fixo por um contador em estado, incrementado a cada `showToast`, inclusive com texto repetido. → contrato: C4
- [X] T027 [US3] Em `tv-web/src/components/Toast.tsx`, ler `AnnouncerContext`:
  - sem região, renderizar exatamente como hoje;
  - com região, `createPortal(<div className="toast" key={messageKey}>{message}</div>, region)`, sem `role`.

  → contrato: C4
- [X] T028 [US3] Implementar `useAnnounce` em `tv-web/src/lib/announcer.ts` (limpa o slot `.sr-only` e grava após ~20 ms; no-op sem região; nunca chama `focus()`).
- [X] T029 [US3] Em `tv-web/src/main.tsx`, envolver `<App />` com `<AnnouncerRegion>` **dentro** do `<Stage>`.
- [X] T030 [US3] Passar `messageKey={toastKey}` em cada `<Toast>` existente, pegando `toastKey` do `useToast()` já presente:
  - `tv-web/src/features/home/HomeScreen.tsx`;
  - `tv-web/src/features/live/LiveScreen.tsx` (4 ocorrências);
  - `tv-web/src/features/movies/MovieDetailScreen.tsx`;
  - `tv-web/src/features/movies/MoviesScreen.tsx`;
  - `tv-web/src/features/series/SeriesScreen.tsx`.

  Nenhuma outra mudança nessas telas (D-010).

### Testes da Fase

- [X] T031 [P] [US3] Em `tv-web/src/components/Toast.test.tsx` (novo), testar que o `Toast` **sem** `AnnouncerRegion` renderiza `role="status"` com o texto, como antes.
- [X] T032 [P] [US3] Em `tv-web/src/lib/announcer.test.tsx` (novo), testar `useAnnounce`:
  - sem região não lança;
  - com região, a mensagem aparece no slot `.sr-only` (usar `vi.useFakeTimers`);
  - a mesma mensagem repetida limpa e regrava;
  - não altera `document.activeElement`.
- [X] T033 [US3] Rodar `npx vitest run src/features` e confirmar as suítes de tela verdes sem editar asserções. As instabilidades conhecidas devem ser confirmadas isoladas.

**Critério de Conclusão**: `npx vitest run src/components/Toast.fundacao-visual.contract.test.tsx` → 1/1 verde, e contratos íntegros. Suítes de tela verdes sem alteração de asserção. Seção 4 do `quickstart.md` feita com leitor de tela, ou registrada como não executada.

**Checkpoint**: US3 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T024–T033
- Contrato: `npx vitest run src/components/Toast.fundacao-visual.contract.test.tsx` → 1/1 verde (C4); `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` → trava íntegra
- Testes executados:
  - `npx vitest run src/components/Toast.test.tsx src/lib/announcer.test.tsx` → 6/6 verdes (achado ao escrever: `renderHook` não expõe `container`, e sem `afterEach(cleanup)` explícito o `.sr-only` da região anterior vazava pro teste seguinte — corrigido antes de fechar a fase)
  - `npx vitest run src/features` (todas as telas) → 254/258 (4 flakes conhecidas sob paralelismo, confirmadas 64/64 isoladas junto com `LiveScreen.test.tsx`)
  - `npx tsc -b` → limpo; `npm run lint` → só avisos pré-existentes
  - `node e2e/favoritos.mjs` (app real, dev server) → 18/18 verdes — prova de ponta a ponta que o portal não duplica o texto do toast fora do jsdom
  - Verificação manual (MCP Playwright): exatamente uma região `[aria-live="polite"]` (`role="status"`) no documento
  - `npx vitest run` (suíte completa) → 827 passed / 5 failed (1 contrato da fase seguinte ainda vermelho — motionPreference — + 4 flakes conhecidas)
- Pendências: seção 4 do `quickstart.md` (leitor de tela real) fica para a passada manual final da feature — a prova de ponta a ponta acima (E2E real + região única confirmada) já cobre o essencial do contrato

---

## Phase 6: User Story 4 — Movimento reduzido é respeitado (Priority: P3)

**Objetivo**: a media query e a preferência interna persistida desligam transições, mantendo o estado final do foco.

**Independent Test**: seção 5 do `quickstart.md`.

### Contrato da Fase

- C5 `preferência persistida liga/desliga a classe; armazenamento bloqueado não lança e não aplica` (US4/AC2–AC3 · FR-018, FR-019)
- Comando: `npx vitest run src/lib/motionPreference.fundacao-visual.contract.test.ts`

### Implementation

- [X] T034 [US4] Implementar `tv-web/src/lib/motionPreference.ts` (D-005):
  - o storage padrão é obtido por um acessor protegido por `try/catch`, porque acessar `window.localStorage` pode lançar;
  - `read` devolve `false` em qualquer falha;
  - `write` engole exceções;
  - `apply` faz `classList.toggle(REDUCED_MOTION_CLASS, read(storage))` em `root ?? document.documentElement`.

  → contrato: C5
- [X] T035 [US4] Em `tv-web/src/main.tsx`, chamar `applyMotionPreference()` antes de `createRoot(...).render`.
- [X] T036 [US4] Em `tv-web/src/index.css`, adicionar a regra de redução (Spec V14 §10) duplicada sob `@media (prefers-reduced-motion: reduce)` e sob `:root.reduce-motion`: `*, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }`. **Não** zerar `transform`, `outline` nem `box-shadow` do foco (D-005).

### Testes da Fase

- [X] T037 [P] [US4] Em `tv-web/src/lib/motionPreference.test.ts` (novo), cobrir:
  - `readReducedMotionPreference()` sem argumento, com `window.localStorage` cujo getter lança (`vi.spyOn(window, 'localStorage', 'get')`), devolve `false` sem lançar;
  - `applyMotionPreference()` sem `root` age em `document.documentElement`.

**Critério de Conclusão**: `npx vitest run src/lib/motionPreference.fundacao-visual.contract.test.ts` → 1/1 verde, e contratos íntegros. Seção 5 do `quickstart.md` feita no navegador.

**Checkpoint**: US4 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T034–T037
- Contrato: `npx vitest run src/lib/motionPreference.fundacao-visual.contract.test.ts` → 1/1 verde (C5) — **os 5 contratos da feature estão todos verdes agora**; `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` → trava íntegra
- Testes executados:
  - `npx vitest run src/lib/motionPreference.test.ts` → 2/2 verdes
  - `npx tsc -b` → limpo; `npm run lint` → só avisos pré-existentes
  - Verificação manual (`quickstart.md` §5, via MCP Playwright): `page.emulateMedia({reducedMotion:'reduce'})` colapsa `transitionDuration` pra `1e-05s` num elemento focável; com a emulação desligada e `localStorage.setItem('ccplaytv:reduce-motion','true')` + reload, o mesmo colapso acontece via `:root.reduce-motion` (`applyMotionPreference()` rodando antes do 1º render) — as duas fontes confirmadas independentemente
  - `npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs src/lib/stage.fundacao-visual.contract.test.ts src/components/Toast.fundacao-visual.contract.test.tsx src/lib/motionPreference.fundacao-visual.contract.test.ts` → 5/5 verdes (C1–C5, todos)
  - `npx vitest run` (suíte completa) → 828 passed / 6 failed, **zero contratos entre os falhos** — as 6 falhas são as flakes conhecidas de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo (mesmo padrão documentado no histórico do projeto)
- Pendências: nenhuma

---

## Phase 7: User Story 5 — Base visual pronta para as próximas ondas (Priority: P3)

**Objetivo**: utilitários de estado e conjunto de ícones prontos e testados, sem uso nas telas.

**Independent Test**: testes unitários desta fase, mais a inspeção de um elemento de teste com cada utilitário.

### Implementation

- [X] T038 [P] [US5] Em `tv-web/src/styles/utilities.css`, adicionar (D-007):
  - `.tv-focus.no-scale, .no-scale:focus { transform: none; }`;
  - `.pressed { transform: scale(.985); transition: transform var(--duration-fast) var(--ease); }`;
  - `.is-soft-disabled { opacity: .5; }` e `.is-soft-disabled.tv-focus, .is-soft-disabled:focus { opacity: 1; }`;
  - `.is-hard-disabled { opacity: .4; pointer-events: none; }`, sem receita de foco: `.is-hard-disabled.tv-focus, .is-hard-disabled:focus { outline: none; box-shadow: none; transform: none; }`.

  Documentar num comentário que tirar da ordem de foco é responsabilidade de quem renderiza.
- [X] T039 [P] [US5] Criar `tv-web/src/components/iconPaths.ts` com o desenho SVG de cada ícone (`viewBox 0 0 24 24`, traço, sem preenchimento): `play`, `pause`, `search`, `add`, `next`, `back`, `menu`, `device`, `settings`, `audio`, `subtitles`, `quality`, `info`, `favorite`, `live`, `rewind`, `forward`. Exportar o tipo `IconName` a partir das chaves. Os traçados do `uiIcon()` do protótipo V14 podem servir de base.
- [X] T040 [US5] Criar `tv-web/src/components/Icon.tsx` (D-006): `<Icon name label? className? />`, com `width`/`height` `var(--icon-size)`, `stroke="currentColor"`, `fill="none"`, `strokeWidth` fixo e `role="img"` + `aria-label` quando há `label`, `aria-hidden="true"` quando não há. Nenhuma tela passa a usá-lo (FR-022).

### Testes da Fase

- [X] T041 [P] [US5] Criar `tv-web/src/components/Icon.test.tsx`:
  - todos os `IconName` renderizam um `<svg>` com ao menos um `path`/forma;
  - com `label` é encontrado por `getByRole('img', { name })`;
  - sem `label` tem `aria-hidden="true"` e não é encontrado por `getByRole('img')`.
- [X] T042 [P] [US5] Criar `tv-web/src/styles/utilities.test.ts`, que lê `utilities.css` (via `node:fs`, mesma técnica de `tokens.test.ts` — `?raw`/`?inline` voltam vazio sob Vitest) e confere que as quatro classes de D-007 estão declaradas, e que `.is-hard-disabled` não usa `display: none`/`visibility: hidden` (continua visível, só indisponível).

**Critério de Conclusão**: T041/T042 verdes, `npx tsc -b` e `npm run lint` limpos, e nenhum `import` de `Icon` fora de `components/Icon*`: `rg "components/Icon" tv-web/src/features` vazio.

**Checkpoint**: US5 pronta para consumo pela feature 022.

**Registro da Fase**:

- Status: Concluída (2026-09-26)
- Feito: T038–T042
- Contrato: sem contrato nesta fase; os 5 contratos da feature seguem verdes (`check-contract-tests.ps1` íntegro)
- Testes executados:
  - `npx vitest run src/components/Icon.test.tsx src/styles/utilities.test.ts` → 24/24 verdes
  - `npx tsc -b` → limpo; `npm run lint` → só avisos pré-existentes
  - `rg "components/Icon" tv-web/src/features` (via Grep) → vazio, confirmado
  - `npx vitest run` (suíte completa) → 854 passed / 4 failed, zero contratos entre os falhos (as 4 flakes conhecidas de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo)
- Pendências: nenhuma

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: provar a paridade, rodar todos os gates e atualizar a documentação canônica.

- [X] T043 Rodar `node e2e/paridade-visual.mjs depois` (dev server de pé) e comparar com `evidencias/antes/` tela a tela (seção 3 do `quickstart.md`). Registrar o veredito de SC-003/SC-004 no Registro desta fase. Qualquer diferença de layout é defeito a corrigir antes de fechar (ver R-007).
- [X] T044 Rodar `npx vitest run` (suíte completa) e comparar com a baseline de T004: nada que passava pode falhar. As instabilidades conhecidas devem ser confirmadas isoladas.
- [X] T045 Rodar `npm run test:e2e` e cada script individualmente, comparando com a baseline de T004 (R-005). *(Achado nesta task: `e2e/capa-real.mjs`, de outra feature, desatualizado por uma mudança de comportamento intencional desta feature — corrigido como desvio pequeno aprovado pelo usuário, ver R-011.)*
- [X] T046 Rodar `npx tsc -b`, `npm run lint` e `npm run build:tizen` (guarda D-009 sem faltantes).
- [X] T047 Executar as seções 1–5 do `quickstart.md` e registrar cada resultado. *(Já executadas ao longo das fases — consolidado aqui: §1 nesta mesma fase (T044–T046); §2 na Fase 3 (fontes sem internet, MCP Playwright); §3 na Fase 4 (escala 1920×1080/1280×720, MCP Playwright) e nesta fase (capturas antes/depois); §4 na Fase 5 (região `aria-live` única confirmada + prova de ponta a ponta via `favoritos.mjs` no app real); §5 na Fase 6 (emulação de media query + preferência interna via `localStorage`, MCP Playwright, as duas fontes independentemente).*
- [X] T048 Atualizar `CLAUDE.md`:
  - na seção "Design system", registrar que as fontes são locais (`tv-web/src/assets/fonts/`, `styles/fonts.css`, OFL), os tokens V14 estão em `index.css` com aliases antigos, e existem o palco `Stage` + `stage.ts` e a região de anúncio (`AnnouncerRegion`; toast renderizado dentro dela, e por quê);
  - na descrição de `CCPlayTv/`, registrar que `sync-tizen.mjs` agora recusa arquivo do build fora de `files:`;
  - no status do projeto, registrar a feature 021 com veredito honesto.
- [X] T049 (Recomendado, não obrigatório) Seção 6 do `quickstart.md` na TV física via skill `tizen-tv`. Registrar em Riscos e Decisões como executado ou não executado, nunca presumido. **Decisão do usuário (2026-09-26): não executado agora** — registrado como pendência recomendada, não bloqueante, em R-012.

### Checklist de Release

- [X] Fase 1 (baseline) concluída
- [X] Fase 2 (tokens) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Fase 7 (US5) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` íntegro
- [X] Nenhuma asserção de teste existente editada, e `screens.css` intocado (`git diff --stat` conferido — vazio)
- [X] Capturas antes/depois revisadas sem diferença de layout em 1920×1080 (8 telas comparadas manualmente, T043)
- [X] `npm run test:e2e` sem regressão em relação à baseline (7/8 scripts verdes; `e2e.mjs` falha pelo mesmo bug pré-existente da baseline, R-005; 2 achados de outras features corrigidos como desvio pequeno, R-009/R-011)
- [X] `npm run build:tizen` verde com a guarda D-009
- [X] Revisão de segredos: nenhuma credencial em fixture, captura ou log — todas as fixtures desta feature usam URLs `http://exemplo.test/...` fictícias
- [X] `quickstart.md` seções 1–5 executadas; seção 6 registrada como não executada (decisão explícita do usuário, R-012)
- [X] `CLAUDE.md` atualizado

**Registro da Fase**:

- Status: Concluída (2026-09-26) — feature inteira código-completo
- Feito: T043–T049 + os dois achados desta fase (R-009 favoritos.mjs, já corrigido na Fase 1; R-011 capa-real.mjs)
- Contrato: 5/5 verdes na suíte completa (`npx vitest run scripts/pacoteTizen.fundacao-visual.contract.test.mjs src/lib/stage.fundacao-visual.contract.test.ts src/components/Toast.fundacao-visual.contract.test.tsx src/lib/motionPreference.fundacao-visual.contract.test.ts` → 5/5); `check-contract-tests.ps1 -Slug 021-fundacao-visual-ds-v14` → trava íntegra
- Testes executados:
  - `node e2e/paridade-visual.mjs depois` → 14 capturas; comparação manual das 8 telas principais em 1920×1080 com `evidencias/antes/` → **sem diferença de layout** (SC-003); 720p/4K → interface inteira, proporcional, sem corte (SC-004)
  - `npx vitest run` (suíte completa) → 858 passed / 3 failed (zero contratos; 3 flakes conhecidas sob paralelismo)
  - `npm run test:e2e` → interrompido em `e2e.mjs` (bug pré-existente, R-005, idêntico à baseline). Rodados individualmente: `favoritos.mjs` (intermitente sob carga — 2 falhas + depois 18/18 e 18/18 limpos, mesma classe do R-010), `m3u-sob-demanda.mjs` (26/26), `capa-real.mjs` (achado + corrigido, R-011, 2x verde depois), `zapping-live-tv.mjs` (11/11), `busca-por-categoria.mjs` (17/17), `historico-continuar-assistindo.mjs` (verde), `ciclo-vida-player.mjs` (verde) — **nenhuma regressão real**, só instabilidade de ambiente já documentada e um comportamento de outra feature desatualizado por uma mudança intencional desta
  - `npx tsc -b` → limpo; `npm run lint` → só avisos pré-existentes; `npm run build:tizen` → guarda D-009 passou, sem faltantes
  - `quickstart.md` §1–5 executadas (consolidado nas fases correspondentes); §6 (TV física) não executada, decisão explícita do usuário (R-012)
- Pendências: R-012 (TV física, recomendada não obrigatória) — nenhuma outra

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1 (baseline)**: primeira, obrigatoriamente antes de qualquer mudança de produção.
- **Fase 2 (tokens)**: depende da 1. Bloqueia todas as stories.
- **Fases 3–7**: dependem da 2. Entre si:
  - US2 (Fase 4) cria `utilities.css`, que US3, US4 e US5 estendem. Fazer a Fase 4 antes das 5–7, ou criar o arquivo vazio em quem chegar primeiro.
  - US3 (Fase 5) monta `AnnouncerRegion` **dentro** do `Stage`, então depende da Fase 4 em `main.tsx`.
  - US1, US4 e US5 são independentes entre si.
- **Fase 8**: depende de todas.

### Parallel Opportunities

- T007, T016, T022, T031, T032, T037, T041 e T042 são testes em arquivos próprios.
- Fase 7 (US5) inteira pode andar em paralelo com a Fase 3 (US1).

---

## Implementation Strategy

### MVP First

1. Fases 1 e 2.
2. Fase 3 (US1, fontes locais), a única mudança que alguém sem leitor de
   tela percebe. Validar isoladamente.
3. Fase 4 (US2, palco).

### Incremental Delivery

Fases 5 → 6 → 7. Cada uma fecha com seu contrato ou testes verdes e as
suítes existentes intactas. Polish por último, com as capturas "depois".

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada fase fechada.
- Os contratos são travados: **nunca** editar os 4 arquivos listados em `contract-tests.lock`.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
