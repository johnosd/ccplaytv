# Tasks: Home, Filmes e Séries já montadas ao entrar

**Input**: Documentos de design de `sdd/specs/079-home-carregamento-progressivo/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `logic/montagem-de-tela.md`, `quickstart.md`, `contract-tests.lock`.

**Organization**: a Fase 1 constrói a regra comum (bloqueia as demais); Fase 2 = Home, Fase 3 = Filmes/Séries (US1–US3 em cada tela); Fase 4 = medição e TV (US4); Fase 5 = Polish.

## Path Conventions

- Frontend: `tv-web/src/`; comandos rodam em `tv-web/`.
- Regra comum: `tv-web/src/lib/assembly/`.
- Home: `tv-web/src/features/home/`.
- Filmes/Séries: `tv-web/src/features/vod/`.
- Leituras: `tv-web/src/features/catalog/catalogApi.ts` (não muda a fronteira).
- Medição: `tv-web/src/lib/perf/`.
- i18n: `tv-web/src/lib/i18n/messages/`.
- E2E: `tv-web/e2e/`.

## Phase 1: Regra comum de montagem (US1, US2, US3 — Priority: P1)

**Objetivo**: a regra pura e o hook decidem espera, revelação, teto, "Carregando" e adiamento para qualquer tela.

**Contrato da fase**: `screenAssembly.home-carregamento-progressivo.contract.test.ts` (2 testes) e `useScreenAssembly.home-carregamento-progressivo.contract.test.tsx` (1 teste). Comando: `npx vitest run src/lib/assembly`.

### Implementation

- [X] T001 [US1] Implementar `slotStatusOf` e `stepAssembly` em `tv-web/src/lib/assembly/screenAssembly.ts` seguindo `logic/montagem-de-tela.md` §1–§2. → contrato: "espera todas as leituras e as capas…", "com a leitura principal em cache…"
- [X] T002 [US2] Implementar `useScreenAssembly` em `tv-web/src/lib/assembly/useScreenAssembly.ts` (§3): decisão no render, temporizadores da montagem, pré-carga com `decode()`, `follow()`. → contrato: "\"Carregando\" só a partir de 300 ms…"
- [X] T003 [P] [US4] Criar `tv-web/src/lib/perf/assemblyTiming.ts` (padrão de `entryTiming.ts`) e chamá-lo do hook na revelação e a cada adiamento.

### Testes da Fase

- [X] T004 [P] Em `tv-web/src/lib/assembly/screenAssembly.test.ts`: `required` segura o teto; `failed` = `empty`; vários slots chegando no mesmo passo depois do teto (ordem crescente).
- [X] T005 [P] Em `tv-web/src/lib/perf/assemblyTiming.test.ts`: desligado por padrão; relatório sem URL/título.

**Critério de Conclusão**: `npx vitest run src/lib/assembly` → 3/3 contratos verdes, `check-contract-tests.ps1 -Slug 079-home-carregamento-progressivo` íntegro, testes da fase verdes, `npm run lint` ok.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: `stepAssembly`/`slotStatusOf` (regra pura, devolve o mesmo objeto quando nada muda); `useScreenAssembly` (passo no render guardado em ref, `firstRender` = antes do 1º commit — seguro no StrictMode, timers de 300 ms/2 s da montagem, pré-carga com `decode()` e conclusão imediata sem ele, `follow()` por 2 s); `assemblyTiming.ts` (revelação + adiadas, só números e chaves).
- Contrato: `npx vitest run src/lib/assembly` → 3/3 verdes (2 da regra, 1 do hook); trava íntegra.
- Testes executados: `npx vitest run src/lib/assembly src/lib/perf` → 12/12 verdes (1ª tentativa); `npm run lint` → exit 0, nenhum aviso nos arquivos novos (ratchet ok: 494 arquivos).
- Pendências: nenhuma. Fases 2 e 3 ainda não usam o hook.

---

## Phase 2: Home montada antes de aparecer (US1, US2, US3 — Priority: P1) 🎯 MVP

**Objetivo**: a Home espera hero + fileiras + capas da primeira tela e revela de uma vez; billboard neutro quando o hero passa do teto.

**Contrato da fase**: `HomeContent.home-carregamento-progressivo.contract.test.tsx` (1 teste). Comando: `npx vitest run src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx`.

### Implementation

- [X] T006 [US1] Criar `tv-web/src/features/home/useHomeAssembly.ts`: slots da Home (`logic/montagem-de-tela.md` §4), capas da primeira tela (§5), chamada a `useScreenAssembly({ screen: 'home', … })`. → contrato Home
- [X] T007 [US1] Em `HomeContent.tsx`: usar a montagem — durante a espera, raiz `.home-content` com nada (até 300 ms) ou `Spinner` + `EmptyState` (`common.loading`, Voltar focado); revelado, `rowKeys` só com slots mostrados; ↑ na espera chama `onExitUp`, RETURN/Voltar chamam `onBack`; sem crescer além de 637 linhas (R-001). → contrato Home
- [X] T008 [US1] Tirar `HOME_DEFERRED_MS` das leituras de "adicionados" em `HomeContent.tsx` (mantém para `useSeriesWatchedSummary`) e ajustar o comentário de `homeRowFormats.ts`/`useDeferred.ts` (D-010).
- [X] T009 [US2] Billboard neutro: em `HomeBillboard.tsx`/`HomeContent.tsx`, hero fora de `shown` → atalhos TV ao vivo/Filmes com o título `home.hero.neutralTitle` (nova chave pt/en/es em `tv-web/src/lib/i18n/messages/home.ts`), nunca o texto de boas-vindas (FR-011).
- [X] T010 [US3] `follow()`: chamar no toggle de "Minha Lista" do billboard e quando o `HomeScreen` fecha o player (nova prop numérica `userActionKey` em `HomeContentProps`, incrementada em `closePlayer` de `HomeScreen.tsx`) (FR-009).

### Testes da Fase

- [X] T011 [P] [US2] Em `HomeContent.test.tsx`: billboard neutro depois do teto; ↑ na espera; foco fica na topbar se a pessoa subiu durante a espera (US2/AC4–AC5).
- [X] T012 [US3] Em `HomeScreen.test.tsx`: fechar o player com "Continuar" antes vazio faz a fileira aparecer na hora (US3/AC5).
- [X] T013 Rodar sem editar os contratos `HomeScreen.home-busca-configuracoes-ds-v14` (026) e `HomeContent.home-vitrine-expandida` (060) e o resto da pasta: `npx vitest run src/features/home`.

**Critério de Conclusão**: `npx vitest run src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx` → 1/1 verde; contratos 026 e 060 verdes e intactos; `npx vitest run src/features/home` verde; `check-contract-tests.ps1` íntegro para 079, 026 e 060; `npm run lint` ok (ratchet).

**Registro da Fase**:

- Status: Concluída (2026-10-16), com uma instabilidade em aberto (ver Pendências).
- Feito: `useHomeAssembly.ts` (slots, capas da 1ª tela, `follow` por `userActionKey`); `homeContentModel.ts` (rail ids, `heroEntries`, `rowStyle` saíram de `HomeContent.tsx`, tipados pela forma para não importar `features/catalog`); `HomeContent.tsx` espera/revela, billboard neutro (`home.hero.neutralTitle` pt/en/es), "adicionados" sem adiamento, ↑/SELECT/RETURN na espera, `.home-loading` em `home.css`; `HomeScreen.tsx` incrementa `userActionKey` ao fechar o player. `HomeContent.tsx` 637 → 628 linhas (teto baixado com `--prune`).
- Contrato: `npx vitest run src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx` → 1/1 verde; trava 079 íntegra; travas 026 e 060 íntegras e verdes.
- Testes executados: `npx vitest run src/features/home` → 78/78 em 3 de 4 execuções; `HomeContent.montagem.test.tsx` (3 testes novos: ↑/SELECT na espera, billboard neutro que não troca, adiado + `userActionKey`). T012 foi coberto em `HomeContent.montagem.test.tsx` via a prop `userActionKey` (o `HomeScreen` só a incrementa), não em `HomeScreen.test.tsx`. O foco que fica na topbar durante a espera vem do estado `zone` do `HomeScreen` (inalterado). `npx tsc -b` limpo; `npm run lint` exit 0; 1ª versão de `homeContentModel.ts`/`useHomeAssembly.ts` foi barrada pela ratchet (feature→feature) e corrigida.
- Pendências: instabilidade — 1 de 4 execuções de `npx vitest run src/features/home` teve 9 falhas instantâneas (0–6 ms) em `HomeBillboard.test.tsx` e `HomeLiveCard.test.tsx` (não tocados; passam isolados e nas outras 3 execuções). Causa não identificada; reavaliar na suíte completa da Fase 5.

---

## Phase 3: Filmes e Séries com a mesma regra (US1, US2, US3 — Priority: P1)

**Objetivo**: a vitrine troca `rowsReady`/`ROWS_SETTLE_CAP_MS` (3 s) pela montagem comum: teto de 2 s, "Bem avaliados" e capas na espera, "Carregando" só após 300 ms, sem fileira entrando acima depois do teto.

**Contrato da fase**: `VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx` (1 teste). Comando: `npx vitest run src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx`.

### Implementation

- [X] T014 [US1] Criar `tv-web/src/features/vod/useShowcaseAssembly.ts`: slots de Filmes/Séries (§4, com `primary`/`required`), `extraPending = backdropsPending(backdrops)`, capas da primeira tela (§5), `useScreenAssembly({ screen: section, … })`. → contrato Filmes
- [X] T015 [US1] Em `VodShowcaseScreen.tsx`: remover `localSettled`/`discoverySettled`/`rowsReady`/`capPassed`/`ROWS_SETTLE_CAP_MS`; passar a `buildShowcaseRows` só as fileiras mostradas (`hasX && isShown(x)`; categorias por `isShown('categories')`); `loading` = espera; sem crescer além de 749 linhas (R-001). → contrato Filmes
- [X] T016 [US2] Em `VodShowcaseScreen.tsx`: durante a espera antes de 300 ms, só a moldura (`withShell` + `.screen.vod-screen` vazia), com ↑ → topbar e RETURN → `onBack`; depois, o `Spinner` + `EmptyState` atuais. Manter o efeito `INITIAL_FOCUS_SETTLE_MS` contando da revelação. → contrato Filmes

### Testes da Fase

- [X] T017 [P] [US3] Em `VodShowcaseScreen.test.tsx`: "Bem avaliados" pronto antes do teto entra na revelação; leituras locais em cache aparecem no 1º render (US1/AC1, FR-013).
- [X] T018 Rodar sem editar os contratos de Filmes/Séries: `npx vitest run src/features/vod` (052, 056, 057, carrosséis, paridade-v14).

**Critério de Conclusão**: `npx vitest run src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx` → 1/1 verde; `npx vitest run src/features/vod` verde; travas íntegras para 079, 052, 056, 057 e 027/paridade; `npm run lint` ok.

**Registro da Fase**:

- Status: Concluída (2026-10-16).
- Feito: `useShowcaseAssembly.ts` (slots com `primary`/`required`, `extraPending` = formato largo do "Continue", capas da 1ª tela com `showcaseFirstScreenImages`, `shownRowsInput` para montar as fileiras só com o que foi mostrado; tipado pela forma); `VodShowcaseScreen.tsx` sem `localSettled`/`discoverySettled`/`rowsReady` local/`ROWS_SETTLE_CAP_MS` — teto 2 s, "Bem avaliados" na espera, moldura vazia até 300 ms e SELECT sem efeito nesse intervalo; 749 → 733 linhas (teto baixado com `--prune`).
- Contrato: `npx vitest run src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx` → 1/1 verde; travas íntegras: 079, 052, 053, 056, 057, 050 (paridade-v14).
- Testes executados: `npx vitest run src/features/vod` → 186/186. Dois testes não travados de `VodShowcaseScreen.test.tsx` assumiam o "Carregando" no 1º quadro (comportamento que a spec troca, FR-004) e passaram a esperá-lo com `findByText`/`waitFor`. `VodShowcaseScreen.montagem.test.tsx` (2 novos: "Bem avaliados" na espera; foco fica na topbar se a pessoa subiu durante a espera — fecha A-003). 1ª versão do teste novo não montava fileiras (faltava o stub de tamanho do virtualizador) e usava parameter property (barrada por `erasableSyntaxOnly`); corrigidos. `npx tsc -b` e `npm run lint` limpos.
- Pendências: A-004 (voltar do detalhe remonta a vitrine?) não verificado em teste de componente; conferir no E2E/TV.

---

## Phase 4: Medição e TV (US4 — Priority: P2)

**Objetivo**: registrar a montagem na TV de referência e obter a avaliação visual do usuário.

### Implementation

- [X] T019 [US4] Registrar a linha de base do navegador (fixture E2E, rotulada "navegador — não vale para a TV") em `research.md` → `## Linha de base`.
- [ ] T020 [US4] Na TV (skill `tizen-tv`, build com `VITE_CCPLAY_PERF=1`): roteiro de `quickstart.md` em abertura fria e quente nas três telas; registrar `window.__ccplayAssemblyTimings` sanitizado em `research.md`.
- [ ] T021 [US4] Registrar a avaliação visual do usuário (aprovado/reprovado, observações) em `plan.md` → Execution Notes.

