---
description: "Tasks da feature 044 — parser M3U: headers, radio e tvg-chno"
---

# Tasks: Contrato de compatibilidade do parser M3U (headers, radio, tvg-chno)

**Input**: `sdd/specs/044-parser-m3u-headers/` (spec, plan, `logic/headers-m3u.md`)

**Prerequisites**: plan.md, spec.md, `logic/headers-m3u.md`, `contract-tests.lock` (5 testes travados)

**Organization**: por user story (P1 → P3). Os contratos já existem e estão travados: nenhuma task os escreve ou edita.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Tudo em `tv-web/src/lib/catalog/` (zona `IMPORT`). Comandos a partir de `tv-web/`.
- ADR em `sdd/adr/`. Nada em `features/`, `components/`, `api/` ou `CCPlayTv/`.

## Phase 1: Setup

**Purpose**: amostras para os testes (FR-013).

- [X] T001 [P] Criar `tv-web/src/lib/catalog/m3uHeaders.fixtures.ts` com amostras **anonimizadas** de listas reais (formato Kodi/TiviMate/VLC): `|User-Agent=…&Referer=…`, `|` com `%20`, `#EXTVLCOPT` com `http-user-agent`/`http-referrer`, `#KODIPROP` de DRM e de `stream_headers`, `radio="true"`, `tvg-chno`. Hosts `exemplo.test`, tokens falsos. **Nunca** copiar valor de `docs/m3u/dados.md` nem de `.env`.

---

## Phase 2: Foundational

**Purpose**: tipos que as três stories compartilham.

**⚠️ CRITICAL**: sem eles as stories não compilam juntas.

- [X] T002 Em `classifier.ts` acrescentar a `ClassifiedEntry` os campos opcionais `playbackHeaders?: PlaybackHeaders`, `radio?: true`, `declaredChannelNumber?: number`; em `m3uParser.ts` acrescentar `unsupportedDirectives?: number` a `ParseTally` (`ParsedEntry.headers` já existe como stub).

**Checkpoint**: `npx tsc -b` limpo.

---

## Phase 3: User Story 1 — URL e headers separados no `|` (Priority: P1) 🎯 MVP

**Objetivo**: a URL guardada é a limpa e os headers vão à parte.

**Independent Test**: `parseM3uText` com entradas `URL|User-Agent=…&Referer=…`.

### Contrato da Fase

- `US1/AC1+AC3+AC4: separa URL e headers no primeiro \`|\`…` — US1, FR-001/002
- `FR-006/FR-011: \`|\` comum no caminho fica…` — FR-006/FR-011
- Comando: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts -t "US1|FR-006"`

### Implementation

- [X] T003 [US1] Implementar `splitUrlHeaders` em `tv-web/src/lib/catalog/m3uHeaders.ts` conforme `logic/headers-m3u.md` §1 (caminho rápido sem `|`, lista de nomes conhecidos, fronteira de par, `%`, 512, último vence, `headers` ausente quando vazio) → contrato: `US1/AC1+AC3+AC4`, `FR-006/FR-011`
- [X] T004 [US1] Em `parseM3uLines` (`m3uParser.ts`), passar a linha da URL por `splitUrlHeaders`: `url` limpa, `headers` na `ParsedEntry`; **não** mexer em nada mais → contrato: `US1/AC1+AC3+AC4`

### Testes da Fase

- [X] T005 [P] [US1] `tv-web/src/lib/catalog/m3uHeaders.test.ts`: caso a caso do §1 — nome em qualquer caixa, `Referrer`, `+` preservado, `%` inválido não lança, valor vazio e de 513 caracteres não guarda, header repetido, só `Cookie` → URL limpa sem `headers`, amostras do T001.

**Critério de Conclusão**: os 2 contratos acima verdes (`-t "US1|FR-006"`), `m3uHeaders.test.ts` verde, `check-contract-tests.ps1 -Slug 044-parser-m3u-headers` íntegro, `npx vitest run src/lib/catalog/m3uParser.test.ts` ainda verde.

**Checkpoint**: US1 funcional isolada.

**Registro da Fase**:

- Status: Concluída (2026-10-02). Inclui a Fase 2 (T002, só tipos).
- Feito: `ClassifiedEntry`/`ParseTally` com os campos novos; `splitUrlHeaders` + `parseHeaderPairs` em `m3uHeaders.ts`; `parseM3uLines` entrega a URL limpa e `headers` (o nome de reserva, quando o `#EXTINF` não tem nome, agora é a URL limpa); `m3uHeaders.test.ts` (7 casos, incluindo a amostra do T001).
- Contrato: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts` → os 2 testes da fase (US1/AC1+AC3+AC4 e FR-006/FR-011) verdes; o de US2 segue vermelho (Fase 4); trava íntegra.
- Testes executados: `m3uHeaders.test.ts`, `m3uParser.test.ts` e o contrato do parser → 19/20 (a falha é o contrato de US2, esperada); `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 — `#EXTVLCOPT` e `#KODIPROP` (Priority: P2)

