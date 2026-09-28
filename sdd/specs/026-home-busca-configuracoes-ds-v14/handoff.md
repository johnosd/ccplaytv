# Handoff — execução da feature `026-home-busca-configuracoes-ds-v14`

Escrito pelo `sdd-plan` em 2026-09-27. Em conflito com `tasks.md`/`plan.md`,
estes prevalecem.

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. App Tizen:
  React 19 + TypeScript + Vite em `tv-web/`, client-first (IndexedDB/Dexie).
  Documentação em português; ler `CLAUDE.md` da raiz.
- Próximo comando: **`/sdd-execute 026-home-busca-configuracoes-ds-v14`**
  (pausa ao fim de cada fase; "modo contínuo" desliga).
- Backlog: Planejada, 0/50 tasks.
- `spec.md` e `.planning/backlog.md` foram editados em disco fora da sessão
  de planejamento — reler antes de começar.

## O que a feature entrega (Onda 5 da migração DS V14)

1. **US1 (P1) — Home definitiva**: hero (1º de "Continuar assistindo" → 1º
   favorito filme/série → boas-vindas); "Continuar" retoma direto por cima
   do Início (sem autoplay); rails Continuar assistindo, Minha Lista ("Filmes
   (N)"/"Séries (N)") e Canais favoritos ("Ver todos (N)"); mocks Curadoria
   IA e dock. Remove `ListHomeScreen`.
2. **US2 (P1) — Configurações**: 6 abas; reais Fontes IPTV (inicial —
   editar/ressincronizar/excluir com confirmação/adicionar, EPG mock, lista
   ativa, Modo limitado, **zero credencial em tela**), Acessibilidade
   ("Reduzir movimento") e Sobre (versão + licenças OFL). A tela de perfis
   **mantém** as ações por cartão (decisão do usuário) e ganha "Gerenciar
   listas" (Configurações sem topbar).
3. **US3 (P2) — Busca global**: lupa real em todas as topbars; só o já lido
   da lista ativa, mínimo 2 caracteres, rails por tipo, aviso "Busca em X de
   Y categorias"; canal abre a Live tocando.

## Leitura obrigatória, em ordem

1. `spec.md` — 49 FRs, 7 SCs; decisões em `## Clarifications`.
2. `plan.md` — decisões D-001..D-013, riscos R-001..R-008.
3. `tasks.md` — T001..T040 em 6 fases.
4. `logic/hero-home.md`, `logic/foco-home.md`, `logic/busca-global.md`,
   `logic/foco-configuracoes.md`, `logic/navegacao.md` — o "como" detalhado.
5. `quickstart.md` — roteiro manual.
6. `.planning/memory/constitution.md` — 13 princípios (gate).

## Testes de contrato (travados — fazer passar, nunca editar)

- `tv-web/src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts` (2, Fase 2)
- `tv-web/src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts` (1, Fase 2)
- `tv-web/src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1, Fase 3)
- `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1, Fase 4)

Em `tv-web/`:

```powershell
npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx
```

Na raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14`
— e o mesmo para **023, 024 e 025**, que esta feature não pode quebrar.

## Stubs criados

- `tv-web/src/lib/catalog/homeHero.ts` — `loadHomeHero` + tipos `HomeHero`/`HeroPrimary`.
- `tv-web/src/lib/catalog/globalSearch.ts` — `GLOBAL_SEARCH_MIN_CHARS = 2`, `loadGlobalSearchIndex`, `searchGlobal`.
- `tv-web/src/features/settings/SettingsScreen.tsx` — props, `SettingsFocus`, `SettingsShellProps`, `SettingsTab`.
- `tv-web/src/features/catalog/catalogApi.ts` — `useHomeHero` + `HomeHeroOut`.
- `tv-web/src/features/home/HomeScreen.tsx` — props novas opcionais
  (`onOpenItem`, `onOpenChannel`, `onOpenFavorites`, `onOpenSearch`,
  `onOpenSettings`); `onOpenContinueWatching` ficou opcional só até o T015
  removê-la.

## Armadilhas já mapeadas

- **Travas de 023/024/025 restringem tipos**: `HomeFocus` mantém as
  variantes `topbar` e `shortcuts`; campos novos em `LiveShellProps`/
  `VodShellProps` são **opcionais** (o `tsc -b` compila os testes e os
  contratos montam esses objetos com 4 campos); `ProfilesScreen` mantém
  Ressincronizar/Editar/Excluir por cartão.
- **Ação nova `go-home` no `appNav`**: "Início" da topbar de Live/Filmes/
  Séries/Busca/Configurações deixa de ser `back` (a Live pode ser aberta pela
  Busca). Não mexer em `back`/`open`/`switch-top`.
- Ao empilhar a Live como origem, gravar `{ name: 'live', topbarFocus }`
  **sem** `initialChannel` — senão voltar toca o canal de novo.
- **Hero e busca nunca tocam rede**: nada de `ensureSeriesEpisodes`,
  `ensureCategory`, `storedEntries`. Série favorita sem episódio gravado →
  abre o detalhe.
- `SEARCH_MIN_CHARS = 3` e `searchIndex()` da 017/018 ficam intocados.
- **Plano de hardware**: raiz do Início `.screen.home-screen` com `AppShell`
  e `PlayerLayer` como filhos diretos — a regra
  `:root.video-plane-visible .screen > *:not(.player-overlay)` esconde a
  moldura.
- `Rail` (022) exige `itemWidth` **e** `itemHeight` (sem altura, colapsa).
- `comingSoon.ts`: tirar `search-global` e `settings`; registrar os mocks do T002.
- `DeleteSourceModal`, `sourceFormat.ts` e `LimitedModeNotice` vão para
  `features/sources/`; perfis e Configurações usam os mesmos.
- Versão do app: ler `version` de `CCPlayTv/config.xml` no `vite.config.ts`
  → `__APP_VERSION__`. `src/vite-env.d.ts` **não existe** — criar.
- Sem nova dependência npm, sem migração Dexie, sem arquivo novo emitido
  pelo build.
- **E2E**: todos os roteiros que entravam pelos atalhos `.tile` do Início
  passam a entrar pela topbar (T036); novo `e2e/home-busca-configuracoes.mjs`
  entra no `test:e2e`. Scripts usam o caminho Linux do Chromium (override
  temporário no Windows); reiniciar o dev server antes.
- Flakes conhecidos: `*.favorites.test.tsx` sob a suíte completa em paralelo
  (passam isolados).

## Pendências do Analyze

- **A1 (MEDIUM)**: SC-005 (busca fluida com 5.000 itens) sem task de
  medição — sugerido um teste unitário de `searchGlobal` com 5.000 registros
  no T040.
- **A2 (MEDIUM)**: "RETURN com o teclado aberto só fecha o teclado" só tem
  teste unitário; o IME real só se prova na TV (item manual do quickstart).
- **A3 (LOW)**: voltar da Busca/Configurações para a Live não restaura
  categoria/canal — limitação aceita (R-004).

## Gate de pronto

- 5/5 contratos verdes; travas 023/024/025/026 íntegras.
- `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build:tizen`,
  `npm run test:e2e` verdes.
- `quickstart.md` executado no navegador.
- Docs atualizados no Polish: `CLAUDE.md`, `.planning/migracao-design-system-v14.md`, backlog.
- Passada na TV física recomendada, não gate.
