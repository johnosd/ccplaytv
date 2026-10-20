---
description: "Tasks da feature Foco leve na TV"
---

# Tasks: Foco leve na TV

**Input**: Documentos de design de `sdd/specs/083-foco-leve-tv/` (re-plano de 2026-10-19)

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `logic/foco-leve.md`, `quickstart.md`, `contract-tests.lock`

## Path Conventions

- Frontend: `tv-web/src/` (receita global em `tv-web/src/index.css`, folhas de tela em `tv-web/src/styles/`)
- Testes: ao lado do sujeito, `*.test.ts` (Vitest `node`) e `*.test.tsx` (Vitest `dom`)
- Contrato travado: `tv-web/src/styles/foco-leve-tv.contract.test.ts`
- E2E: `tv-web/e2e/` (runner `tv-web/e2e/run.mjs`)
- Sonda de medição (fora do app e do pacote): `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2/`
- Evidências da feature: `sdd/specs/083-foco-leve-tv/evidencias/`
- Docs a emendar: `sdd/adr/ADR-007-design-system-tv-identidade-visual.md` §4,
  `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` §11.1

## Phase 1: Setup — linha de base

**Objetivo**: Registrar o estado automatizado e o inventário antes de qualquer mudança.

### Implementation

- [X] T001 [P] Revisar `sdd/specs/083-foco-leve-tv/evidencias/inventario-tv-focus.md` (já gravado no re-plano) contra o código atual; atualizar números e linhas se o trabalho da 082 ou outro commit mudou alguma regra de foco.
- [X] T002 [P] Rodar `npm run lint`, `npx tsc -b`, `npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx` em `tv-web/` e gravar a saída em `evidencias/baseline-automatizada.txt` (o contrato deve aparecer vermelho com as duas linhas acima).

### Testes da Fase

- (nenhum adicional)

**Critério de Conclusão**: inventário e linha de base gravados; o único vermelho é o contrato da 083.

**Registro da Fase**:

- Status: concluída em 2026-10-19.
- Feito: T001 — inventário conferido contra o código atual (214 arquivos com `tv-focus`; nenhum `backdrop-filter`; só
  `index.css:258` e `styles/vod.css:1574` animam `box-shadow`), números inalterados; T002 — linha de base gravada em
  `evidencias/baseline-automatizada.txt`.
- Contrato: N/A nesta fase; vermelho como esperado (`index.css:258`, `styles/vod.css:1574`); trava íntegra (1 teste).
- Testes executados: `npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx`
  → 103 verdes, 1 vermelho (o contrato); `npm run lint` → exit 0 (só avisos antigos); `npx tsc -b` → exit 0.
- Pendências: nenhuma.

---

## Phase 2: Foundational — escolher a receita na TV (US1)

**Objetivo**: Medir na TV, na mesma sessão, a linha de base e as candidatas C1–C4 e escolher a receita (D-003).

### Implementation

- [X] T003 [US1] Em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/app2/index.html`, adicionar as classes `f-app` (receita exata do app: `outline 4px #ff7a3d`, `outline-offset 3px`, `box-shadow 0 0 0 8px rgba(255,122,61,.22), 0 0 40px rgba(255,122,61,.55)`, `scale(1.06)`, `transition: transform 140ms ease-out, box-shadow 140ms ease-out`) e `f-c1`…`f-c4` conforme `research.md`, sem alterar `.card`, `f-scale` nem `f-full` (comparabilidade com a 082). C2/C3 precisam de `.card` sem `overflow: hidden` e `::after` com `pointer-events: none`.
- [X] T004 [US1] Em `sonda-tv/app2/tests.js`, adicionar `foco083` (pseudocódigo em `logic/foco-leve.md`) reaproveitando a montagem da grade do teste `render` e `P.frames`; incluir na tabela devolvida (`return { ..., foco083: foco083 }`) — `main.js` já roda `T[nome]` com `-Only`. Logar uma linha por classe: `fps | pior | >50ms`, e as duas rodadas com rolagem (`f-app`, `f-c1`).
- [X] T005 [US1] Ensaiar no PC (Chromium, origem única, como no README da sonda) e gravar em `sdd/specs/083-foco-leve-tv/evidencias/sonda-ensaio-pc.md`, marcado como **diagnóstico** (não aprova nada).
- [X] T006 [US1] **Pedir autorização ao usuário**; instalar a sonda com `instalar-sonda.ps1 -App app2 -AppId ccpSondaV2.Capacidades -Only foco083`, coletar com `coletor.mjs`, desinstalar a sonda e gravar só os números em `evidencias/sonda-candidatas-tv-AAAA-MM-DD.md` (origem: jsonl da pasta `082-.../evidencias/`, R-007).
- [X] T007 [US1] **ADIADA para a Fase 5 (depois da T019); enquanto isso, `R-008` registra a C1 como receita PROVISÓRIA (primeira na ordem do D-003).** Escolher a receita pela ordem C1 → C2 → C3 (primeira com ≥ 50 fps e 0 quadros > 50 ms); registrar como `R-008` em `plan.md` → `## Riscos e Decisões`, com os números. Se só C4 (ou nenhuma) atingir, **parar e perguntar ao usuário** (R-005, D-003) antes da Fase 3.

