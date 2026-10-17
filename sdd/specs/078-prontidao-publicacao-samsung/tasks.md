---
description: "Tasks da feature 078 — prontidão para publicação no Samsung TV Seller Office"
---

# Tasks: Prontidão para publicação do app Samsung TV

**Input**: Documentos de design de `sdd/specs/078-prontidao-publicacao-samsung/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/gate.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Gate (código): `tv-web/scripts/release/*.mjs`; testes adicionais `tv-web/scripts/release/*.test.mjs` (projeto Vitest `node`).
- Guardas de pacote existentes: `tv-web/scripts/tizenFiles.mjs`, `tv-web/scripts/sync-tizen.mjs`.
- Projeto Tizen: `CCPlayTv/config.xml`, `CCPlayTv/tizen_web_project.yaml`; pacote em `CCPlayTv/.buildResult/CCPlayTv.wgt` (fora do git).
- Dados do gate e kit: `release/samsung/` (data-model.md).
- Página de privacidade: `bridge/privacidade/index.html` (publicada por `.github/workflows/bridge-pages.yml`).
- Comandos rodam de `tv-web/` salvo indicação; os scripts `.planning` rodam da raiz.

---

## Phase 1: Setup

**Purpose**: Estrutura de dados do gate.

- [X] T001 Criar `release/samsung/` com `README.md` (como rodar o gate, o que é cada arquivo, regra "nada de segredo aqui"), `distribution.json` (`variant: "base"`, `countries: ["BR"]`, D-005), `published.json` (todos `null`), `custody.json` (campos vazios), `target-matrix.json` (`[]`), `evidence/.gitkeep`, `reports/.gitkeep`, conforme `data-model.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Decisão, leitor de pacote e relatório que todas as stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `decisão: item ausente é pendência, Waived só em critério interno dispensável e só alvo com evidência de TV entra no conjunto aprovado` — FR-006 · FR-014/014a · SC-001/003/008
- Comando: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "decisão"`

### Implementation

- [X] T002 Implementar `decideLaunch` em `tv-web/scripts/release/decision.mjs` conforme `logic/gate.md` §6 (item ausente = Pending, IDs dinâmicos, waiver só `waivable` com dono+justificativa, `approvedTargets` só `tv`+evidência, `TARGET-MATRIX`) → contrato: `decisão: …`
- [X] T003 [P] Criar `tv-web/scripts/release/wgt.mjs`: `readWgt(buffer)` → `Map<path, Buffer>` lendo o diretório central do zip (métodos 0 e 8 via `zlib.inflateRawSync`), e `sha256(buffer)`; sem dependência nova (logic §7.2).
- [X] T004 [P] Criar `tv-web/scripts/release/report.mjs`: `renderReport(decisionJson)` → Markdown (cabeçalho com variante, revisão, versão, SHA-256, decisão; aviso de obsolescência no topo; tabela por item com ID, classe, status, detalhe, dono, próxima ação). Nunca imprime conteúdo de artefato.

### Testes da Fase

- [X] T005 [P] `tv-web/scripts/release/wgt.test.mjs`: zip montado no teste (uma entrada stored, uma deflated) é lido com conteúdo e hash corretos; buffer que não é zip → erro `invalid_wgt` sem eco do conteúdo.
- [X] T006 [P] `tv-web/scripts/release/report.test.mjs`: relatório lista todos os IDs do `CHECKLIST`, mostra o aviso de obsoleto quando `stale.stale` e não contém nenhum campo `artifacts`/conteúdo de arquivo.

**Critério de Conclusão**: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "decisão"` → 1/1 verde; `npx vitest run scripts/release` sem falha fora dos contratos de fases futuras; `npm run lint` verde.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-10-16). Fase 1 (T001) também concluída: `release/samsung/` criado com README, `distribution.json` (base, BR), `published.json`/`custody.json` nulos, `target-matrix.json` vazio, `evidence/` e `reports/`.
- Feito: `decision.mjs` (`decideLaunch` conforme logic §6: item do catálogo sem resultado = Pending, IDs dinâmicos herdam o prefixo, Waived só em `waivable` com dono e justificativa, `TARGET-MATRIX` quando nenhum alvo `tv` com evidência); `wgt.mjs` (`readWgt` por diretório central, métodos 0/8, erro único `invalid_wgt`; `sha256`); `report.mjs` (`renderReport`, só campos do resultado, ordem do `CHECKLIST` e depois dinâmicos, aviso de obsoleto no topo).
- Contrato: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "decisão"` → 1/1 verde; os outros 4 seguem vermelhos por `not implemented` (Fases 3–5, esperado); trava íntegra.
- Testes executados: `npx vitest run scripts/release` → 3 arquivos, 5 verdes (decisão + `wgt.test.mjs` 2 + `report.test.mjs` 2) e 4 contratos de fases futuras vermelhos; `npm run lint` → ok (só avisos pré-existentes em `src/`; `architecture: ok`); `check-contract-tests.ps1` → PASS.
- Pendências: nenhuma desta fase. `wgt.test.mjs` exporta `makeZip` para reuso em T035.

---

## Phase 3: User Story 1 - Gerar candidato identificável (Priority: P1) 🎯 MVP

**Objetivo**: O CLI identifica revisão, árvore, variante, modo, versão e hash do `.wgt`, e detecta candidato anterior obsoleto.

**Independent Test**: revisão limpa → relatório com revisão/versão/hash; árvore suja → `INT-CAND-TREE` `Blocked`; repetir para `--variant commercial`.

### Contrato da Fase

- `candidato registra revisão/versão/hash, árvore suja bloqueia e mudança de hash torna o anterior obsoleto` — US1 · FR-001 · SC-009
- Comando: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "candidato"`

### Implementation

- [X] T007 [US1] Implementar `describeCandidate` e `compareWithPrevious` em `tv-web/scripts/release/candidate.mjs` (logic §2) → contrato: `candidato registra …`
- [X] T008 [US1] Criar `tv-web/scripts/release/release-gate.mjs` (logic §7 passos 1, 2, 5, 6, 7): args `--variant`, `--wgt`; `git rev-parse HEAD` + `git status --porcelain`; lê o `.wgt` com `wgt.mjs`; `buildMode` = `production`/`commercial`; `INT-DIST-VARIANT` a partir de `release/samsung/distribution.json`; compara com `reports/<version>-<variant>.json` anterior; grava `.json` + `.md`; código de saída 0/2. Os itens ainda não implementados saem como `Pending` (nunca `Pass`).

### Testes da Fase

- [X] T009 [P] [US1] `tv-web/scripts/release/candidate.test.mjs`: `compareWithPrevious(undefined, x)` não é obsoleto; mudança de `variant`/`buildMode` é obsoleta com `reasons` corretos; `wgtSha256` inválido → `INT-CAND-HASH` `Blocked`.

**Critério de Conclusão**: `-t "candidato"` → 1/1 verde; `node scripts/release/release-gate.mjs --variant base` contra o `.wgt` atual grava relatório com revisão, versão e hash e sai com 2; com a árvore suja mostra `INT-CAND-TREE` `Blocked`.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-16).
- Feito: `candidate.mjs` (`describeCandidate`: `INT-CAND-TREE`/`INT-CAND-HASH`; `compareWithPrevious` por `revision/version/variant/buildMode/wgtSha256`); `release-gate.mjs` com `--variant`, `--wgt`, `--root` (este último para o teste do CLI na Fase 8): lê git (`rev-parse`, `status --porcelain -z` — os relatórios do próprio gate em `release/samsung/reports/` não sujam o candidato), lê o `.wgt`, `INT-DIST-VARIANT`, `target-matrix.json`, compara com o último relatório da variante, grava `.json` + `.md`, sai 0/2 (1 para erro de uso/pacote inválido). Itens ainda não ligados ficam sem resultado → `Pending` na decisão.
- Contrato: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "candidato"` → 1/1 verde; trava íntegra (PASS, 5 testes).
- Testes executados: `npx vitest run scripts/release` → `candidate.test.mjs` 2 verdes, contratos decisão + candidato verdes, `wgt`/`report` verdes; pacote/privilégios/kit vermelhos por `not implemented` (Fases 4–5, esperado). `node scripts/release/release-gate.mjs --variant base` contra o `.wgt` atual → código 2, `INT-CAND-TREE` Blocked (96 alterações na árvore desta branch), `INT-CAND-HASH` e `INT-DIST-VARIANT` Pass, relatório com revisão/versão 0.2.1/hash (relatório de teste removido; o oficial é T036). `npm run lint` ok.
- Pendências: o ramo "árvore limpa → Pass" só foi exercitado pelo contrato (a árvore real está suja); T035 cobre o CLI em diretório temporário.

---

## Phase 4: User Story 2 - Passar pelo gate técnico do pacote (Priority: P1)

**Objetivo**: IDs, versão, `required_version`, título, assinaturas, privilégios, release/debug e inventário conferidos — e o pacote real corrigido onde o gate já sabe que bloqueia.

**Independent Test**: pacote válido → itens `SAM-PKG/CFG/PRV` e `INT-PKG-*` `Pass`; amostras inválidas (contrato) → `Blocked` com evidência.

### Contrato da Fase

- `pacote: arquivos de assinatura, faixa de versão, required_version contra o piso, título, debug e inventário nos dois sentidos` — US2 · FR-003/003a/003b/004 · FR-010a
- `privilégios: productinfo sem Checkout só passa com confirmação registrada; …` — FR-005
- Comando: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "pacote|privilégios"`

### Implementation

- [X] T010 [US2] Implementar `parseTizenConfig`, `checkPackage` e `checkInventory` em `tv-web/scripts/release/packageChecks.mjs` (logic §3) → contrato: `pacote: …`
- [X] T011 [US2] Implementar `checkPrivileges` em `tv-web/scripts/release/privileges.mjs` (logic §4) → contrato: `privilégios: …`
- [X] T012 [US2] Criar `release/samsung/privileges.json` com os 6 privilégios de `CCPlayTv/config.xml`: nível conferido na doc Samsung/Tizen de cada um, `usedBy` por variante apontando o arquivo real (`application.launch` → `tv-web/src/App.tsx`; `tv.inputdevice` → `lib/tizenMediaKeys.ts`/`lib/tizenColorKey.ts`; `productinfo`/`network.public` → `lib/portal/platformProbe.ts` (base e comercial) e `lib/portal/portalRuntime.ts` (comercial); `internet`; `unlimitedstorage` → IndexedDB do catálogo), `confirmation` de `productinfo` = URL da doc ProductInfo (D-008); `features: { checkout:false, inAppAds:false }`.
- [X] T013 [P] [US2] Em `tv-web/scripts/tizenFiles.mjs` adicionar `findStaleDeclared(distFiles, yamlText)` (declarado em `files:` e não emitido, exceto `icon.png`, `favicon.svg`, `icons.svg` que vêm do projeto Tizen) e fazer `tv-web/scripts/sync-tizen.mjs` recusar sincronizar listando-os, com a mesma forma da mensagem atual (R-008).
- [X] T014 [US2] `CCPlayTv/config.xml`: `required_version="8.0"` (D-004) e `<name>CCPlayTV</name>` (D-007). Nenhum privilégio novo; nada mais muda.
- [X] T015 [US2] `CCPlayTv/tizen_web_project.yaml`: `build_type: Release`; rodar `npm run build:tizen` e remover de `files:` só as entradas que `findStaleDeclared` acusar (hoje esperado: `assets/FavoritesState.js`, `assets/TextField.js`, `assets/useEnterSimilarPanel.js` — confirmar no build, não por esta lista).
- [X] T016 [US2] No CLI (`release-gate.mjs`): ligar `checkPackage` (com `config.xml` de dentro do pacote, `runtimeFloor: '8.0'`, `buildType` do yaml, `storeTitle` do `kit/manifest.json`, `published.json`), `checkInventory` (dist × yaml × pacote, logic §3), `checkPrivileges` (ledger, `distribution.variant`) e `SAM-SEC-AUTHOR`/`INT-SEC-CUSTODY` (logic §7.3, `custody.json`; só fingerprint/issuer públicos).

### Testes da Fase

- [X] T017 [P] [US2] `tv-web/scripts/tizenFiles.test.mjs`: casos novos de `findStaleDeclared` (obsoleto acusado, arquivos do projeto Tizen ignorados, `\` normalizado). O contrato travado da 021 (`pacoteTizen.fundacao-visual.contract.test.mjs`) tem de continuar verde.
- [X] T018 [P] [US2] `tv-web/scripts/release/packageChecks.test.mjs`: `parseTizenConfig` sobre o `CCPlayTv/config.xml` real lê Tizen ID `8tZqMtwANL.CCPlayTv`, `required_version` `8.0`, 6 privilégios e o `screen.size`; `required_version` `10.0` ≥ `8.0` passa; `publishedTizenId` diferente → `SAM-CFG-TIZENID` `Blocked`.
- [X] T019 [P] [US2] `tv-web/scripts/release/privileges.test.mjs`: o ledger real cobre todos os privilégios do `config.xml` real nas duas variantes sem `Blocked`; `adinfo` sem anúncio e `smartcontroller.microphone` sem autorização → `Blocked`.

**Critério de Conclusão**: `-t "pacote|privilégios"` → 2/2 verdes; `scripts/tizenInputPrivilege.test.mjs` e o contrato da 021 verdes; `npm run build:tizen` passa sem entrada obsoleta; o CLI sobre um `.wgt` recém-empacotado mostra `Pass` em `SAM-PKG-FILES`, `SAM-CFG-*` (exceto `TITLE` se o kit ainda não tiver `storeTitle`), `SAM-PRV`, `INT-PKG-INVENTORY`, `INT-PKG-RELEASE`.

**Registro da Fase**:

- Status: concluída (2026-10-16).
- Feito: `packageChecks.mjs` (`parseTizenConfig`, `checkPackage`, `checkInventory` — versão comparada por componente numérico, título com caixa, inventário nos dois sentidos); `privileges.mjs` (`checkPrivileges`, ordem de regras de logic §4 + nível desconhecido bloqueia); `release/samsung/privileges.json` (6 privilégios; níveis e `confirmation` de `productinfo` conferidos nas docs Samsung de ProductInfo, Network e TVInputDevice); `tizenFiles.mjs` (+`findStaleDeclared`, +`declaredFiles`; só `icon.png` é isento — `favicon.svg` e `icons.svg` o `dist/` emite de fato) e `sync-tizen.mjs` recusa entrada obsoleta; `CCPlayTv/config.xml` (`required_version` 8.0, `<name>CCPlayTV</name>`) e `tizen_web_project.yaml` (`build_type: Release`, removidas `assets/FavoritesState.js`, `TextField.js`, `useEnterSimilarPanel.js` — as 3 que o `sync` acusou); `author.mjs` novo (módulo puro: `readAuthorCertificate`, `checkAuthor`, `checkCustody`, só `issuer`/`fingerprint256` do X509 público); CLI ligado a pacote, inventário (dist × yaml × pacote), privilégios, `SAM-SEC-AUTHOR`, `INT-SEC-CUSTODY` e `SAM-REG-*` (A-01); o CLI acha o único `.wgt` de `CCPlayTv/.buildResult` (o nome passou a `CCPlayTV.wgt` com o `<name>` novo).
- Contrato: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "pacote|privilégios"` → 2/2 verdes; trava íntegra (PASS, 5 testes).
- Testes executados: `npx vitest run scripts` → 21 arquivos verdes (inclui contrato da 021, `tizenInputPrivilege`, `tizenFiles` +3, `packageChecks` 3, `privileges` 2, `author` 3, `candidate` 2) e 1 vermelho (contrato "kit", Fase 5); `npm run lint` ok; `npm run build:tizen` ok sem entrada obsoleta. Empacotado com o perfil Samsung (`tizen build-web` + `tizen package`) e `node scripts/release/release-gate.mjs --variant base` → `SAM-PKG-FILES`, `SAM-CFG-TIZENID/PACKAGEID/VERSION/APIVERSION/SCREENSIZE`, `SAM-PRV`, `SAM-SEC-AUTHOR`, `INT-PKG-INVENTORY`, `INT-PKG-RELEASE` Pass; `SAM-CFG-TITLE` Pending (kit na Fase 5); `INT-SEC-CUSTODY` Blocked (custody vazio, esperado). Contra o `.wgt` antigo o gate já acusava `required_version 2.3` e 22 arquivos divergentes.
- Pendências: (1) níveis de `internet`, `unlimitedstorage` e `application.launch` marcados "pendente de conferência" no `levelSource` do ledger (docs Tizen redirecionam; a doc Samsung não os lista); (2) `application.launch` não tem uso comprovado — só `tizenExit.ts` (`getCurrentApplication().exit()`), que a doc Samsung não diz exigir privilégio: R-009; (3) o `sync` atualizou `CCPlayTv/assets/*` e `index.html` rastreados (estavam defasados do build) — entram no diff da feature.

---

## Phase 5: User Story 4 - Entregar um kit de publicação rastreável (Priority: P1)

**Objetivo**: Manifest versionado com cada item do Seller Office, validado (hash, mídia, segredos), sem criar artes.

**Independent Test**: abrir `release/samsung/kit/manifest.json`, achar cada `SAM-KIT-*` com dono/status/hash ou justificativa; o gate acusa mídia fora do padrão e segredo sem ecoá-lo.

### Contrato da Fase

- `kit: hash, quatro JPEG 1280×720/1920×1080 < 500 kB, logo com alfa, Not Applicable justificado e segredo bloqueado sem ser ecoado` — US4 · FR-008/010/016
- Comando: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs -t "kit"`

### Implementation

- [X] T020 [US4] Implementar `checkKit`, `inspectJpeg`, `inspectPng`, `findSecrets` em `tv-web/scripts/release/kit.mjs` (logic §5) → contrato: `kit: …`
- [X] T021 [US4] **Perguntar ao usuário** (AskUserQuestion) o e-mail VOC e o contato da política de privacidade (D-011, R-005). Não usar nenhum e-mail sem resposta explícita.
- [X] T022 [US4] Criar `release/samsung/kit/manifest.json` (todos os `SAM-KIT-*`, `defaultLanguage: "pt"`, `storeTitle: "CCPlayTV"`, `privacyUrl`), `kit/listing/{pt,en,es}.md` (título + descrição curta/longa honestas: player de listas IPTV da própria pessoa, sem conteúdo incluído; atribuição TMDB exigida pelos termos; nenhuma promessa de canal/filme), `kit/ui-description.md` (telas, teclas do controle, idiomas, fluxos condicionais — adicionar lista, portal/QR só no comercial — para transcrição no template oficial) e `kit/demo-access.md` (DemoAccess sanitizado: tipo de lista, onde está o segredo, dono, validade, escopo; nenhum valor). Artes: `SAM-KIT-LOGO/ICONBG/SHOTS` `Pending` com dono e próxima ação. `SAM-KIT-UIDESC` `Pending` até o template oficial ser preenchido.
- [X] T042 [US4] (ad-hoc, pedido do usuário durante a revisão de T022) Tirar "IPTV" do kit, da página de privacidade e do app: "playlists Xtream/M3U" nos textos; `settings.tab.sources` → "Playlists", `add.title.new` → "Conecte sua playlist" (pt/en/es); dicas de `parental.ts`/`live.ts` e `settings.speed.description`; emenda aprovada dos contratos 026/037/067 com travas regravadas (R-012).
- [X] T023 [US4] No CLI: ler o manifest, chamar `checkKit` com `readFile` restrito a `release/samsung/kit/` (caminho fora → `Blocked`), e passar `storeTitle` ao `checkPackage`.

### Testes da Fase

- [X] T024 [P] [US4] `tv-web/scripts/release/kit.test.mjs`: `findSecrets` acusa `/live/u/p/1.ts`, chave hex de 32, `Bearer`, bloco de chave privada e não acusa o texto real de `kit/listing/*.md`; `.p12` no manifest → `Blocked`; PNG com `tRNS` conta como alfa; `readFile` fora do kit → `Blocked`.

**Critério de Conclusão**: `-t "kit"` → 1/1 verde; o CLI sobre o kit real dá `INT-KIT-SECRETS` `Pass`, `SAM-CFG-TITLE` `Pass` e os `SAM-KIT-*` sem arte como `Pending` com dono — nenhum `Pass` sem artefato.

**Registro da Fase**:

- Status: concluída (2026-10-16).
- Feito: `kit.mjs` (`inspectJpeg` por marcadores até o SOF, `inspectPng` com colorType 4/6 ou `tRNS`, `findSecrets` com os 6 padrões de logic §5 — devolve só nomes —, `checkKit`: hash por artefato, regras de SHOTS/LOGO/ICONBG, `Not Applicable` exige `naReason`, `Pass` sem artefato bloqueia; A-02: `SAM-KIT-LISTING` exige `listing/<idioma>.md` com `# título` e corpo em cada idioma de `manifest.languages`; A-03: `SAM-KIT-TESTACCESS` bloqueia no comercial (R-004) e sem `validUntil:` ou vencido; `SAM-KIT-VOC` exige `value` com formato de e-mail; `.p12/.pfx/.pem/.key` no kit bloqueia `INT-KIT-SECRETS`). T021: e-mail VOC e contato da política = `ccplaytv@gmail.com` (resposta explícita da pessoa, 2026-10-16). Kit real: `manifest.json` (todos os `SAM-KIT-*`), `listing/{pt,en,es}.md`, `ui-description.md`, `demo-access.md` (sem valor, sem `validUntil`) e `.gitattributes` (`* -text`, R-010). CLI: `kitReader` (só arquivos dentro de `release/samsung/kit/`), `checkKit` com variante e data do relatório; manifest ausente → `INT-KIT-SECRETS` `Pending`.
- Contrato: `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs` → 5/5 verdes (kit incluído); trava íntegra (PASS, 5 testes).
- Testes executados: `npx vitest run scripts/release` → 8 arquivos, 23 testes verdes (`kit.test.mjs` 4); `npx vitest run scripts` → 23 arquivos, 93 testes verdes; `npm run lint` ok (só avisos antigos fora da feature); `node scripts/release/release-gate.mjs --variant base` → `SAM-CFG-TITLE`, `SAM-KIT-LISTING`, `SAM-KIT-VOC`, `INT-KIT-SECRETS` Pass; `SAM-KIT-UIDESC/LOGO/ICONBG/SHOTS/PRIVACY` Pending (dono produto), `SAM-KIT-TESTACCESS` Pending (dono release); relatório de teste apagado.
- Pendências: (1) artes (logo, fundo do ícone, 4 screenshots) e template oficial da UI Description dependem da pessoa; (2) lista de teste autorizada para o revisor ainda não existe (`demo-access.md` "a definir"); (3) os textos de `listing/*.md` são rascunho honesto — a pessoa deve revisá-los antes da submissão.

---

## Phase 6: User Story 5 - Tratar privacidade conforme o build (Priority: P1)

**Objetivo**: Página pública HTTPS de política de privacidade e vínculo dela com o candidato.

**Independent Test**: candidato com coleta (comercial) bloqueia sem URL HTTPS verificada; candidato sem coleta aceita `Not Applicable` justificado.

### Implementation

- [X] T025 [US5] Criar `bridge/privacidade/index.html`: página estática pt/en/es (seletor por âncora, sem JS de terceiro, sem cookie, sem analytics), descrevendo por variante o que existe de verdade: dados ficam na TV (IndexedDB: listas, credenciais, catálogo, favoritos, histórico, chave TMDB); o que sai e para quem (TMDB com a chave da pessoa; Radio Browser com país e uuid; no comercial, serviço do portal: identificador da TV, credenciais de lista cifradas, backup de uso, licença/Pix), sempre por ação da pessoa (ADR-016/017/020); retenção e exclusão (desvincular, apagar backup); contato (T021). Citar só o que o código faz hoje — conferir em `docs/portal/operacao.md` e ADR-013/016/017/018/020.
- [X] T026 [US5] Nota `**Atualização (feature 078):**` na ADR-012 (`sdd/adr/ADR-012-pagina-ponte-estatica-https-embeds-terceiro.md`): a mesma hospedagem pode servir **documento público estático** que o app nunca carrega (política de privacidade, feature 078), com as regras 1 e 4 de página-ponte (estática, sem script de terceiro/cookie/analytics) e listado na tabela.
- [X] T027 [US5] No CLI: `SAM-KIT-PRIVACY` = `Pass` só se `manifest.privacyUrl` é `https:` sem credencial/query **e** existe `release/samsung/evidence/privacy-*.json` (quickstart §6: status 200, data) para essa URL; sem evidência → `Pending`; variante declarada sem coleta → `Not Applicable` só com `naReason` (FR-011). O gate não faz requisição de rede.

### Testes da Fase

- [X] T028 [P] [US5] `tv-web/scripts/release/privacy.test.mjs` (ou caso em teste do CLI): URL `http:`/com query → `Blocked`; HTTPS sem evidência → `Pending`; evidência de outra URL não conta.

**Critério de Conclusão**: página publicada responde 200 em HTTPS (quickstart §6, depois do merge em `main`) e a evidência gravada; CLI mostra `SAM-KIT-PRIVACY` `Pass`; até o merge, `Pending` honesto.

**Registro da Fase**:

- Status: concluída (2026-10-17) — merge em `main` feito pelo usuário; `curl.exe -sI https://johnosd.github.io/ccplaytv/privacidade/` → `HTTP/1.1 200 OK`; o GET publicado é idêntico a `bridge/privacidade/index.html` (pt/en/es, nenhum `<script>`; "analytics"/"cookie" só no texto que diz não usar); `release/samsung/evidence/privacy-2026-10-17.json` gravado; gate → `SAM-KIT-PRIVACY` `Pass`. Pendência (1) abaixo resolvida.
- Feito: `bridge/privacidade/index.html` (pt/en/es por âncora, sem script, cookie, analytics nem recurso de terceiro; `referrer no-referrer`): dados locais da TV; destinos conferidos no código — provedor da lista, TMDB (só com a chave da pessoa), Radio Browser (país + uuid), YouTube via página-ponte do trailer, Cloudflare (só no teste de conexão em Ajustes) e, na versão com portal, o serviço no Google Cloud (identificador, listas cifradas, backup cifrado, licença; Mercado Pago no pagamento) sempre por ação da pessoa; retenção (backups do serviço até 7 dias, `docs/portal/operacao.md`) e exclusão; contato `ccplaytv@gmail.com`. Nota `**Atualização (feature 078):**` e linha na tabela da ADR-012 (documento público estático, regras 1 e 4). `privacy.mjs` (`checkPrivacy`, puro, sem rede) e CLI: `SAM-KIT-PRIVACY` sobrepõe o item do manifest a partir de `privacyUrl` + `evidence/privacy-*.json` (formato no data-model).
- Contrato: sem contrato nesta fase; `npx vitest run scripts/release/releaseGate.prontidao-publicacao.contract.test.mjs` segue 5/5 verdes; trava íntegra (PASS, 5 testes).
- Testes executados: `npx vitest run scripts/release` → 9 arquivos, 26 testes verdes (`privacy.test.mjs` 3); `npm run lint` ok; `node scripts/release/release-gate.mjs --variant base` → `SAM-KIT-PRIVACY` `Pending` ("falta evidência HTTP 200 para esta URL"); relatório de teste apagado.
- Pendências: (1) merge em `main` → publicar → `curl.exe -sI https://johnosd.github.io/ccplaytv/privacidade/` (quickstart §6) → gravar `release/samsung/evidence/privacy-<data>.json`; (2) o texto da política é descritivo, sem revisão jurídica (fora do escopo, spec); (3) a página descreve a versão com portal de forma genérica ("quando disponível") — reler quando o comercial for distribuído.

---

## Phase 7: User Story 3 + User Story 6 - Matriz comprovada e evidência por ambiente (Priority: P1)

**Objetivo**: Matriz país/modelo/firmware só com o que foi visto na TV, e evidências de estático/build/E2E/emulador/TV separadas e amarradas ao hash do candidato.

**Independent Test**: uma combinação com evidência de TV e uma sem — só a primeira em `approvedTargets`; gate de ambiente indisponível fica `Pending`/`Waived`, nunca `Pass`.

### Implementation

- [X] T029 [US6] No CLI: `INT-EVD-*` e `INT-UPD-PRESERVE` lidos de `release/samsung/evidence/*.json` (data-model), só contando evidência com `candidate.wgtSha256` igual ao candidato; `INT-EVD-STATIC`/`BUILD` podem ser gravados pelo próprio CLI com `--record-local` rodando `npm run lint` e `npm run test` e registrando código de saída (nunca a saída bruta). `target-matrix.json` → `decideLaunch`.
- [X] T030 [US6] Rodar `npm run test:e2e` (com `npm run dev`) e gravar `evidence/e2e-<data>.json` para o candidato.
- [X] T031 [US6] Emulador: tentar o roteiro da skill `tizen-emulator`; se o bloqueio `118, -4` persistir, gravar `INT-EVD-EMULATOR` `Waived` com dono e justificativa (D-009, R-003).
- [X] T032 [US3] [US6] TV física (quickstart §4, skill `tizen-tv`, **sem desinstalar**): atualização por cima com dados de uso, roteiro curto, firmware anotado; gravar `evidence/tv-<data>.json`, `evidence/update-<data>.json` (INT-UPD-PRESERVE) e a linha `BR · QN50Q60DAGXZD · <firmware> · tv · allowed` em `target-matrix.json`. Gate obrigatório — se não executado, fica `Pending` e a feature não fecha sem decisão explícita do usuário.

### Testes da Fase

- [X] T033 [P] [US6] `tv-web/scripts/release/evidence.test.mjs`: evidência com hash de outro `.wgt` não conta; evidência `browser` não satisfaz `INT-EVD-TV`.

**Critério de Conclusão**: relatório mostra cada ambiente separado com dispositivo/firmware/data; `approvedTargets` contém só a TV de referência (se o roteiro passou); nenhuma linha de matriz sem evidência aparece como aprovada.

**Registro da Fase**:

- Status: concluída (2026-10-17) — T029–T033 concluídas; T031 ficou `Waived` por `118, -4` e T032 foi confirmado na TV física pelo usuário.
- Feito: `evidence.mjs` (`checkEvidence`, `EVIDENCE_GATES`: STATIC/BUILD `local`, E2E `browser`, EMULATOR `emulator`, TV e UPD-PRESERVE `tv`; só conta evidência do mesmo `wgtSha256` e do ambiente do gate; a mais recente vence; `Waived` leva dono e justificativa para o `decideLaunch` julgar). CLI: lê `evidence/*.json` (menos `privacy-*`), `--record-local` roda `npm run lint` e `npm run test` e grava só o código de saída em `evidence/{static,build}-<data>-<variante>.json`; `evidence/` e `target-matrix.json` deixam de contar na árvore suja (R-011).
- Contrato: sem contrato nesta fase; contrato da feature segue 5/5 verdes; trava íntegra.
- Testes executados: `npx vitest run scripts/release` → 10 arquivos, 29 testes verdes (`evidence.test.mjs` 3); `npm run lint` ok; `npm run test:e2e` → 52/52 scripts verdes; `node scripts/release/release-gate.mjs --variant base --record-local` → `INT-EVD-STATIC` e `INT-EVD-BUILD` `Pass` (códigos 0). Uma execução anterior da suíte completa falhou intermitentemente em `scripts/bench/importBench.test.mjs` (`xmltv`, timeout do `afterEach`); o teste isolado passou 9/9 e a reexecução usada na evidência passou, sem alterar o benchmark.
- Pendências: (1) T041 quickstart §2–§7 ainda não registrado; (2) privacidade publicada, artes, UI Description e registros do Seller Office seguem pendentes.

---

## Phase 8: User Story 7 - Repetir o gate após uma mudança (Priority: P2)

**Objetivo**: Rerodar depois de mudar código/versão/kit produz relatório novo e marca o anterior como obsoleto.

**Independent Test**: mudar a versão, reempacotar, rerodar → hash/relatório novos e aviso de obsolescência.

### Implementation

- [X] T034 [US7] No CLI: quando `config.xml` do disco ≠ do pacote, ou o kit mudou depois do relatório anterior (`kitVersion`/hash do manifest), registrar a razão em `stale.reasons` e no topo do `.md` (logic §7.6).

### Testes da Fase

- [X] T035 [P] [US7] `tv-web/scripts/release/release-gate.test.mjs`: CLI executado como processo sobre um diretório temporário (zip mínimo de T005 + `release/samsung` fictício) grava relatório, e uma segunda execução com outro hash marca obsoleto; nenhuma saída contém conteúdo de artefato.

**Critério de Conclusão**: cenário de obsolescência do quickstart §3 reproduzido; T035 verde.

**Registro da Fase**:

- Status: concluída (2026-10-16).
- Feito: CLI grava `kit: { kitVersion, manifestSha256 }` no relatório e calcula a obsolescência em `staleness`: razões de `compareWithPrevious` (revisão, versão, variante, modo, hash do `.wgt`) + `kit` (hash do manifest diferente do relatório anterior) + `config.xml do disco difere do pacote` (editado depois de empacotar); a mensagem de topo do `.md` continua a mesma. Zip mínimo de teste movido de `wgt.test.mjs` para `testZip.mjs` (helper sem casos, reaproveitado pelo teste do CLI).
- Contrato: sem contrato nesta fase; contrato da feature segue 5/5 verdes; trava íntegra.
- Testes executados: `npx vitest run scripts/release` → 11 arquivos, 31 testes verdes (`release-gate.test.mjs` 2: CLI como processo sobre repositório git temporário — relatório gravado, `INT-CAND-TREE` Pass com árvore limpa, segundo pacote marca `wgtSha256`, kit e `config.xml` alterados entram nas razões, segredo do kit ausente de stdout/stderr/JSON/MD); `npm run lint` ok; gate real rodado 2× sobre o mesmo pacote → `stale=false` (relatórios apagados).
- Pendências: nenhuma da fase. O cenário do quickstart §3 (mudar versão + reempacotar) fica coberto pelo teste; repeti-lo com o `.wgt` real faz sentido no candidato final.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, rodada final do gate e revisão de segredos.

- [X] T036 Rodar o gate final para a variante base sobre um `.wgt` recém-empacotado de árvore limpa e commitar `release/samsung/reports/<version>-base.{json,md}`; o veredito é o que o gate disser (esperado `Blocked` por artes/UI Description até serem fornecidas — registrar honestamente). Gate executado, decisão `Blocked` registrada honestamente e relatório preservado.
- [X] T037 [P] Atualizar `docs/guia-praticas-app-tv/10_checklist_de_lancamento.md` com um parágrafo apontando o gate (`release/samsung/README.md`) e o mapeamento L01–L10 → IDs.
- [X] T038 [P] `CLAUDE.md` → seção Commands (frontend): uma linha `node scripts/release/release-gate.mjs --variant base|commercial` (regra permanente, sem status de feature).
- [X] T039 [P] `.planning/backlog.md` → `## Ideias Futuras`: "Licença/voucher de teste para revisor do Seller Office (variante comercial)" (R-004) e "Ampliar matriz de modelos Tizen 8.0" (R-001).
- [X] T040 Revisão de segredos: `git diff` de `release/`, `bridge/`, `CCPlayTv/` sem credencial, URL de lista, chave, caminho do certificado ou senha.
- [X] T041 Rodar `quickstart.md` §2–§7 e registrar o resultado no Registro de cada fase.
- [X] T044 (ad-hoc, pedido do usuário 2026-10-17) Mídias da loja no kit: logo/fundo/ícone de `docs/guia-praticas-app-tv/assets/` em `release/samsung/kit/media/` (aprovados pelo usuário) e as 4 capturas geradas por `tv-web/scripts/release/store-screenshots.mjs` (app real no navegador, painel Xtream e capas SVG fictícios, sem TMDB) — Filmes, TV ao vivo com guia, Séries, detalhe de "Distrito Zero"; hashes no `manifest.json`; `SAM-KIT-LOGO/ICONBG/SHOTS` `Pass`; `kit.test.mjs` atualizado para o estado real.
- [X] T043 (ad-hoc, descoberta ao reempacotar para T036) `CCPlayTv/tizen_web_project.yaml`: remover `assets/EmptyState.js`, que o build não emite mais desde o commit `37e068a` — a trava `findUnlistedFiles`/obsoletos do `sync-tizen` recusava sincronizar.

**Registro da Fase**
- Status: concluída (2026-10-17) — T036–T041 e T043 feitos; o que resta é externo (Fase 6 publicada, quickstart §6/§7).
- Feito: mapeamento L01–L10 → IDs no doc 10; linha do gate em `CLAUDE.md` → Commands; duas ideias no backlog (R-004, R-001); `npm run build:tizen` refeito (agora sem nenhum "IPTV" em `CCPlayTv/assets`) depois de T043.
- Contrato: sem contrato nesta fase.
- Testes executados: `npm run build:tizen` (1ª falhou na trava de obsoletos, 2ª ok depois de T043). T040: varredura com `findSecrets` + extensões de chave sobre 75 arquivos de texto de `release/`, `bridge/` e `CCPlayTv/` — `release/` e `bridge/` sem achado; 5 achados em `CCPlayTv/assets/catalogApi.js`, `route-add-source.js` e `CCPlayTv/Debug/.../index.js`, todos código (template `?username=${…}&password=${…}` e atribuições de campo, conferidos pela forma mascarada) — nenhum valor `CCPLAY_PROBE_*` do `.env` presente no bundle (conferido só por presença, sem imprimir). Nenhum `.p12/.pem/.key` nessas pastas.
- T041 (2026-10-17, revisão `32328a6`, `.wgt` `bc864e…`):
  - §2: `npx vitest run scripts/release` 31/31; `npx vitest run scripts` 101/101; `npm run lint` ok (2 avisos pré-existentes do React Compiler); `npm run test` 640 arquivos / 3542 testes verdes; `npm run build:tizen` ok e **reproduzível** (nenhum arquivo versionado de `CCPlayTv/` mudou); trava 078 íntegra (5). E2E 52/52 (rodada desta sessão sobre o mesmo código — depois dela só mudaram testes).
  - §3: gate `Blocked` com 9 bloqueios, todos externos (`INT-SEC-CUSTODY`, `SAM-REG-*`, `SAM-KIT-UIDESC/LOGO/ICONBG/SHOTS/TESTACCESS/PRIVACY`); **nenhum** bloqueio em `SAM-PKG-FILES`, `SAM-CFG-APIVERSION`, `SAM-CFG-TITLE`, `INT-PKG-INVENTORY`, `INT-PKG-RELEASE`, `SAM-PRV`; `INT-EVD-BUILD/E2E/TV` e `INT-UPD-PRESERVE` `Pass`, alvo aprovado BR/QN50Q60DAGXZD. SC-009: `config.xml` do disco em 0.2.2 sem reempacotar → `Obsolescência: config.xml do disco difere do pacote` e aviso no topo do `.md`; `config.xml` e relatório restaurados depois (o relatório commitado de T036 fica).
  - §4/§5: feitos na Fase 7 (TV por cima, sem desinstalar, confirmada pelo usuário; emulador `Waived`, `118, -4`); as evidências batem com o hash do `.wgt` atual.
  - §6: `curl.exe -sI https://johnosd.github.io/ccplaytv/privacidade/` → `HTTP/1.1 404` — esperado: a página só publica com o merge em `main`.
  - §7: manuais do Seller Office, não executados (dependem da pessoa).
  - Segredos: `findSecrets` + valores `CCPLAY_PROBE_*` (só presença) + caminho de certificado sobre 14 JSON/MD de `release/samsung/`, `reports/` e `evidence/` — nenhum achado.
- Desvios fora do escopo corrigidos com aprovação do usuário (2026-10-17): E2E `semelhantes-elenco-ator` cenário 9 navegava 3 setas até "Remover" e parava em "Atualizar" (botão novo da 077) → 2 setas (`ab4c64e`); `release-gate.test.mjs` com 30 s (sobe o CLI 2× e roda git; 5,4 s na suíte completa); `VodShowcaseScreen.test.tsx` (079) com `waitFor` de 5 s para o atraso real de 300 ms (`e34c233`) — instável sob carga.
- Pendências: o veredito permanece `Blocked` só por itens externos — publicar a página (merge em `main`) e gravar `evidence/privacy-*.json`; artes, UI Description oficial, acesso de teste com `validUntil`, `custody.json`, registros no Seller Office (§7).

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US4) concluída
- [X] Fase 6 (US5) concluída — página publicada e evidência gravada
- [X] Fase 7 (US3/US6) concluída — TV física executada (gate obrigatório)
- [X] Fase 8 (US7) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [X] `npm run lint`, `npm run test`, `npm run build:tizen` verdes
- [X] `npm run test:e2e` verde antes da passada na TV
- [X] Nenhum segredo em `release/`, `bridge/` e relatórios
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: cria o CLI; Fases 4–8 ligam suas verificações nele
- **US2 (Phase 4)** e **US4 (Phase 5)**: depois da Fase 3; podem correr em paralelo (T016 e T023 tocam o mesmo CLI — fazer em sequência)
- **US5 (Phase 6)**: T025 depende de T021 (contato); publicação depende de merge em `main`
- **US3/US6 (Phase 7)**: depende de 4 e 5 (o `.wgt` de TV precisa das correções de T014/T015)
- **US7 (Phase 8)**: depois da 3; T035 reaproveita o zip de T005
- **Polish (Phase 9)**: depois de todas

### Parallel Opportunities

- T003/T004 (Fase 2); T013 com T010/T011; T017–T019; T024; T037–T039

---

## Parallel Example: Phase 4

```bash
Task: "T010 [US2] packageChecks.mjs"
Task: "T013 [P] [US2] tizenFiles.mjs findStaleDeclared"
```

---

## Implementation Strategy

### MVP First

1. Fases 1–3: o CLI já identifica o candidato e bloqueia árvore suja.
2. Fase 4: pacote corrigido e conferido — o maior risco de pré-teste.
3. **PARAR E VALIDAR** com um `.wgt` recém-empacotado.

### Incremental Delivery

Fases 5–7 adicionam kit, privacidade e evidências; cada uma transforma `Pending` em resultado real sem tocar nas anteriores.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Nenhuma task cria arte, faz login ou envia algo ao Seller Office
- Commitar após cada task ou grupo lógico coerente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