### Testes da Fase

- [X] T022 [US4] Rodar `node e2e/run.mjs --only home-vitrine-expandida,home-busca-configuracoes,historico-continuar-assistindo,home-vitrine-expandida-real` antes de ir à TV.

- [X] T031 [US4] (descoberta na T022, corrigida a pedido do usuário) Atualizar `tv-web/e2e/home-vitrine-expandida-real.mjs` ao billboard do ad-hoc de 2026-10-09: o detalhe da seção 1 abre pelo 1º card de "Continuar assistindo" (a 2ª ação do billboard é "Minha Lista") e a seção 5 volta a um card de título quando → → cai em "Filmes (N)"/"Séries (N)".

**Critério de Conclusão**: medições de navegador e TV registradas separadamente; avaliação visual do usuário registrada. Sem a TV, a fase fica explicitamente aberta.

**Registro da Fase**:

- Status: Parcial (2026-10-16) — navegador e E2E feitos; TV física pendente (T020, T021).
- Feito: linha de base no navegador com a lista real (5 rodadas, `research.md` → Linha de base); campo `pending` no relatório de medição (diz o que estourou o teto); roteiro da lista real atualizado (T031).
- Contrato: N/A.
- Testes executados: `node e2e/run.mjs --only home-vitrine-expandida,home-busca-configuracoes,historico-continuar-assistindo,bem-avaliados,carrosseis-filmes-series,top10-dica,vitrine-filmes-series,limpar-historico` → 8/8 (33 s); `CCPLAY_USER_DATA=<perfil> node e2e/home-vitrine-expandida-real.mjs` → 1ª execução 7 falhas (roteiro desatualizado desde 2026-10-09, não a 079), depois da T031 → "Tudo certo", 47 ✓, 3 não verificáveis no navegador (declarados pelo roteiro). `npx vitest run src/lib/assembly src/lib/perf` → 12/12 e `npx tsc -b` limpo depois do campo `pending`. `filmes-series-ds-v14` não está na `SUITE` do runner e não foi rodado.
- Pendências: T020/T021 (TV física e avaliação visual do usuário). Achado para decisão do usuário: na abertura fria de Filmes/Séries no navegador a tela sempre espera os 2 s inteiros por capas do provedor (todas as leituras já prontas) e ainda revela com parte delas pendente (9/25) — ver R-007.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: fechar gates, documentação e legibilidade.