### Testes da Fase

- (nenhum adicional — medição é a saída da fase)

**Critério de Conclusão**: números da TV por candidata gravados; receita escolhida registrada em `R-008` (ou decisão do usuário registrada, se C4/nenhuma).

**Registro da Fase**:

- Status: concluída em 2026-10-19 — T003–T005 no PC; T006/T007 executadas na Fase 5 (pedido do usuário: testes na TV por último).
- Feito: classes `f-app`, `f-c1`..`f-c4` (com modo `m-<classe>` na grade, para a saída do foco também usar a transição da
  candidata) em `sonda-tv/app2/index.html`; teste `foco083` em `app2/tests.js` (exportado na tabela de retorno); ensaio no PC em
  `evidencias/sonda-ensaio-pc.md` (60 fps em todas, diagnóstico). Defeito de especificidade das regras de C2/C3 achado e corrigido
  no ensaio. `R-008` registra a C1 como receita provisória.
- Contrato: N/A nesta fase.
- Testes executados: ensaio no Chromium via script do scratchpad (sem arquivo no repositório); `.card`, `f-scale` e `f-full`
  não foram alterados.
- Pendências: nenhuma (T006/T007 feitas na Fase 5; C1 confirmada).

---

## Phase 3: User Story 1 — foco leve no app (Priority: P1) 🎯 MVP

**Objetivo**: Aplicar a receita escolhida à regra global e às cópias locais, sem animar sombra.

### Contrato da Fase

- `nenhuma folha de estilo do app anima box-shadow nem usa backdrop-filter` — `npx vitest run src/styles/foco-leve-tv.contract.test.ts` (de `tv-web/`).

### Implementation

- [X] T008 [US1] Em `tv-web/src/index.css`, aplicar a receita de `R-008` (provisória C1 até a TV confirmar) à regra `button:focus, input:focus, [tabindex]:focus, .tv-focus` e à transição de `button, .tv-focusable` (tirar `box-shadow` da lista), mantendo tokens, `.no-scale` e o bloco de movimento reduzido → contrato: `nenhuma folha de estilo do app anima box-shadow nem usa backdrop-filter`.
- [X] T009 [US1] Em `tv-web/src/styles/vod.css`, tirar `box-shadow` da transição de `.vod-detail-icon` e alinhar `.vod-detail-icon-action.tv-focus .vod-detail-icon` à receita de `R-008` → contrato: idem.
- [X] T010 [P] [US1] Conferir `tv-web/src/styles/onboarding.css` (`.source-setup .text-field:focus-within`), o anel interno da vitrine (`vod.css` `.vod-grid-cell .poster-box.tv-focus::before`) e o pôster da Rádio (`radio.css`): mantêm a geometria (logic, invariantes 4–5); ajustar só se a receita escolhida exigir.
- [X] T011 [US1] (N/A com a C1 provisória; reabre só se a TV pedir C2/C3) Só se `R-008` for C2/C3: desenhar a camada por família de consumidor (onde não há `overflow: hidden` e `::before/::after` livres), conforme invariante 7 de `logic/foco-leve.md`, registrando cada exceção em `evidencias/matriz-superficies.md`.

### Testes da Fase

- [X] T012 [P] [US1] Rodar `npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx` e as suites de componentes tocados.
- [X] T013 [P] [US1] Rodar `npm run lint`, `npx tsc -b`, `npm run build`.
- [X] T014 [US1] Com `npm run dev`, capturar no navegador a grade da vitrine de Filmes e uma fileira da tela de Filmes com foco (primeiro/último card, troca rápida, movimento reduzido) em `evidencias/navegador-*.png`, classificadas como diagnóstico.