**Objetivo**: diretrizes entre `#EXTINF` e a URL viram headers da entrada seguinte, e só dela.

**Independent Test**: lista com duas entradas, só a primeira com `#EXTVLCOPT`.

### Contrato da Fase

- `US2/AC1-AC4 + FR-003/FR-004/FR-005: diretriz vale só para a entrada seguinte…`
- Comando: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts -t "US2"`

### Implementation

- [X] T006 [US2] Implementar `readDirectiveHeaders` em `m3uHeaders.ts` conforme `logic/headers-m3u.md` §2 (`http-user-agent`, `http-referrer`/`http-referer`, `stream_headers` do KODIPROP; demais chaves `supported: false`, valor descartado) → contrato: `US2/AC1-AC4`
- [X] T007 [US2] Em `parseM3uLines`, acumulador `directiveHeaders` independente de `pending`, mescla `{...diretriz, ...pipe}` ao emitir, zera ao emitir e quando um `#EXTINF` chega com `pending !== null`; diretriz órfã no fim descartada; contar `tally.unsupportedDirectives` (`logic` §3). Cuidado: o laço atual faz `if (line.startsWith('#')) continue` — as diretivas têm que ser lidas **antes** desse `continue` → contrato: `US2/AC1-AC4`

### Testes da Fase

- [X] T008 [P] [US2] Em `m3uHeaders.test.ts` e um arquivo novo `m3uParser.diretrizes.test.ts`: `#EXTVLCOPT` não dispara `HlsManifestDetectedError`; `#EXTINF` sem URL seguido de outro `#EXTINF` zera a diretriz e conta `invalidCount` como antes; diretriz órfã no fim não conta inválida; `unsupportedDirectives` conta DRM e nunca guarda o valor; `#KODIPROP stream_headers`.

**Critério de Conclusão**: contrato `-t "US2"` verde; os 3 contratos do parser verdes juntos; `m3uParser.test.ts` e `m3uParser.diretrizes.test.ts` verdes; trava íntegra.

**Checkpoint**: US1 e US2 funcionam juntas no parser.

**Registro da Fase**:

