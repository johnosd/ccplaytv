---
description: "Lista de tasks da feature 064 — upload no teste de conexão"
---

# Tasks: Upload no teste de conexão da TV

**Input**: Documentos de design de `sdd/specs/064-upload-teste-conexao/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, `logic/upload.md`, quickstart.md

**Organization**: Tasks agrupadas por user story. A persistência (Fase 2) é **bloqueante**: o resultado com upload só existe depois dela.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend em `tv-web/`. Motor em `tv-web/src/lib/network/`, UI em `tv-web/src/features/settings/`, textos em `tv-web/src/lib/i18n/messages/`, E2E em `tv-web/e2e/`.
- Comandos de teste, lint e build rodam em `tv-web/`. Os scripts `.planning/scripts/powershell/*.ps1` rodam na raiz do repositório. No PowerShell, `npm run x -- --opção` perde o `--`: use `node e2e/run.mjs --only …`.

---

## Phase 1: Setup

**Purpose**: Registrar o ponto de partida, para comparar depois.

- [X] T001 Em `tv-web/`, rodar `npx tsc -b`, `npm run lint` e `npm run test`, e registrar no Registro da Fase o resultado. **Esperado:** só os 5 contratos desta feature vermelhos (4 `not implemented` e 1 de asserção). Qualquer outra falha é pré-existente: anotar com o nome do teste e não corrigir aqui.
- [X] T002 Na raiz, rodar `check-contract-tests.ps1` para `062-teste-conexao-tv`, `063-codigo-saudavel-benchmark` e `064-upload-teste-conexao` e registrar que estão íntegras.

---

## Phase 2: Foundational — persistência do upload (bloqueante)

**Objetivo**: o último resultado guarda o upload, lê o resultado antigo como "não medido" e trata upload inválido como indisponível.

### Contrato da Fase

- `U5 guarda o upload com o último resultado, lê o resultado antigo como "não medido" e trata upload inválido como indisponível (FR-011, FR-012, FR-014)`
- Comando: `npx vitest run src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts`

### Implementation

Leia `data-model.md` antes de começar. As travas da 062 (`speedTestRepository.teste-conexao-tv.contract.test.ts`) têm de continuar verdes.

- [X] T010 Em `tv-web/src/lib/network/speedTestRepository.ts`, implementar `normalize`, a nova `valid` e a nova `clean` conforme `data-model.md` (validade com upload, "ao menos uma métrica" contando o upload, teto 75 MB por etapa e 150 MB no total, normalização na leitura, projeção que só inclui os campos de upload quando `uploadMbps !== undefined`) → contrato: `U5`

### Testes da Fase

- [X] T011 [P] Testes em `tv-web/src/lib/network/speedTestRepository.upload.test.ts` (projeto `node`): registro só com upload válido é aceito; `uploadMbps` número com `uploadSamples: 0` é inválido; campos `upload*` soltos em resultado antigo são descartados na leitura; `clean` não grava campo extra; gravação de upload inválido é ignorada e não altera o último resultado.

**Critério de Conclusão**: o contrato da fase passa (1/1), `check-contract-tests.ps1 -Slug 064-upload-teste-conexao` está íntegro, `npx vitest run src/lib/network` verde (incluindo os contratos da 062) e `npx tsc -b` limpo.

**Checkpoint**: persistência pronta; o motor ainda não grava upload.

**Registro da Fase**:

- Status: concluída em 2026-10-07.
- Feito: T010 — `speedTestRepository.ts` reescrito com `normalize` (resultado antigo descarta `upload*` soltos; upload inválido vira `null`/0 e o status é recalculado), `valid` (regras de upload, teto de 75 MB por etapa e 150 MB no total, "ao menos uma métrica" contando o upload, status das quatro métricas só quando há `uploadMbps`) e `clean` (campos de upload só quando `uploadMbps !== undefined`). T011 — `speedTestRepository.upload.test.ts` com 5 testes (só upload válido, upload sem amostra ou acima do pedido, `upload*` soltos em resultado antigo, leitura que normaliza sem alterar o registro gravado, projeção sem campo extra).
- Contrato: `npx vitest run src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1 -Slug 064-upload-teste-conexao` → trava íntegra (5 testes); as travas da 062 e da 063 íntegras.
- Testes executados: T001 (linha de base, antes de tocar em código): `npx tsc -b` 0, lint 0 (`architecture: ok`), `npm run test` 2 914 verdes e 5 vermelhos, exatamente os 5 contratos desta feature. Depois da fase: `npx vitest run src/lib/network src/features/settings src/features/home` → 215 verdes e só os 4 contratos do motor vermelhos (`not implemented`, esperado até a Fase 3), incluindo os 5 contratos da 062; `npx tsc -b` 0.
- Pendências: o oxlint avisa `no-unsafe-optional-chaining` na linha 32 de `connectionTest.upload-teste-conexao.contract.test.ts` (`init?.body as Uint8Array`). É arquivo travado, então fica como aviso (não erro); não corrigir.

---

## Phase 3: User Story 1 - Medir e ver o upload no teste (Priority: P1) 🎯 MVP

**Objetivo**: "Iniciar teste" mede latência, download e upload em sequência, mostra a etapa e o tráfego do envio, e o resultado do diálogo traz as quatro métricas, salvo como último resultado.

**Independent Test**: com o destino simulado, rodar o teste e conferir as quatro métricas, o teto, a falha só do upload, o cancelamento e a gravação.

**Depende de**: Fase 2 (persistência).

### Contrato da Fase

- `U1 upload depois do download, POSTs sequenciais sem credencial, completo com 4 métricas (US1/AC1, FR-001..005)`
- `U2 cada etapa ≤ 75 MB, total ≤ 150 MB, nada pedido depois do limite (FR-004..006, SC-002)`
- `U3 falha só do upload dá parcial salvo; falha total não tenta upload (US1/AC4-AC5, FR-007/008/016)`
- `U4 limite de tempo e cancelamento no upload abortam, sem sobreposição nem retorno (US1/AC2-AC3/AC7, FR-009/010/012)`
- Comando: `npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts`

### Implementation

Leia `logic/upload.md` antes de começar. **Não edite** os contratos nem os testes da 062. A ordem abaixo mantém o `tsc` verde: a etapa `'upload'` do progresso só entra junto com o diálogo (T025).

- [X] T020 [US1] Criar `tv-web/src/lib/i18n/messages/speed.ts` (`defineArea`, pt/en/es) com `settings.speed.upload`, `settings.speed.uploadStage`, `settings.speed.uploadNotMeasured` e `settings.speed.trafficUp`; registrá-la em `messages/pt.ts`, `en.ts`, `es.ts` e em `AREAS` de `messages/areas.test.ts`. Trocar o texto de `settings.speed.limits` em `messages/settings.ts` para o novo teto (60 s / 150 MB) e o aviso de que o teste **envia** dados gerados pelo app, **mantendo uma linha por idioma** (o arquivo está no teto da catraca: 482 linhas).
- [X] T021 [US1] Em `tv-web/src/lib/network/speedTest.ts`, fazer `runSpeedTest` honrar `options.limits` (tempo e bytes em 5 pontos, padrão `SPEED_TEST_MAX_*`). Sem `limits` o comportamento é idêntico (C1–C3 da 062).
- [X] T022 [US1] Em `tv-web/src/lib/network/connectionTest.ts`, implementar a composição de `runConnectionTest`: cancelado/ocupado sem rede, flag de exclusão do módulo liberada em `finally`, primeira etapa com `limits` de 30 s / 75 MB, devolver `cancelled`/`failed` da primeira etapa sem tentar upload, e a montagem do resultado (status das quatro métricas, `reason`, `durationMs`) → contratos: `U1`, `U3`
- [X] T023 [US1] Em `tv-web/src/lib/network/connectionTest.ts`, implementar a etapa de upload (payload de 20 MB preenchido uma vez, tamanhos 1/5/20 MB, reserva antes do POST, deadline de 30 s, abort, cálculo de Mbps, falha sem `failed`). Se o arquivo passar de 300 linhas, extrair a etapa para `tv-web/src/lib/network/uploadStage.ts` → contratos: `U1`, `U2`, `U3`, `U4`
- [X] T024 [US1] Em `tv-web/src/features/settings/useSpeedTest.ts`, trocar o padrão de `run` para `runConnectionTest`. Nada mais muda (hold de mídia, visibilidade, cancelamento e gravação serializada já cobrem o teste inteiro).
- [X] T025 [US1] Criar `tv-web/src/features/settings/SpeedTestMetrics.tsx` (as quatro métricas; upload `undefined` → `settings.speed.uploadNotMeasured`, `null` → `settings.speed.unavailable`, número → Mbps; não focável) e usá-lo em `SpeedTestDialog.tsx`. Em `speedTest.ts`, acrescentar a etapa `'upload'` e `sentBytes?` a `SpeedTestProgress`; no diálogo, mostrar `settings.speed.uploadStage` e `settings.speed.trafficUp` durante o envio e publicar o progresso do upload em `connectionTest.ts` (sem publicar depois de resolver).
- [X] T026 [P] [US1] Em `tv-web/src/styles/settings.css`, ajustar `.speed-test-metrics` para as quatro métricas e **conferir no navegador** que "Latência HTTP" cabe no diálogo; se não couber, 2×2 só no diálogo.
- [X] T027 [US1] Em `tv-web/e2e/teste-conexao-tv.mjs`, atualizar o stub de transporte para atender o `POST …/__up` (hoje só entende `GET …?bytes=` e um POST vira `NaN`): conferir que o envio não leva headers nem credenciais, que as quatro métricas aparecem no resultado e que o cancelamento durante o upload fecha a camada e devolve o foco. Conferir também que o script continua estável (repetir 10 vezes).

### Testes da Fase

- [X] T028 [P] [US1] Testes em `tv-web/src/lib/network/connectionTest.test.ts` (projeto `node`): HTTP 429 no POST dá parcial (não `failed`); progresso publica a etapa `'upload'` com `sentBytes` crescente e nunca depois do resultado; o corpo enviado é `Uint8Array` do tamanho pedido e não depende de nada do chamador; sem `crypto.getRandomValues` o envio ainda funciona; busy durante a primeira etapa também recusa.
- [X] T029 [P] [US1] Testes em `tv-web/src/features/settings/SpeedTestMetrics.test.tsx` e `SpeedTestDialog.upload.test.tsx` (projeto `dom`): quatro métricas com unidades; os três estados do upload (número, `null`, não medido); durante a execução o diálogo mostra "Medindo upload…" e "MB enviados"; `findUnnamedControls` vazio e foco nas mesmas ações da 062.

**Critério de Conclusão**: `npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts` → 4/4 verdes, `check-contract-tests.ps1` íntegro (desta e da 062), `npx vitest run src/lib/network src/features/settings` verde, `npx tsc -b` limpo, `npm run lint` verde e `node e2e/run.mjs --only teste-conexao-tv --jobs 1` verde.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída em 2026-10-07.
- Feito: T020 — área `messages/speed.ts` (upload, etapa, não medido, MB enviados em pt/en/es) registrada em `pt.ts`/`en.ts`/`es.ts`/`areas.test.ts`; texto de `settings.speed.limits` trocado para 60 s / 150 MB e o aviso de que o teste envia dados gerados pelo app, **na mesma linha** (`settings.ts` segue com 482 linhas). T021 — `runSpeedTest` honra `options.limits` (padrão `SPEED_TEST_MAX_*`). T022/T023 — `connectionTest.ts` (135 linhas): composição com flag própria, etapa de upload (payload de 20 MB preenchido uma vez, blocos 1/5/20 MB, reserva antes do POST, deadline de 30 s, abort, cálculo de Mbps), resultado com as quatro métricas e `reason` da primeira etapa que não terminou normalmente; progresso `stage: 'upload'` com `sentBytes`, sem publicar depois do resultado. T024 — `useSpeedTest` usa `runConnectionTest` por padrão. T025 — `SpeedTestMetrics.tsx` (as quatro métricas, com os três estados do upload) usado pelo diálogo, que também mostra "Medindo upload…" e "MB enviados"; etapa `'upload'` e `sentBytes?` em `SpeedTestProgress`. T026 — `.speed-test-metrics` com 4 colunas e 2×2 dentro do diálogo. T027 — `e2e/teste-conexao-tv.mjs` atende o `POST /__up` (envio sem query, sem headers e depois de todo o download; modos `cancel-up`, `bytes`, `timeout`, `partial` com upload) e confere 4 métricas, 75 MB por etapa e 150 MB no total. T028/T029 — 4 + 4 + 4 testes complementares (`connectionTest.test.ts`, `SpeedTestMetrics.test.tsx`, `SpeedTestDialog.upload.test.tsx`).
- Contrato: `npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts` → 4/4 verdes (e U5 1/1); `check-contract-tests.ps1` de 064 e de 062 → trava íntegra; os 5 contratos da 062 verdes sem edição.
- Testes executados: `npx vitest run` em `src/lib/network src/features/settings src/features/home src/lib/i18n` → 249/249; `npx tsc -b` 0 (um erro de tipo do TS 6 — `Uint8Array` genérico não é `BodyInit` — corrigido na hora com `Uint8Array<ArrayBuffer>`); `npm run lint` 0 (`architecture: ok`). E2E (dev server subido para isso, 8 GB de RAM livres): `node e2e/teste-conexao-tv.mjs` passou **11 de 11**. Captura `test-results/teste-conexao-tv/result-pt.png` conferida: o diálogo mostra Download, Upload, Latência HTTP e Jitter em 2×2, com o rótulo cabendo.
- Pendências: o oxlint avisa `no-unsafe-optional-chaining` na linha 32 do contrato U1–U4 (arquivo travado; só aviso).

---

## Phase 4: User Story 2 - Ver o último upload no card e entender resultados antigos (Priority: P2)

**Objetivo**: o card de Configurações mostra o upload do último resultado, e um resultado antigo aparece com o upload "não medido".

**Independent Test**: semear um resultado com upload, um antigo e um parcial, e conferir o card sem abrir o diálogo e sem medir.

**Depende de**: Fase 3 (`SpeedTestMetrics`).

### Implementation

- [X] T030 [US2] Em `tv-web/src/features/settings/IntegrationsPanel.tsx`, trocar o `<dl>` do último resultado por `SpeedTestMetrics` (mesmo rótulo "Último teste" e mesma data).
- [X] T031 [US2] Em `tv-web/src/features/settings/SettingsScreen.speedTestUltimo.test.tsx`, acrescentar os casos: resultado com upload (4 valores), resultado antigo ("Não medido neste teste") e upload tentado sem amostra ("Amostra insuficiente"), sempre sem `fetch` e sem diálogo.
- [X] T032 [US2] Conferir **no navegador** (Playwright, 1920×1080) o card com os três tipos de resultado semeados: valores legíveis, botão "Abrir teste" e anel de foco à vista (a rolagem da última linha já é tratada em `IntegrationsTab.tsx`), e registrar o resultado.

### Testes da Fase

- [X] T033 [P] [US2] Em `tv-web/src/features/home/HomeContent.speedTest.test.tsx`, conferir (sem editar o que existe, em teste novo se preciso) que a dica do dock continua só com o download, mesmo com um resultado que tem upload.

**Critério de Conclusão**: `npx vitest run src/features/settings src/features/home/HomeContent.speedTest.test.tsx` verde e a verificação visual da T032 registrada.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída em 2026-10-07.
- Feito: T030 — `IntegrationsPanel.tsx` usa `SpeedTestMetrics` (mesmo rótulo "Último teste" e mesma data) e perdeu os helpers de formatação que sobraram. T031 — caso novo em `SettingsScreen.speedTestUltimo.test.tsx` (upload, resultado antigo, upload sem amostra; sem `fetch` e sem diálogo). T033 — `HomeContent.speedTestUpload.test.tsx` (arquivo novo, sem editar o existente): com um resultado que tem upload, a dica do dock continua só com o download. T032 — verificação no navegador (Chromium 1920×1080, resultados semeados): os três casos mostram Download/Upload/Latência HTTP/Jitter em 4 colunas sem transbordar, com `81,1 Mbps · 23,4 Mbps`, "Não medido neste teste" e "Amostra insuficiente"; o botão "Abrir teste" fica 30 px acima da borda do painel, com o anel de foco inteiro. "Não medido neste teste" quebra em duas linhas na coluna (aceitável).
- Contrato: sem contrato nesta fase (justificado no plano: a US2 ficou fora do orçamento de 5); `check-contract-tests.ps1` de 064 e 062 íntegros.
- Testes executados: `npx vitest run src/features/settings src/features/home` → verde (107 + 1 testes novos); `npx tsc -b` 0.
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais e documentação.

- [X] T050 Em `tv-web/`, rodar `npx tsc -b`, `npm run lint` (a catraca: arquivos novos ≤ 300 linhas e `messages/settings.ts` ainda ≤ 482) e `npm run test` completos.
- [X] T051 `npm run build` ok.
- [X] T052 Revisão de segredos (constitution, Fluxo): o `POST` só leva bytes gerados pelo app, sem URL de fonte, credencial, chave ou identificador; nenhuma URL no resultado gravado, nas mensagens de erro nem nos logs.
- [X] T053 Com `npm run dev` rodando, `npm run test:e2e` completo verde.
- [X] T054 Rodar `quickstart.md` §1–§3.
- [X] T055 Em `sdd/specs/062-teste-conexao-tv/spec.md`, acrescentar uma nota em Clarifications dizendo que o upload, que a 062 deixou fora de escopo, entrou pela 064 (sem editar o resto da 062).
- [X] T056 Na raiz, `check-contract-tests.ps1` de `064`, `062` e `063`, todas íntegras.

### Checklist de Release

- [X] Fase 2 (persistência) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (desta, da 062 e da 063)
- [X] `npx tsc -b`, `npm run lint`, `npm run test` e `npm run build` verdes
- [X] `npm run test:e2e` verde
- [X] Revisão de segredos feita
- [X] `quickstart.md` §1–§3 executado
- [ ] TV física: **não é gate**. Recomendada, para provar o `POST` a partir de `file://` e o corpo de 20 MB (R-001).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup; bloqueia as demais.
- **US1 (Fase 3)**: depende da Fase 2. Internamente: T020 antes de T025; T021 antes de T022; T022 antes de T023; T025 depois de T023; T027 depois de T024/T025.
- **US2 (Fase 4)**: depende da T025 (`SpeedTestMetrics`).
- **Polish (Fase 5)**: depende das três.

### Parallel Opportunities

- T011 em paralelo à T010 (arquivo de teste separado).
- T026, T028 e T029 em paralelo, depois da T023/T025.
- T033 em paralelo à T030.

---

## Implementation Strategy

### MVP First (US1)

1. Fase 1 e Fase 2 (persistência).
2. Fase 3: motor, hook, diálogo e E2E.
3. **PARAR E VALIDAR**: contratos, suíte, travas da 062 e o E2E.

### Incremental Delivery

1. Persistência, que não muda nada visível.
2. US1: o teste mede e mostra o upload no diálogo.
3. US2: o card.
4. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 6: Convergence

**Objetivo**: resolver CF-001 (MEDIUM) e CF-002 (LOW), reproduzidos pelo `sdd-converge` em 2026-10-07. Nenhuma fase ou task anterior foi alterada.

### Implementation

- [X] T057 [US2] Em `tv-web/src/lib/network/speedTestRepository.ts`, fazer a normalização de leitura cobrir também as inconsistências relacionais do upload: número positivo com `uploadSamples: 0`, `uploadSentBytes > uploadRequestedBytes` e `uploadRequestedBytes > 75_000_000`. Hoje `normalize` aceita esses campos e `valid` retorna falso, ocultando o resultado inteiro. Normalizar só o upload para indisponível (`null`/0 e `partial`), preservando download, latência, jitter e data quando o restante é válido, sem regravar o registro. Manter a gravação inválida como `ignored`. Acrescentar regressões de leitura em `tv-web/src/lib/network/speedTestRepository.upload.test.ts`, conferindo também que o registro original permanece idêntico. **Origem:** CF-001; FR-014; plan: D-008 / `data-model.md` — Normalização na leitura.
- [X] T058 [US1] Em `tv-web/src/lib/network/connectionTest.ts`, atribuir `measuredAt` pelo relógio civil (`options.wallClockNow ?? Date.now`) na montagem do resultado ao concluir o teste inteiro, em vez de herdar a data do fim do download. Manter `durationMs` baseado no relógio monotônico e não alterar `runSpeedTest` nem os contratos travados. Acrescentar regressão em `tv-web/src/lib/network/connectionTest.test.ts` com relógio civil variável e upload que avance o tempo, distinguindo o fim do download do fim do teste inteiro. **Origem:** CF-002; plan: `logic/upload.md` §4 (`measuredAt = relógio civil no fim, como a 062`).

### Testes e Critério de Conclusão

- `npx vitest run src/lib/network` verde, incluindo as novas regressões e os contratos U1–U5/C1–C4, sem editar contratos.
- `npx tsc -b`, `npm run lint`, `npm run test` e `npm run build` verdes; com dev server rodando, `node e2e/run.mjs --only teste-conexao-tv --jobs 1` e `npm run test:e2e` verdes.
- `check-contract-tests.ps1` de 064, 062 e 063 com as travas íntegras.
- Rerodar as duas reproduções: inconsistência apenas do upload conserva as métricas restantes; data do resultado corresponde à conclusão do upload.

**Registro da Fase**:

- Status: concluída em 2026-10-07. T057 e T058 verificadas; gates finais verdes.
- Evidência CF-001: com resultado sintético completo (`downloadMbps: 30`, `uploadMbps: 12.5`), a leitura normal retorna as métricas; cada uma das três inconsistências da T057 faz `readLastSpeedTestResult` retornar `null`. Banco isolado descartado ao fim.
- Evidência CF-002: transporte sintético com 3 090 ms de latência/download e 3 000 ms de upload; `durationMs: 6090`, mas `measuredAt: 1800000003090` em vez de `1800000006090` (relógio civil controlado).
- Checagens da auditoria: 43 arquivos / 165 testes direcionados verdes (motor, persistência, Configurações, Home e i18n); E2E `teste-conexao-tv` 1/1 verde; travas 064/062/063 íntegras (5 contratos cada). Os casos acima não eram cobertos pelos testes existentes.
- Feito: T057 — regras relacionais do upload centralizadas em `uploadFieldsValid`, usadas na normalização da leitura e na validação da gravação; upload inconsistente vira indisponível, mantendo as demais métricas sem regravar. Três regressões de leitura (zero amostras, enviados acima dos pedidos e pedidos acima de 75 MB) falharam antes da correção e passaram depois. T058 — `measuredAt` obtido na conclusão do teste inteiro; duas regressões com relógio civil avançando/recuando falharam antes da correção e passaram depois; `durationMs` segue monotônico.
- Contrato: sem contrato novo nesta fase. `npx vitest run src/lib/network` → 44/44 verdes, incluindo U1–U5 e os contratos de motor/persistência da 062. Os 5 contratos da 064 e os 5 da 062 também verdes na suíte completa; `check-contract-tests.ps1` de 064, 062 e 063 → travas íntegras (5 testes cada), sem edição.
- Testes executados: `npx vitest run src/lib/network/speedTestRepository.upload.test.ts src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts src/lib/network/speedTestRepository.teste-conexao-tv.contract.test.ts` → 10/10; `npx vitest run src/lib/network/connectionTest.test.ts src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts` → 10/10; `npx tsc -b` 0; `npm run lint` 0 (`architecture: ok`, avisos existentes); `npm run test` → primeira rodada 2 942/2 943 (R-009), segunda 2 943/2 943 sem build/E2E concorrentes; `npm run build` 0 (`check-no-demux-in-build` ok); `node e2e/run.mjs --only teste-conexao-tv --jobs 1` → 1/1; `npm run test:e2e` → primeira rodada 41/42 (R-010), segunda 42/42 com servidor reiniciado e sem concorrência externa. As reproduções foram repetidas pelas 5 regressões novas; nenhuma transferência real necessária.
- Pendências: R-009 (timeout da limpeza do benchmark da 063) e R-010 (selo de série no E2E) permanecem registrados como instabilidades observadas, com atribuição não provada; passar isolado e na repetição completa não foi tratado como resolução da causa. R-008 permanece. TV física não executada, recomendação sem gate (R-001). Nenhum código fora da 064 foi corrigido.
- Próximo: repetir `sdd-converge 064-upload-teste-conexao`; commit sugerido, não realizado.