**Critério de Conclusão**: `npx vitest run src/styles/foco-leve-tv.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1 -Slug 083-foco-leve-tv` íntegro; suites focadas, lint, `tsc` e build verdes.

**Registro da Fase**:

- Status: concluída em 2026-10-19 com a receita **C1 provisória** (R-008); a TV confirma ou refaz na Fase 5.
- Feito: T008 — `index.css`: a transição de `button, .tv-focusable` perdeu `box-shadow` (fica `transform` + `background`), com comentário
  apontando o contrato; tokens, `.no-scale` e movimento reduzido intactos. T009 — `vod.css`: `.vod-detail-icon` perdeu a transição de
  sombra; a cópia local `.vod-detail-icon-action.tv-focus .vod-detail-icon` já usa os mesmos tokens, sem mudança. T010 — `onboarding.css`
  (`.text-field:focus-within`, só halo), anel interno da vitrine e `radio.css` conferidos: nenhum anima sombra, geometria mantida. Nenhum
  `box-shadow`/`backdrop-filter` em `.ts`/`.tsx` fora de testes. T011 N/A (C1). T014 — capturas de diagnóstico da fileira da tela de
  Filmes (`evidencias/navegador-filmes-*.png`): foco com contorno + halo + brilho; com movimento reduzido o estado final é o mesmo e a
  duração vai a ~0. A grade da vitrine (`vod-grid`) fica para a matriz da Fase 4.
- Contrato: `npx vitest run src/styles/foco-leve-tv.contract.test.ts` → 1/1 verde; trava íntegra.
- Testes executados: `npx vitest run src/styles src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx` → 104/104;
  `npm run lint` → ok (avisos antigos); `npx tsc -b` → exit 0; `npm run build` → ok.
- Pendências: confirmação na TV (Fase 5).

---

## Phase 4: User Story 2 — mesmo foco em todas as áreas (Priority: P2)

**Objetivo**: Confirmar a receita única em cada família de superfície e preparar a medição do app real.

### Implementation

- [X] T015 [P] [US2] Auditar no navegador as famílias: grades de cards (Início, fileiras e vitrine de Filmes/Séries, Favoritos, Histórico, Busca, Rádio), linhas de lista (Live, guia, Ajustes), botões/chips, campos de formulário (onboarding, PIN), controles e painéis do player; registrar em `evidencias/matriz-superficies.md` (família → resultado → exceção, se houver).
- [X] T016 [US2] Depois do commit da 082 (R-006), estender `tv-web/src/components/PerfOverlay.tsx` (só build `VITE_CCPLAY_PERF=1`, D-006) com fps, pior quadro e quadros > 50 ms medidos enquanto há tecla nos últimos 2 s; só números, não focável.

### Testes da Fase

- [X] T017 [P] [US2] Teste complementar do cálculo de quadros do T016 (função pura, se extraída para `tv-web/src/lib/perf/`), sem tocar o contrato.
- [X] T018 [US2] Rodar `npm run test` e, com `npm run dev` no ar, `npm run test:e2e` (se sobrescrever capturas rastreadas em `tv-web/test-results/`, restaurar).

**Critério de Conclusão**: matriz de superfícies sem efeito preso ou contorno ausente (SC-003 no navegador); `npm run test` e `npm run test:e2e` verdes (SC-004).

**Registro da Fase**:

- Status: concluída em 2026-10-19 (receita C1 provisória).
- Feito: T015 — rastreador temporário (apagado) percorreu 11 telas com o painel fictício: 64 elementos em foco, 0 sem contorno,
  0 com sombra em transição, nunca mais de um foco; matriz em `evidencias/matriz-superficies.md` (campos de texto, player, linhas do
  Live/guia, vitrine em grade e PIN não foram alcançados pelo rastreador: cobertos pelo CSS com os mesmos tokens e pelos E2E).
  T016 — `lib/perf/activeFrames.ts` (função pura: fps, pior quadro e quadros > 50 ms só com tecla nos últimos 2 s, janela de 4 s) e
  uma linha `tecla: Nfps pior=Xms >50ms=Y` no `PerfOverlay` (só build `VITE_CCPLAY_PERF=1`, só números, não focável); edição mínima em
  `PerfOverlay.tsx`, que já tinha mudanças não commitadas da 082 (R-006). T017 — `lib/perf/activeFrames.test.ts` (5 testes).