- Status: Concluída (2026-10-02).
- Feito: `readDirectiveHeaders` (`#EXTVLCOPT` http-user-agent/http-referrer/http-referer, `#KODIPROP` stream_headers; o resto vira `supported: false` sem valor) e o acumulador `directiveHeaders` em `parseM3uLines` (lido antes do `continue` das linhas `#`; zera ao emitir e quando um `#EXTINF` chega com entrada pendente; `|` prevalece por chave; `tally.unsupportedDirectives`).
- Contrato: `npx vitest run src/lib/catalog/m3uParser.parser-m3u-headers.contract.test.ts` → 3/3 verdes; trava íntegra.
- Testes executados: `m3uHeaders.test.ts`, `m3uParser.diretrizes.test.ts` (novo, 7 casos), `m3uParser.test.ts` e o contrato do parser → 27/27; `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 — `radio`, `tvg-chno` e persistência (Priority: P3)

**Objetivo**: os campos chegam ao registro guardado pelo caminho `stored`, sem mudar nada visível.

**Independent Test**: importar uma lista M3U e ler a categoria.

### Contrato da Fase

- `FR-002/FR-007/FR-008/FR-009/FR-011: guarda headers, radio e tvg-chno…` — US3
- `FR-001/FR-010 + Constitution (segredos): reprodução abre a URL limpa…`
- Comando: `npx vitest run src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts`

### Implementation

- [X] T009 [US3] Em `classifyEntry` (`classifier.ts`) preencher `playbackHeaders` (de `entry.headers`), `radio` e `declaredChannelNumber` (`logic` §4) nos **três** ramos de retorno → contrato: `FR-002/FR-007/FR-008/…`
- [X] T010 [US3] Em `toStoredRecord` (`importPipeline.ts`) copiar `playbackHeaders` (qualquer tipo) e `radio`/`declaredChannelNumber` (só `kind === 'channel'`, como o `epgChannelId`) → contrato: `FR-002/FR-007/FR-008/…`, `FR-001/FR-010…`
- [X] T011 [US3] Em `itemsSignature` (`categoryBlocks.ts`) empurrar os três campos ao fim do vetor do item **só quando algum existe** (`logic` §5; D-006)

### Testes da Fase

- [X] T012 [P] [US3] `classifier.test.ts`/`categoryBlocks`: `tvg-chno` inválido (`"0"`, `"abc"`, `"1234567"`) e `radio="false"` viram ausência; `itemsSignature` de um item sem os campos é **idêntico** ao de antes (fixar o valor), e muda quando o header muda; episódio de série sintética mantém os headers e a série sintética não; Modo limitado (`refineFromUrl`) preserva os headers de uma entrada `/live/`.

**Critério de Conclusão**: `npx vitest run src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` → 2/2 verdes; os 5 contratos juntos 5/5; trava íntegra; `npx vitest run src/lib/catalog` verde.

**Checkpoint**: as três stories entregues.

**Registro da Fase**:

- Status: Concluída (2026-10-02).
- Feito: `classifyEntry` carrega `playbackHeaders`/`radio`/`declaredChannelNumber` nos três ramos (via `declaredExtras`, só as chaves que existem; `normalizeRadio`/`normalizeDeclaredChannelNumber` exportadas); `toStoredRecord` copia os três (`radio`/`declaredChannelNumber` só em canal); `itemsSignature` só acrescenta os quatro valores quando algum existe. **Desvio pequeno, dentro do escopo** (R-008): `playbackHeaders` só é gravado quando a URL também é (`keepUrl`) — no Modo limitado a URL é derivada da credencial e não fica no registro, então guardar os headers só ampliaria o segredo no aparelho.
- Contrato: `npx vitest run src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` → 2/2 verdes; os 5 contratos juntos 5/5; trava íntegra.
- Testes executados: `m3uHeaders.classificacao.test.ts` (7) e `importPipeline.headers.test.ts` (2: Modo limitado sem header guardado e sem o valor em nada gravado; renovação com header novo) → 9/9. O valor fixado da assinatura de um item sem os campos (`1:4c683ba1`) foi **conferido contra o `categoryBlocks.ts` do HEAD anterior** com um teste temporário (removido).
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 Emendar a **ADR-010** (`sdd/adr/ADR-010-url-completa-fonte-arquivo-m3u.md`) com `**Atualização (feature 044-parser-m3u-headers, <data>):**`: `User-Agent`/`Referer` de um item podem viver no IndexedDB sob as mesmas mitigações; `CatalogItemOut`/UI nunca os expõem. Não alterar o texto da constituição (FR-012).
- [X] T014 Medir SC-004: importar uma lista sintética de 100 mil entradas (sem headers) antes e depois, na mesma máquina, e registrar a diferença em `plan.md` → `Riscos e Decisões`. Script descartável no scratchpad, **não** commitado.
- [X] T015 Regressão: `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`, e com `npm run dev` rodando `npm run test:e2e` (importação M3U); registrar. Falhas conhecidas de paralelismo (`*.favorites.test.tsx`/`LiveScreen.test.tsx`) → confirmar isoladas.
- [X] T016 Rodar `quickstart.md`; atualizar `.planning/backlog.md` (item 25a `Implementada`, 25b segue `Bloqueado`) pelos scripts, e anotar a feature em `CLAUDE.md`.

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Os 5 testes de contrato verdes na suíte completa e `check-contract-tests.ps1 -Slug 044-parser-m3u-headers` íntegro (suíte completa: 2307 passam; só falham os 5 contratos da feature 045, ainda não executada)
- [X] As outras 26 travas do repositório íntegras (27 verificadas, 0 com problema)
- [X] `tsc`, lint e build limpos; `npm run test:e2e` verde (25 scripts, exit 0)
- [X] SC-004 medido e registrado (`plan.md` R-009: +3% sem headers; +5–6% com 5% das linhas com header)
- [X] ADR-010 emendada
- [X] `quickstart.md` executado — **ressalva**: as checagens automatizadas e o que os passos 1–2 e 4 provam estão cobertos pelos contratos e pelos E2E; os passos 3 (inspeção no DevTools) e 5 (tocar o canal) são manuais e **não foram executados** (recomendados, não gate)

---

## Dependencies & Execution Order

- T001 e T002 antes de tudo; T003→T004 (US1); T006→T007 (US2, depois de US1 porque os dois mexem em `parseM3uLines`); T009→T010→T011 (US3, depois do T002).
- US1 → US2 → US3 em ordem (mesmo arquivo `m3uParser.ts`); T005/T008/T012 são `[P]` dentro da fase.
- Polish depois das três.

## Implementation Strategy

1. T001–T002. 2. US1 e **parar**: contratos 1 e 3 verdes, parser já separa a URL. 3. US2. 4. US3. 5. Polish.

## Notes

- Commitar após cada fase. Mensagem em português, prefixo `feat(044):`.
- Não tocar em `playbackUrl.ts`, `catalogApi.ts`, `PlayerLayer`, `avplayAdapter` (D-007).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

**Purpose**: lacunas achadas pelo `sdd-converge` em 2026-10-02. Os contratos não mudam (a trava continua íntegra).

- [X] T017 [MEDIUM] Em `toStoredRecord` (`tv-web/src/lib/catalog/importPipeline.ts`, ~l.497-499) atribuir `playbackHeaders`, `radio` e `declaredChannelNumber` ao registro **só quando existem**, sem chaves de valor `undefined` — o clone estruturado do IndexedDB as preserva e elas iriam para `storedEntries` e para `categoryBlocks`, de modo que um item sem os campos deixaria de ser idêntico, campo a campo, ao de antes. Teste em `tv-web/src/lib/catalog/importPipeline.headers.test.ts`: lido o bloco (`storedItems`), o registro de uma entrada comum não tem essas três chaves (`Object.keys`), e a que tem os campos continua os tendo. Origem: `FR-011`, `SC-002`, `SC-004` (memória).
- [ ] T018 [LOW, manual, depende do usuário] Importar uma lista real que use `|User-Agent=…` ou `#EXTVLCOPT` e conferir o registro (quickstart, passo 3); se aparecer um formato não coberto, acrescentar o caso (anonimizado) a `m3uHeaders.fixtures.ts` e a `m3uHeaders.test.ts`. Não bloqueia a convergência. Origem: `FR-013` ("amostras reais"). — **2026-10-09**: a lista M3U real do `.env` (326 614 entradas) não usa `|User-Agent=`, `#EXTVLCOPT` nem `#KODIPROP` (só contagens conferidas, nada impresso); segue pendente de uma lista que use esses formatos.

**Registro da Fase**:

- Status: T017 concluída (2026-10-02); T018 segue aberta de propósito (manual, depende de uma lista real do usuário, não bloqueia).
- Feito: `toStoredRecord` (`importPipeline.ts`) monta o registro e só acrescenta `playbackHeaders` (com `keepUrl`), `radio` e `declaredChannelNumber` (só canal) quando existem — o registro de um item comum não carrega mais as três chaves, nem como `undefined`. Teste escrito **antes** da correção e visto vermelho (`expected [ 'name', 'originalName', …(23) ] to not include 'playbackHeaders'`).
- Contrato: `npx vitest run src/lib/catalog/importPipeline.parser-m3u-headers.contract.test.ts` → 2/2 verdes (os 5 contratos da feature seguem verdes); trava íntegra.
- Testes executados: `importPipeline.headers.test.ts` (3), contratos e `m3uParity.test.ts` → 7/7; `npx vitest run src/lib/catalog` → 475 passam, só falham os 2 contratos da feature 045 (não executada); `tsc -b` e `npm run lint` limpos; E2E `m3u-sob-demanda`, `capa-real`, `carga-listas` e `catalogo-em-blocos` verdes.
- Pendências: T018 (manual).
