# Handoff — feature 083 Foco leve na TV (re-plano de 2026-10-19)

## Contexto

Repositório `ccplayTv`, branch `feature/licenca`; frontend React 19/TypeScript/Vite em `tv-web/`, foco por estado React +
classe `.tv-focus` (`useRemoteNav`, ADR-009). Próximo comando: `/sdd-execute 083-foco-leve-tv`. Backlog: `Planejada`,
0/37. O plano de 2026-10-18 foi **substituído** (nenhuma task dele tinha sido executada): spec revisada, `plan.md`,
`tasks.md`, `research.md`, `logic/foco-leve.md` e `quickstart.md` reescritos, contrato novo travado.
A árvore tem **muito trabalho da 082 não commitado** (inclusive `tv-web/src/components/PerfOverlay.tsx` e
`src/lib/perf/entryTiming.ts`): não misturar diffs (R-006).

## O que a feature entrega

- **P1**: o foco para de animar a sombra (causa dos 38 fps / 133 ms na sonda 2); contorno, halo, brilho e escala
  continuam os mesmos tokens. A composição exata é **escolhida por medição na TV** (C1 → C2 → C3, `research.md`), não
  decidida de antemão. Gate: sonda com ≥ 50 fps e 0 quadros > 50 ms, foco **sem rolagem**.
- **P2**: a mesma receita em **todo** elemento focável (regra global + cópias locais em `vod.css` e `onboarding.css`),
  SELECT/RETURN intactos.
- Decisões do usuário (2026-10-19): nada do backlog entra (capas/Worker/ordenação ficam fora); receita global, não só
  cards; rolagem e app real são **registro**, não gate; gate = sonda.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo revisado, FR-001..007, SC-001..006, clarificações de 2026-10-19.
2. `plan.md` — D-001..D-006, Constitution Check, R-001..R-007.
3. `tasks.md` — 6 fases; Fase 2 escolhe a receita na TV antes de mexer no app.
4. `research.md` — por que C1 vem antes do pseudo-elemento (corte por `overflow: hidden`, `::before` já usado).
5. `logic/foco-leve.md` — invariantes, papéis das medições, pseudocódigo do teste `foco083` da sonda.
6. `quickstart.md` — comandos, instalação da sonda, roteiro na TV.
7. `evidencias/inventario-tv-focus.md` — consumidores e onde a sombra é animada hoje.
8. `.planning/memory/constitution.md` (v1.15.0) — "Foco Visível e Sem Becos Sem Saída".

## Testes de contrato

- `tv-web/src/styles/foco-leve-tv.contract.test.ts` — 1 teste, Fase 3 (T008/T009 o deixam verde).
- Rodar (de `tv-web/`): `npx vitest run src/styles/foco-leve-tv.contract.test.ts`. Vermelho hoje com
  `index.css:258` e `styles/vod.css:1574`.
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 083-foco-leve-tv`.
- Travas de outras features que a mudança de CSS pode tocar: `tv-web/src/styles/escala.legibilidade-tv.contract.test.ts`
  (068) — não mexer em tokens `--fs-*`.

## Stubs criados

Nenhum. O ponto de partida é `tv-web/src/index.css` (regras em ~linha 245–267).

## Armadilhas já mapeadas

- O contrato proíbe animar `box-shadow` em **qualquer** CSS de `tv-web/src/` (inclusive `transition: all` e
  `@keyframes`) e qualquer `backdrop-filter` — é intencional (D-002).
- `.poster-box` tem `overflow: hidden`: um `::after` com brilho para fora é cortado (R-001). A grade da vitrine já usa
  `.poster-box.tv-focus::before` para o anel interno.
- A sonda 2 **não** usou a receita do app (`f-full` = `0 0 32px 8px` + sombra `0 12px 40px`, offset 6 px). Não altere
  `f-full`; acrescente `f-app` com os tokens reais para comparar na mesma sessão.
- `instalar-sonda.ps1` tem padrão `-App app` (sonda 1): passe `-App app2 -AppId ccpSondaV2.Capacidades -Only foco083`.
  O coletor grava em `082-.../evidencias/`; copie só os números para `083-.../evidencias/` (R-007).
- `main.js` da sonda já roda `T[nome]` com `-Only`: basta exportar `foco083` em `tests.js`.
- Perguntar ao usuário antes de **cada** instalação na TV (memória do projeto); desinstalar a sonda ao terminar; nunca
  desinstalar o CCPlayTV.
- Se só C4 (sem brilho difuso) ou nenhuma candidata atingir a meta: parar e perguntar (D-003, R-005). C4 exige emenda
  da spec (FR-002).
- E2E pode sobrescrever capturas rastreadas em `tv-web/test-results/`; restaurar antes do Polish.

## Pendências do Analyze

- A-01 LOW — Edge case "grade com poucos cards" não tem passo explícito; incluir na inspeção da T021.
- A-02 LOW — O contrato vale para todo CSS, não só foco: uma animação futura de sombra fora do foco também reprova.
  Aceito como regra de projeto (D-002); se aparecer caso legítimo, decidir com o usuário.

## Gate de pronto

Contrato 1/1 verde e trava íntegra; `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build`,
`npm run test:e2e` (dev server no ar, antes da TV); sonda na TV com a receita final ≥ 50 fps e 0 quadros > 50 ms
(**gate obrigatório**, navegador não vale); app real e rolagem registrados; inspeção visual na TV; emendas da ADR-007 §4
e da V14 §11.1; pacote normal reinstalado. Sem o gate físico, a feature não é convergida.