- Contrato: 1/1 verde; trava íntegra.
- Testes executados: `npx vitest run src/components src/lib/perf` → 441/441; `npm run test` → 658 arquivos, 3607/3607;
  `npm run test:e2e` (dev server no ar) → 54/54 em 231 s; `npx tsc -b` e `npm run lint` ok.
- Pendências: o E2E reescreve capturas rastreadas de `tv-web/test-results/` (já estavam modificadas pela 082): não restaurei,
  para não descartar o que a 082 mudou — decidir no commit. `PerfOverlay.tsx` e `lib/perf/` seguem misturados com a 082
  até esse commit. Rastreador não cobriu campos, player, Live/guia e vitrine em grade (ver matriz).

---

## Phase 5: Gate físico (US1 + US2)

**Objetivo**: Provar SC-001/SC-002 na TV e registrar SC-005/SC-006, numa sessão única.

### Implementation

- [X] T019 [US1] **Pedir autorização**; rodar a sonda `foco083` (esta é também a rodada da T006: `f-full`, `f-app` e C1–C4 na mesma sessão; se C1 não passar, T007 escolhe a próxima e a Fase 3 é refeita), com a classe da receita final idêntica ao app (ajustar `f-c*` se T008 mudou algum valor), na mesma sessão que `f-full` e `f-app`; desinstalar a sonda; gravar em `evidencias/sonda-gate-tv-AAAA-MM-DD.md` (SC-001, SC-002, rolagem para SC-006).
- [X] T020 [US1] **Pedir autorização**; instalar o build de medição do app (`tizen-tv`, sem apagar dados), navegar na grade da vitrine de Filmes e numa fileira da tela de Filmes e registrar fps/pior quadro/> 50 ms do `PerfOverlay` (SC-006). Se o usuário quiser, a medição pendente da 082 ("Velocidade da 082 na TV física") usa esta mesma instalação, com evidência separada.
- [X] T021 [US2] Na mesma sessão: inspeção visual a ~3 m com capas claras, escuras e saturadas (SC-005), troca rápida de foco, movimento reduzido, primeiro/último card, SELECT/RETURN em uma superfície de cada família (SC-003, SC-004); gravar em `evidencias/inspecao-tv-AAAA-MM-DD.md`.
- [X] T022 Reinstalar o pacote normal (avisando) e confirmar que o app abre com os dados preservados.

### Testes da Fase

- (medição física é a saída da fase)

**Critério de Conclusão**: sonda com ≥ 50 fps e 0 quadros > 50 ms para a receita final; inspeção sem efeito preso; app real e rolagem registrados. Se reprovar, registrar números e risco, sem declarar a feature convergida.

**Registro da Fase**:

- Status: concluída em 2026-10-19 (sessão única na TV, autorizada pelo usuário).
- Feito: T019/T006/T007 — sonda `foco083`, duas rodadas na mesma sessão (a 2ª com reinstalação): **C1 = 51 fps, pior quadro 50/33 ms,
  0 quadros > 50 ms nas duas**; receita antiga do app 44–46 fps; linha de base da 082 35–37 fps; C2/C3/C4 47–50 fps com quadros de
  117–150 ms; rolagem (registro) `f-app` 31–32 fps com 14 quadros lentos contra `f-c1` 50/48 fps. Escolha: C1 (R-008). Sonda
  desinstalada, coletor parado, `applist` só com o CCPlayTV (`evidencias/sonda-candidatas-tv-2026-10-19.md`). T020 — build de
  medição instalado sem apagar dados; o usuário operou a lista real; uma foto do painel com o controle parado (sem `tecla:`).
  T021 — inspeção a ~3 m: o usuário informou "tudo certo, o foco se comporta bem em todos os casos" do roteiro (claras/escuras/
  saturadas, primeiro/último card, troca rápida, movimento reduzido, poucos cards — A-01, SELECT/RETURN por família). T022 — pacote
  normal (sem `PerfOverlay`) reinstalado por `deploy-tv.ps1 -SkipBuild`, sem desinstalar, e lançado (`applist` ok)
  (`evidencias/inspecao-tv-2026-10-19.md`).