### Implementation

- [ ] T023 [P] Incluir o billboard neutro (pt/en/es) em `tv-web/e2e/legibilidade-tv.mjs`.
- [X] T032 (decisão do usuário 2026-10-16, R-008) Capas seguram a tela só até 300 ms (padrão dos apps de streaming): `imagesSettled` no hook = capas prontas ou janela do "Carregando" passada; emenda autorizada do contrato `useScreenAssembly.home-carregamento-progressivo.contract.test.tsx` e trava regravada; spec FR-002, `logic/montagem-de-tela.md` §3, research e plano atualizados; medição no navegador refeita (Filmes frio 766 ms, Séries 321 ms, Home 491 ms — p50).
- [X] T024 [P] Atualizar comentários que descrevem o comportamento antigo: `homeRows.ts` ("ou ainda carregando — não existe"), o bloco do ad-hoc 2026-10-09 em `VodShowcaseScreen.tsx`, `useDeferred.ts`.
- [X] T025 Rodar o Checklist de Release.

### Testes da Fase

- [X] T026 [P] `npm run lint`
- [X] T027 [P] `npx tsc -b`
- [X] T028 `npm run test`
- [X] T029 `npm run build`
- [ ] T030 `npm run test:e2e` com `npm run dev` rodando

**Critério de Conclusão**: todos os gates verdes; todos os contratos (079 e os das features 026/052/056/057/060/paridade) verdes com travas íntegras; documentação sem caminhos obsoletos.

