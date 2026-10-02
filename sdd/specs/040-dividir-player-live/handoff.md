# Handoff — 040-dividir-player-live

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: `tv-web/` React 19 + TS + Vite, client-first (ADR-008), teclado por `useRemoteNav` (ADR-009).
- Próximo comando: `/sdd-execute 040-dividir-player-live`. Status no backlog: **Planejada** (0/34: 26 tasks + 8 do checklist).
- **Antes de começar**: a árvore tem o trabalho do item 63 + feature 036 **sem commit** (T001/D-008). Pedir ao usuário para commitar — o executor nunca commita sozinho.

## O que a feature entrega

- **P1 (US1)** — `components/PlayerLayer.tsx` só compõe; sessão/ciclo de vida, chrome, painéis e teclado em `components/player/` (pasta nova). Nada muda para quem usa.
- **P2 (US2)** — `features/live/LiveScreen.tsx` só compõe; trilha/lista, busca, zapping, guia, teclado e desenho em módulos próprios.
- **P3 (US3)** — bugs **pequenos** achados no caminho são corrigidos (decisão do usuário: "corrigir os pequenos junto") **por sub-agentes, um por bug** (decisão do usuário), com teste de regressão primeiro e registro separado. Pode ficar vazia.
- Sem meta de linhas (decisão do usuário): o pronto é por **lista de responsabilidades** (SC-003).

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..FR-010, SC-001..SC-005, Clarifications (as escolhas do usuário).
2. `plan.md` — D-001..D-008, R-001..R-005, comandos de integridade e o comando SC-002 (diff de testes só com import/mock).
3. `logic/divisao.md` — **as regras de movimentação (§1)**, o mapa do player (§2) e da Live (§3), e o procedimento de bug por sub-agente (§4).
4. `tasks.md` — 5 fases, T001..T026.
5. `quickstart.md` — checagens, conferência estrutural, roteiro no navegador e na TV.
6. `.planning/memory/constitution.md` — foco sem becos, voltar restaura foco, caminho completo por controle.

## Testes de contrato

- **Nenhum novo, por decisão** (`plan.md` → Estratégia de Testes): a prova são 8 arquivos travados de outras features que montam os componentes — **nunca editar**:
  - Player: `PlayerLayer.ciclo-vida-player` (020), `.player-chrome` (027), `.audio-legendas-info` (029), `.epg-guia-completo` (031).
  - Live: `LiveScreen.busca-categoria` (018), `.live-tv-ds-v14` (024), `.epg-dados-agora` (030), `.epg-guia-completo` (031).
  - A 026 (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) importa `PlayerLayer` para mocká-lo — o caminho e o nome têm de continuar.
- Integridade (raiz): `foreach ($s in '018-busca-por-categoria','020-ciclo-vida-player','024-live-tv-ds-v14','026-home-busca-configuracoes-ds-v14','027-player-chrome-ds-v14','029-audio-legendas-info-player','030-epg-dados-agora','031-epg-guia-completo') { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $s }`

## Stubs criados

- Nenhum. Nada de código foi tocado pelo plano.

## Armadilhas já mapeadas

- **Refs do chrome/painel**: `chromeMediaRef`/`chromeLevelRef`/`focusedIndexRef`/`seekBarFocusedRef`/`panelRef` são refs **de propósito** (corrida achada na 027: tecla entre criar a sessão e o commit). Passe o **objeto** ref aos módulos; nunca copie `.current`, nunca troque por `useState`.
- **Ordem dos efeitos do player**: `prefetchGate.acquirePlayback` → sessão → plano de hardware (`video-plane-visible`) → reagendar ao mudar de estado → proteção de tela → intervalo de 1 s do painel → `useRemoteNav`. Mantenha.
- **Um `useRemoteNav` por componente**, o do player com `{ modal: true }`.
- **`renderColumns`/`withShell` continuam funções** — componente novo remonta subárvore e perde foco/scroll (R-003).
- **Mocks das travas** são de `catalogApi` e `userStateRepository` (por identidade de módulo): módulos novos importam desses mesmos módulos e recebem o mock.
- **Flakes conhecidos** sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx` — falha nova roda isolada 3× antes de virar veredito (R-002). Os 5 contratos vermelhos da **034** (não executada) são esperados na suíte inteira.
- **E2E**: `npm run dev` recém-iniciado antes do `test:e2e`; os scripts caem no Chromium do Playwright quando `/opt/pw-browsers/chromium` não existe (Windows ok).
- **Sub-agentes** (§4): só depois de a fase do módulo fechar; o principal não edita o mesmo arquivo em paralelo (R-004).

## Pendências do Analyze

- A1 (LOW) — FR-010 (consumidores e `App.tsx` não mudam) não tem checagem explícita. Recomendação: no T024, `git diff --stat -- tv-web/src/App.tsx tv-web/src/features/movies/MovieDetailScreen.tsx tv-web/src/features/series/SeriesDetailScreen.tsx tv-web/src/features/home/HomeScreen.tsx` vazio.
- A2 (LOW) — SC-004 compara a contagem de ✓ do `test:e2e`; um roteiro com contagem variável faria falso alarme. Recomendação: no `baseline.md`, registrar por roteiro.

## Gate de pronto

- As 8 travas (e todas as do repositório) íntegras e verdes **sem edição**; comando SC-002 com saída vazia.
- Em `tv-web/`: `npx vitest run`, `npx tsc -b --noEmit`, `npx oxlint`, `npm run build:tizen`, `npm run test:e2e` — todos iguais ao `baseline.md`.
- Conferência estrutural do `quickstart.md` (SC-003) e roteiro no navegador.
- Docs no Polish: `CLAUDE.md` e item 49a do backlog.
- TV física: **recomendada, não gate** (R-001).