- Contrato: 1/1 verde; trava íntegra.
- Testes executados: sonda na TV (gate, SC-001/SC-002 atendidos); inspeção visual do usuário (SC-003/SC-004/SC-005).
- Pendências: **SC-006 sem fps de navegação no app real** (a foto foi tirada parada: `tecla: sem tecla`; só contadores acumulados
  76 quadros > 100 ms / 7 parado) — é registro, não gate; pode ser refeito quando houver oportunidade. A abertura do pacote normal
  com os dados preservados não foi confirmada por escrito pelo usuário (instalação e lançamento sim).

---

## Phase 6: Polish

### Implementation

- [X] T023 [P] Emenda inline datada na ADR-007 §4 (`**Atualização (083):**` — sombra não é mais animada; receita escolhida e números da TV), sem reescrever o texto original.
- [X] T024 [P] Nota datada na V14 Spec §11.1 (`docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md`) apontando a emenda da ADR-007 (a transição de `box-shadow` do bloco canônico deixa de valer).
- [X] T025 [P] Atualizar `quickstart.md` e `plan.md` (Estado Atual, links das evidências).
- [X] T026 Revisar o diff e as evidências: nenhum IP de TV além da LAN já usada, credencial, URL de provedor ou nome de item.

### Testes da Fase

- [X] T027 Rodar `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build` e `npm run test:e2e` em `tv-web/`; `check-contract-tests.ps1 -Slug 083-foco-leve-tv`.

**Critério de Conclusão**: docs emendados, gates verdes, contrato íntegro.

**Registro da Fase**:

- Status: concluída em 2026-10-19.
- Feito: T023 — `ADR-007` §4 com `**Atualização (083):**` (transição de `box-shadow` não vale mais; números da TV; contrato), §8 e
  "Caminho de Migração" ajustados sem reescrever o texto original; T024 — nota datada na V14 Spec §11.1 apontando para a ADR; T025 —
  `plan.md` (Estado Atual, links) e `quickstart.md` atualizados; T026 — revisão das evidências, da skill e do diff da sonda: nenhum IP
  de TV, URL de provedor, credencial ou nome de item (só o loopback `127.0.0.1` do ensaio).
- Contrato: `npx vitest run src/styles/foco-leve-tv.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1` íntegro.
- Testes executados: `npm run test` 658 arquivos / 3607 testes e `npm run test:e2e` 54/54 (Fase 4, depois da última mudança em
  `tv-web/src`; nenhum arquivo de `src` mudou desde então); reconfirmados nesta fase: `src/styles`, `src/lib/perf`, foco/pôster
  114/114, `npm run lint` ok, `npx tsc -b` exit 0, `npm run build` ok.
- Pendências: capturas de `tv-web/test-results/` e `PerfOverlay.tsx`/`lib/perf/` misturados com a 082 no working tree (commit
  separado depois do da 082, R-006); a skill `tizen-sonda` e o `CLAUDE.md` foram alterados a pedido do usuário, fora do escopo da
  feature.

### Checklist de Release

- [X] Fase 1 (linha de base) concluída
- [X] Fase 2 (receita escolhida na TV, `R-008`) concluída — T003–T005 na Fase 2; T006/T007 na Fase 5 (desvio R-008)
- [X] Fase 3 (US1) concluída (receita C1 provisória)
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (gate físico): ≥ 50 fps e 0 quadros > 50 ms na sonda
- [X] Teste de contrato verde e `check-contract-tests.ps1` íntegro
- [X] Lint, `tsc`, Vitest, build e E2E verdes (E2E antes da TV) — Fase 4, 2026-10-19; reconfirmar no Polish
- [X] Emendas da ADR-007 e da V14 §11.1 registradas
- [X] Sonda desinstalada e pacote normal reinstalado
- [X] Revisão de segredos concluída

## Rastreabilidade

| Requisito | Tasks |
| --- | --- |
| FR-001 | T008, T015, T021 |
| FR-002 | T003, T007, T008, T009, contrato |
| FR-003 | T006, T008, T009, T019, contrato |
| FR-004 | T008–T011, T015 |
| FR-005 | T010, T015, T021 |
| FR-006 | T005, T006, T019, T020, T021 |
| FR-007 | T023, T024 |
| SC-001/SC-002 | T019 |
| SC-003 | T015, T021 |
| SC-004 | T012, T018, T021 |
| SC-005 | T007, T021 |
| SC-006 | T019, T020 |