**Registro da Fase**:

- Status: Parcial (2026-10-16) — gates unitários, lint, tipos e build verdes; E2E completo com 2 falhas que não são da 079; T023 sem como reproduzir na fixture.
- Feito: comentários atualizados (`homeRows.ts`, `homeRowFormats.ts`, `useDeferred.ts`; o bloco do ad-hoc da vitrine já tinha sido trocado na T015); `e2e.mjs` espera `.home-hero` antes de ler o foco inicial do Início (o billboard só existe depois da revelação); teste não travado "sem o histórico ainda…" de `VodShowcaseScreen.test.tsx` passou a usar relógio falso (com relógio real, sob a carga da suíte inteira, o teto de 2 s chegava antes do Enter — falhou 1× na 1ª suíte completa).
- Contrato: travas íntegras e verdes: 079 (5/5), 026, 060, 052, 053, 056, 057, 050 (paridade-v14).
- Testes executados: `npm run lint` → exit 0 (ratchet ok, 497 arquivos); `npx tsc -b` → limpo; `npm run test` → 640/640 arquivos, 3542/3542 testes (2ª execução, depois do ajuste acima); `npm run build` → ok, `check-no-demux-in-build` ok; `npm run test:e2e` → 48/52 em paralelo; reexecução em série (`--only … --jobs 1`): `carrosseis-filmes-series` ✓ (instabilidade de paralelismo), `e2e` ✓ depois do ajuste; `semelhantes-elenco-ator` ✗ no cenário 9 (diálogo "Remover a chave do TMDB?" em Configurações) — já registrado como falhando antes, em `sdd/bugs/foco-some-ao-descer-na-lista/test.md`; `portal-configuracao` ✗ porque a porta 5175 (fixture com `--strictPort`) está ocupada por outro processo node (PID 44980, aberto às 17:14, não encerrado).
- Pendências: T030 não fica verde por `semelhantes-elenco-ator` (anterior) e `portal-configuracao` (ambiente). T023: o billboard neutro só aparece com o hero passando de 2 s, e a fixture do E2E lê tudo em milissegundos — sem um jeito de atrasar a leitura do hero no roteiro, a legibilidade dele fica coberta só pelo teste de componente (`HomeContent.montagem.test.tsx`) e pela passada na TV. Instabilidade da Fase 2 (`HomeBillboard`/`HomeLiveCard`) não se repetiu nas 2 suítes completas.

### Checklist de Release

- [X] Fase 1: regra comum com 3/3 contratos verdes.
- [X] Fase 2: Home com contrato verde e contratos 026/060 intactos.
- [X] Fase 3: Filmes/Séries com contrato verde e contratos 052/056/057/paridade intactos.
- [ ] Fase 4: medição na TV registrada e avaliação visual do usuário.
- [X] Todos os testes de contrato verdes e `check-contract-tests.ps1` íntegro.
- [X] Lint (ratchet), TypeScript, Vitest e build passam.
- [ ] E2E completo passa antes da TV.
- [X] Nenhuma URL, título ou segredo na medição ou em log.
