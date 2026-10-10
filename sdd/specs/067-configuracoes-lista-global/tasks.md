---
description: "Tasks da feature 067 — Configurações da lista × globais, PIN por lista"
---

# Tasks: Separar configurações da lista das configurações globais do app

**Input**: Documentos de design de `sdd/specs/067-configuracoes-lista-global/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/pin-por-lista.md, logic/navegacao-lista.md, contract-amendments/

**Organization**: Tasks agrupadas por user story. A ordem de fases não segue P1→P3 à risca: a Fase 2 (PIN por lista) é fundação, porque as abas da tela da lista (US1) e todos os pedidos de PIN dependem da API nova.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

- Frontend único em `tv-web/src/` (`features/` telas · `components/` UI compartilhada · `lib/` dados sem UI · `navigation/` rotas puras); comandos rodam em `tv-web/`.
- Roteiros E2E em `tv-web/e2e/*.mjs`; catraca em `tv-web/scripts/architecture-baseline.json`.
- Scripts SDD em `.planning/scripts/powershell/`, rodados da raiz do repositório.

---

## Phase 1: Setup — emendas autorizadas dos contratos travados

**Purpose**: aplicar a decisão do usuário (R-001, D-011) antes de qualquer código, para que as travas da 026/066 reflitam a regra nova.

- [X] T001 Confirmar que a 066 está convergida em `.planning/backlog.md` (`## Features`); se não estiver, **parar** e avisar o usuário (a 067 começa depois dela). Rodar a linha de base: os 5 contratos da 067 vermelhos pelos motivos de `plan.md` → Estratégia de Testes; `npx tsc -b` e `npm run lint` limpos.
- [X] T002 Copiar **verbatim** os 3 arquivos de `sdd/specs/067-configuracoes-lista-global/contract-amendments/` por cima de `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`, `tv-web/src/lib/parental/pin.categorias-controle-parental.contract.test.ts` e `tv-web/src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts`. Nenhuma outra edição nesses arquivos.
- [X] T003 Regravar as travas com **todos** os arquivos de cada feature (o `-Write` grava só os caminhos passados): `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14 -Write -Paths <os 4 arquivos do lock da 026>` e `-Slug 066-categorias-controle-parental -Write -Paths <os 3 arquivos do lock da 066>`; conferir que ambas dizem 5/5. Anexar nota `**Emenda (067):**` no `## Riscos e Decisões` do `plan.md` da 026 e da 066 citando R-001 da 067.

**Critério de Conclusão**: as 3 travas (026, 066, 067) íntegras; os contratos emendados vermelhos pelo motivo da tabela do `plan.md` (026: não acha "Configurar"; 066: `not implemented`); `categoryAccess` US1 e `PinPrompt` continuam verdes.

**Registro da Fase**:

- Status: Concluída (2026-10-10).
- Feito: 066 conferida como Convergida (57/57) e travas 026/066 idênticas às do plano (as emendas continuavam válidas). Emendas copiadas byte a byte (`cmp`) de `contract-amendments/`; travas regravadas com todos os arquivos — 026 5/5 (4 arquivos), 066 5/5 (3 arquivos). Notas `**Emenda (067):**` em `026/plan.md` (R-010) e `066/plan.md` (R-020).
- Contrato: `npx vitest run src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts src/components/PinPrompt.categorias-controle-parental.contract.test.tsx` → 2 verdes (US1 de `categoryAccess`, `PinPrompt`) e 4 vermelhos pelo motivo esperado (026 não acha "Configurar"; 066 `not implemented`). Contratos da 067: 5/5 vermelhos pelos motivos da Estratégia de Testes. Travas 026, 066 e 067 íntegras.
- Testes executados: linha de base `npx tsc -b` limpo; `npm run lint` ok (145 imports herdados, 15 avisos antigos).
- Pendências: nenhuma.

---

## Phase 2: Foundational — PIN por lista e migração (US3 em dados)

**Purpose**: a API `lib/parental/listPin.ts`, a tabela v21 e a migração. Bloqueia as Fases 3–5.

**⚠️ CRITICAL**: nenhuma tela muda antes desta fase terminar.

### Contrato da Fase

- `US3/AC1..AC5, FR-017/FR-018/FR-023/FR-025: cada lista tem o seu PIN…` — US3
- `FR-024/SC-005: o PIN único da 066 vira o PIN de cada lista…` — FR-024
- Emendas da 066: `pin.categorias-controle-parental.contract.test.ts` (1) e `categoryAccess.categorias-controle-parental.contract.test.ts` (3)
- Comando: `npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts`

### Implementation

- [X] T004 [P] Módulo puro `tv-web/src/lib/catalog/adultCategory.ts` com `isAdultCategoryName`, `ADULT_NAME`, `normalizeForSearch` (movida de `catalogSearch.ts`, que a reexporta) e a regra de bloqueio salvo sem `Rule`; `categoryAccess.ts` passa a importar de lá (`logic/pin-por-lista.md` §4, R-003).
- [X] T005 Dexie v21 em `tv-web/src/lib/catalog/dbSchema.ts` (`parentalPins: 'sourceId'`, `parentalPin` continua declarada) com `.upgrade((tx) => migrateLegacyPin(tx))`; `ParentalListPinRecord` e `parentalPins(database)` em `tv-web/src/lib/catalog/parentalTables.ts` (data-model.md).
- [X] T006 Implementar `tv-web/src/lib/parental/listPin.ts` (§2: `hasPin`, `verifyPin`, `enableParentalControl`, `changePin`, `disableParentalControl`, `recoverPinWithSource`, `pinActiveHint`, `syncPinHints`) reaproveitando o hash de `pin.ts` sem mudar o esquema (D-003); espelho `ccplay.parental.pinSources` (§3) → contrato: `US3/AC1..AC5…`
- [X] T007 Implementar `tv-web/src/lib/parental/pinMigration.ts` (§4, pseudocódigo) → contrato: `FR-024/SC-005…`
- [X] T008 `tv-web/src/lib/catalog/categoryAccess.ts`: `loadRule` lê `parentalPins.get(sourceId)`; `unlockWithPin` usa `verifyPin(sourceId, pin)` → contratos emendados da 066.
- [X] T009 `tv-web/src/lib/catalog/sourceRepository.ts`: `deleteSource` apaga `parentalPins` da lista e tira o id do espelho (FR-025) sem crescer o arquivo (teto 409, R-002) → contrato: `US3/AC1..AC5…`
- [X] T010 Remover as funções globais de `tv-web/src/lib/parental/pin.ts` e migrar **todos** os chamadores para `listPin.ts` com o `sourceId` certo (tabela de `logic/pin-por-lista.md` §5): `components/ParentalGate.tsx` (prop `sourceId?`; ausente = abre direto, FR-021), `navigation/routeModules.ts` (`withParentalGate` passa `props.existingSource?.id`), `features/sources/DeleteSourceModal.tsx`, `components/ParentalPinPrompt.tsx` + `components/RecoverPinFlow.tsx` (`sourceId`), `components/LockedCategoryState.tsx` (recebe `sourceId`; troca de prop sem linha nova em `features/live/liveColumns.tsx` e `features/vod/VodCategoryScreen.tsx`), `features/settings/parental/ParentalFlow.tsx`, `features/settings/tabs/ParentalTab.tsx` (por enquanto com `activeSourceId`; a Fase 3 troca o alvo), `features/catalog/categoryAccessApi.ts` (`syncPinHints()` no lugar de `hasPin()`).

### Testes da Fase

- [X] T011 [P] Upgrade real v20→v21 com PIN legado (padrão de `tv-web/src/lib/catalog/db.test.ts`: abre um Dexie com as stores da v20, grava `parentalPin/'pin'` e categorias, reabre como `CatalogDb`) — a lista com categoria bloqueada aceita o PIN antigo antes de qualquer outra leitura.
- [X] T012 [P] Espelho por lista: `pinActiveHint(id)` depois de ligar/desligar/excluir; `syncPinHints` remove a chave antiga `ccplay.parental.pinActive` (em `tv-web/src/lib/parental/listPin.test.ts`).
- [X] T013 [P] `ParentalGate` (adicionar lista não pede PIN; editar lista com PIN pede o dela) e `DeleteSourceModal` (lista sem PIN remove na hora; com PIN pede o dela) — testes de componente ao lado de cada arquivo.

**Critério de Conclusão**: comando do contrato da fase → 2/2 (067) + 1/1 + 3/3 (066 emendados) verdes; travas da 066 e 067 íntegras; `PinPrompt` contrato verde; `npx tsc -b`, `npm run lint` (tetos!) e `npx vitest run src/lib src/components src/features/sources src/navigation` verdes; contratos 023/026 da tela de perfis/Configurações (Excluir sem PIN imediato) verdes.

**Registro da Fase**:

- Status: Concluída (2026-10-10).
- Feito: `lib/catalog/adultCategory.ts` (puro: `normalizeForSearch`, `isAdultCategoryName`, `isSavedLock`; `catalogSearch.ts` e `categoryAccess.ts` reexportam); Dexie v21 em `dbSchema.ts` (`parentalPins: 'sourceId'` + `.upgrade(migrateLegacyPin)`; `parentalPin` mantida); `ParentalListPinRecord`/`parentalPins()` em `parentalTables.ts`; `pin.ts` reduzido ao hash (`hashPin`, `saltedPinHash`) e tipos; `listPin.ts` com a API por lista e o espelho `ccplay.parental.pinSources` (+ `syncPinHints`, que apaga o espelho global); `pinMigration.ts`; `categoryAccess.ts` lê `parentalPins.get(sourceId)` e `unlockWithPin` confere o PIN da lista; `deleteSource` apaga o PIN da lista (409/409, sem crescer). Chamadores: `ParentalGate` (`sourceId?`; sem ele abre direto), `withParentalGate` (passa `existingSource?.id`), `DeleteSourceModal`, `ParentalPinPrompt`/`RecoverPinFlow` (`sourceId`), `LockedCategoryState` (recebe `sourceId`, chama `unlockWithPin` ele mesmo — `liveColumns.tsx`/`VodCategoryScreen.tsx` perderam um import), `ParentalFlow`, `ParentalTab` (ainda com a lista ativa; a Fase 3 troca o alvo), `categoryAccessApi` (`syncPinHints`). `getAdultScope` (FR-035 da 066) não usa PIN — inalterado.
- Contrato: `npx vitest run src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts` → 6/6 verdes (067: 2/2; 066 emendados: 1/1 + 3/3). Travas 067, 066 e 026 íntegras.
- Testes executados: novos `lib/parental/pinMigration.upgrade.test.ts` (upgrade real v20→v21 com o schema lido do próprio `CatalogDb`; banco novo) e `lib/parental/listPin.test.ts` (espelho por lista, realinhamento, armazenamento corrompido) — `npx vitest run src/lib/parental` 10/10. Atualizados para a API por lista, com casos novos: `ParentalGate.test.tsx` (adicionar lista sem PIN mesmo com outra protegida; PIN de outra lista recusado), `RecoverPinFlow.test.tsx` (dados de outra lista não recuperam), `DeleteSourceModal.parental.test.tsx` (PIN em outra lista não pede nada; PIN da outra recusado), `categoryAccessApi.test.tsx`, `categoryAccess.test.ts`, `historico.adulto.test.ts`, `ParentalTab.test.tsx`. `npx vitest run src/lib src/components src/features/sources src/features/catalog src/features/settings src/navigation` → 2081 verdes, 4 vermelhos = só os contratos das Fases 3–4 (esperado); `npx vitest run src/features/profiles src/features/import src/App` 165/165. `npx tsc -b` limpo; `npm run lint` ok (145 imports herdados, avisos antigos).
- Pendências: o texto de recuperação "Os dados não conferem com nenhuma lista cadastrada." ficou impreciso (agora confere só a lista dona do PIN) — ajustar na T023 (textos).

---

## Phase 3: User Story 1 — Configurações da lista (Priority: P1) 🎯 MVP

**Objetivo**: a tela da lista, aberta pelo cartão de perfis, com as 4 abas aplicadas à lista da tela.

**Independent Test**: com A ativa, abrir "Configurar" no cartão de B, esconder uma categoria e limpar o histórico de B; conferir em B e que A não mudou (quickstart 1–7).

### Contrato da Fase

- `abre para uma lista que não é a ativa, … Histórico limpando só ESTA lista` — US1/AC2+AC4, FR-001/002/003/007
- `reabre na aba e ação guardadas (EPG) e entrega aba+ação …` — FR-005, FR-009
- Comando: `npx vitest run src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx`

### Implementation

- [X] T014 [US1] Extrair de `tv-web/src/features/settings/SourcesPanel.tsx` um `SourceInfo` (nome, tipo, "Lista ativa", sincronização, conta, contagens, Modo limitado) e exportar `SourceEpgStatus`, para a linha global e as abas da lista (`logic/navegacao-lista.md` §3).
- [X] T015 [US1] Registro `tv-web/src/features/settings/list/listSettingsTabs.ts` (`account`, `epg`, `parental`, `history`, rótulos i18n) e props de aba com a **lista da tela** + `activeSourceId` separado (D-005, D-006).
- [X] T016 [P] [US1] `tv-web/src/features/settings/list/AccountTab.tsx`: `SourceInfo` + Editar · Ressincronizar · Excluir (lógica vinda de `tabs/SourcesTab.tsx`, inclusive offline e `DeleteSourceModal`); exclusão calcula a vizinha e chama `onSourceDeleted(id, nextFocusId)` (D-009) → contrato: `reabre na aba…` (Editar)
- [X] T017 [P] [US1] `tv-web/src/features/settings/list/EpgTab.tsx`: estado do EPG + botão "Configurar EPG" → `onOpenEpg(source, { tab: 'epg', action: 'open-epg' })` → contrato: `reabre na aba…`
- [X] T018 [US1] `tv-web/src/features/settings/tabs/ParentalTab.tsx` e `tv-web/src/features/settings/tabs/PrivacyTab.tsx` adaptados no lugar (D-012) para agir sobre a lista da tela; chave de consulta do PIN com `sourceId`; sem estados "sem lista ativa" (sempre há lista) → contrato: `abre para uma lista…` (Histórico)
- [X] T019 [US1] Implementar `tv-web/src/features/settings/list/ListSettingsScreen.tsx` (zonas abas/painel sem topbar, título "Configurações da lista" + nome + aviso "só para esta lista", `initialFocus`, RETURN, estado vazio com "Voltar" se a lista não existe — R-009) → contratos da fase.
- [X] T020 [US1] Rota: `AppScreen` `list-settings` e ação `list-settings-deleted` em `tv-web/src/navigation/appNav.ts`; `lazyRoute` em `tv-web/src/navigation/routeModules.ts`; render em `tv-web/src/App.tsx` com `from` guardando `{ tab, action }` para Editar/progresso/EPG — extraindo os cases de Configurações para um módulo em `tv-web/src/navigation/` para caber no teto (R-002).
- [X] T021 [US1] Tela de perfis: "Configurar" no fim de `ACTION_KEYS` e `onConfigureSource?` em `tv-web/src/features/profiles/ProfilesScreen.tsx` (teto 421: compensar no próprio arquivo); App abre `list-settings` com `from` = perfis com `focusSourceId` (FR-012).
- [X] T022 [US1] "Gerenciar" do vazio "todas escondidas": `onOpenSettings('parental')` em `tv-web/src/App.tsx` abre `list-settings` da lista ativa na aba `parental` (D-010).
- [X] T023 [P] [US1] Textos pt/en/es em `tv-web/src/lib/i18n/messages/settings.ts` (título, aviso de escopo da lista, abas, "Configurar", "Configurar EPG", lista inexistente) — nomes da lista nunca traduzidos (FR-027).
- [X] T024 [US1] Catraca: exceções de import novas de `features/settings/list/` em `tv-web/scripts/architecture-baseline.json` à mão, com justificativa no commit, e `node scripts/architecture.mjs --prune` das que ficaram obsoletas (D-012).

### Testes da Fase

- [X] T025 [P] [US1] `tv-web/src/navigation/appNav.test.ts`: abrir/voltar de `list-settings` pelas duas origens; `list-settings-deleted` (lista ativa → perfis base; não ativa → foco na vizinha / "Adicionar lista").
- [X] T026 [P] [US1] `tv-web/src/features/profiles/ProfilesScreen.test.tsx`: a 4ª ação é "Configurar" e chama `onConfigureSource` com a lista focada; contratos 023/037 verdes.
- [X] T027 [P] [US1] Tela da lista: lista inexistente mostra "Voltar" focado; aba Categorias com PIN da lista pede o PIN dela; Excluir chama `onSourceDeleted` com a vizinha (arquivo de teste não-contrato em `tv-web/src/features/settings/list/`).

**Critério de Conclusão**: comando do contrato da fase → 2/2 verdes e trava da 067 íntegra; testes da fase verdes; `npx tsc -b`, `npm run lint`, `npx vitest run src/features src/navigation` verdes; quickstart 1–7 e 10–11 conferidos no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-10), com a conferência manual no navegador pendente (ver Pendências).
- Feito: `SourceInfo`/`SourceEpgStatus` exportados de `SourcesPanel.tsx`; tipos `ListSettingsTabProps`/`ListSettingsTabDefinition` em `tabs/settingsTab.ts`; registro `list/listSettingsTabs.ts`; abas novas `list/AccountTab.tsx` (Editar · Ressincronizar · Excluir, vizinha calculada antes de excluir) e `list/EpgTab.tsx` ("Configurar EPG"); `tabs/ParentalTab.tsx` e `tabs/PrivacyTab.tsx` adaptados no lugar para a lista da tela (sem estados "sem lista ativa", sem topbar). **Antecipado da T028**: as duas abas saíram de `SETTINGS_TABS` e do tipo `SettingsTab` já aqui, porque o tipo de props delas mudou. `list/ListSettingsScreen.tsx` (zonas abas/painel, título + nome + aviso de escopo, `initialFocus`, estado "Lista não encontrada"/carregando com "Voltar" focado). Rota `list-settings` + ação `list-settings-deleted` em `appNav.ts`; `ListSettingsScreen` em `routeModules.ts` e chunk `route-list-settings` em `vite.config.ts` + `CCPlayTv/tizen_web_project.yaml`; cases de Configurações (globais, lista, EPG, TMDB) extraídos para `navigation/settingsRoutes.tsx` (`App.tsx` 618 → 559). Perfis: "Configurar" no fim (`ProfilesScreen.tsx` 421/421, compensado condensando comentários). "Gerenciar" de Live/Filmes/Séries abre a tela da lista ativa na aba `parental`. Textos numa área nova `lib/i18n/messages/listSettings.ts` (pt/en/es; `settings.ts` está no teto) e `parental.recover.mismatch` reescrito para "desta lista". CSS com tokens em `styles/settings.css` (`.settings-scope-note`, `.list-settings-*`). Catraca: 3 exceções novas à mão (`AccountTab` → `importApi`/`DeleteSourceModal`, `ListSettingsScreen` → `importApi`) e a de `PrivacyTab` → `importApi` removida (obsoleta) — 147 imports herdados.
- Contrato: `npx vitest run src/features/settings/list/ListSettingsScreen.configuracoes-lista-global.contract.test.tsx` → 2/2 verdes; travas 067, 066 e 026 íntegras.
- Testes executados: novos `list/ListSettingsScreen.test.tsx` (4: exclusão com a vizinha; "Lista ativa", nomes acessíveis e ←; PIN da própria lista na gestão; entrada sem PIN e ← às abas) e `list/ListSettingsScreen.historico.test.tsx` (migrado de `SettingsScreen.privacidade.test.tsx` com `git mv`; o caso "sem lista ativa" virou "Lista não encontrada"); `ParentalTab.test.tsx` adaptado (lista não ativa; sem topbar); `SettingsScreen.test.tsx` perdeu os 2 testes de Categorias (movidos); `appNav.test.ts` +3 (abrir/voltar pelos perfis, excluir não ativa pelas duas origens, excluir a ativa); `ProfilesScreen.test.tsx` +1 ("Configurar" é a 4ª ação). `npx vitest run src/features src/navigation src/components src/lib/parental src/lib/i18n src/App` → 1665 verdes, 2 vermelhos = só os contratos da Fase 4. `npx tsc -b` limpo; `npm run lint` ok; `npm run build` ok (emite `assets/route-list-settings.js`).
- Pendências: (1) conferência manual no navegador (quickstart 1–7, 10–11) **não feita nesta fase** — vai junto com o roteiro E2E novo da T036, que cobre o mesmo caminho; (2) `App.source-access.test.tsx` falhou 2 vezes numa rodada larga e passou 5/5 isolado — flake sob carga já registrado na 066, aberto; (3) o E2E `categorias-controle-parental.mjs` procura o texto antigo de recuperação ("nenhuma lista cadastrada") — ajustar na T035.

---

## Phase 4: User Story 2 — Configurações globais só com o global (Priority: P2)

**Objetivo**: Configurações sem as abas da lista, com aviso de escopo e a linha de Fontes IPTV só com "Configurar".

**Independent Test**: quickstart 8.

### Contrato da Fase

- `só abas globais, com aviso de escopo; a linha … só "Configurar" …` — US2/AC1+AC2, FR-013/014/015
- Emenda da 026: `SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1)
- Comando: `npx vitest run src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`

### Implementation

- [X] T028 [US2] `tv-web/src/features/settings/tabs/settingsTabs.ts` e `settingsTab.ts`: sem `parental`/`privacy` (D-007); `SettingsFocus` de `sources` com `action: 'configure'`; props legadas mantidas (D-008, R-005).
- [X] T029 [US2] `tv-web/src/features/settings/SourcesPanel.tsx` + `tabs/SourcesTab.tsx`: linha com `SourceInfo` + um botão "Configurar" → `onConfigureSource(source, { zone: 'sources', sourceId, action: 'configure' })`; "Adicionar lista" mantido → contratos da fase.
- [X] T030 [US2] Aviso "Estas configurações valem para todas as listas." em `tv-web/src/features/settings/SettingsScreen.tsx`, com e sem topbar; texto pt/en/es → contrato 067 #5.
- [X] T031 [US2] `tv-web/src/App.tsx` (ou o módulo extraído na T020): `onConfigureSource` abre `list-settings` com `from: { name: 'settings', restore: { zone: 'sources', sourceId, action: 'configure' }, standalone }` (US2/AC3/AC4).
- [X] T032 [US2] Remover código e chaves i18n que ficaram sem uso (`settings.tab.parental`/`settings.tab.privacy` se nada mais as lê; restauração `{ zone: 'panel', tab: 'parental' }`).

### Testes da Fase

- [X] T033 [P] [US2] Atualizar os testes não travados de `tv-web/src/features/settings/` que contavam 7 abas ou usavam as ações da linha (`SettingsScreen.test.tsx`, `SettingsScreen.privacidade.test.tsx` → migrar para a tela da lista, `ParentalTab.test.tsx`, `SourcesPanel.*.test.tsx`) mantendo a intenção de cada um.

**Critério de Conclusão**: comando do contrato da fase → 2/2 verdes; travas 026 e 067 íntegras; contratos 032/054 (`player-reproducao`, `idioma-do-app`, `teste-conexao-tv`) verdes; `npx vitest run src/features/settings` verde.

**Registro da Fase**:

- Status: Concluída (2026-10-10).
- Feito: `SourcesPanel.tsx` — a linha ficou com `SourceInfo` + um único "Configurar" (`onActivateRow(rowId)`; saíram `SOURCES_ACTION_COUNT`, `focusedCol`, `resyncPending`, `deletePending`, `offline`); `tabs/SourcesTab.tsx` reescrita só com navegação por linha (sem modal, mutações nem `useOnlineStatus`), ← sempre volta às abas, → não sai da linha; `SettingsFocus` de `sources` só com `action: 'configure'`; aviso `listSettings.globalScope` ("Estas configurações valem para todas as listas.") em `SettingsScreen.tsx`, com e sem topbar (`.settings-scope-note--lone` quando não há título acima). T031 já estava ligada na Fase 3 (`navigation/settingsRoutes.tsx` → `openListSettings` com `from` = Configurações e `restore` na linha). T032: `PrivacyPanel` perdeu o ramo "sem lista ativa" (a tela da lista sempre tem lista); chaves removidas nos 3 idiomas — `settings.tab.parental`, `settings.tab.privacy`, `settings.sources.epg`, `settings.privacy.noList`, `parental.noSource`; catraca: saíram a exceção `SourcesTab` → `DeleteSourceModal` e o teto de `messages/settings.ts` baixou para 470 (146 imports herdados). Props legadas (`onEditSource`, `onResyncStarted`, `onSourceDeleted`, `onOpenEpg`) continuam em `SettingsNavigation`/`SettingsScreenProps` (D-008, contratos 032/054).
- Contrato: `npx vitest run src/features/settings/SettingsScreen.configuracoes-lista-global.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` → 2/2 verdes (067 #5 e a emenda da 026); contratos 032/054/062 verdes na mesma rodada; travas 067, 066 e 026 íntegras.
- Testes executados: `SettingsScreen.test.tsx` — o bloco Editar/Ressincronizar/EPG virou 4 testes de "Configurar" (entrega lista+foco, nada mais dispara, restaura o foco por id, aviso de escopo com/sem topbar, tolera ausência de `onConfigureSource`); `list/ListSettingsScreen.test.tsx` ganhou Editar, Ressincronizar (job; pendente), offline (soft disabled com o motivo) e "Configurar EPG" — 8/8; removido `SourcesPanel.offline.test.tsx` (coberto pelo teste offline da aba Conta); `SourcesPanel.account/counts`, `SettingsPanels.foco-sem-escala`, `useSourceSyncing`, `appNav` ajustados às props novas. `npx vitest run src/features src/navigation src/components src/lib src/App` → 509 arquivos, 3012 testes verdes. `npx tsc -b` limpo; `npm run lint` ok.
- Pendências: nenhuma nesta fase. Seguem abertas as da Fase 3 (conferência manual no navegador junto do E2E da T036; flake de `App.source-access` só sob carga; texto do E2E da 066).

---

## Phase 5: User Story 3 — PIN por lista nas telas (Priority: P3) + Polish

**Purpose**: fechar o fluxo de PIN por lista nas telas, ajustar E2E, docs e gates finais.

- [X] T034 [US3] Conferir no navegador o quickstart 9 (ligar/trocar/desligar por lista, sugestão só da lista, "Esqueci o PIN" da própria lista, adicionar lista sem PIN) e 12 (migração com um perfil do navegador que tenha a 066).
- [X] T035 Ajustar os roteiros E2E de R-007 ao caminho novo (`tv-web/e2e/epg-dados-agora.mjs`, `home-busca-configuracoes.mjs`, `limpar-historico.mjs`, `categorias-controle-parental.mjs`, `fontes-estado.mjs`, `carga-listas.mjs`, `ime-formularios.mjs`, `metadata-tmdb.mjs`, `semelhantes-elenco-ator.mjs`, `trailers.mjs`, `paridade-limpeza.mjs`), mantendo o que cada um verifica. Em `categorias-controle-parental.mjs`, medir as teclas do SC-004 da 066: se passar de 16, **parar e perguntar ao usuário** (R-004).
- [X] T036 Roteiro novo `tv-web/e2e/configuracoes-lista-global.mjs` (registrar em `tv-web/e2e/run.mjs` se a suíte exigir): cartão → Configurar → abas → esconder/limpar em lista não ativa → RETURN com foco; Fontes IPTV → Configurar → RETURN; PIN de A não vale em B.
- [X] T037 Revisão de segredos (constitution): nenhum PIN/hash/DNS/usuário/senha/URL em log, toast, tela, mensagem de erro ou `localStorage` (só ids).
- [X] T038 Gates finais: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen` (conferir se surgiu chunk novo a listar em `CCPlayTv/tizen_web_project.yaml`), `npm run test:e2e` completo; travas 026/066/067 íntegras e as das outras features (023, 032, 037, 054, 062) intactas.
- [X] T039 Docs: nota `**Emenda (067):**` em `sdd/specs/066-categorias-controle-parental/spec.md` (FR-011, FR-015, FR-017, FR-019, FR-022, FR-027) e na 026 (FR da linha de Fontes IPTV); `CLAUDE.md` só se uma regra permanente mudou (ex.: a frase "PIN um por aparelho", se existir) — sem parágrafo de status.

### Checklist de Release

- [X] Fase 1 (emendas dos contratos) concluída
- [X] Fase 2 (PIN por lista e migração) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3 + Polish) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 067, 066 e 026
- [X] Lint (tetos e imports), tipos, unitários, build e build Tizen verdes
- [X] `npm run test:e2e` completo verde (com `npm run dev` rodando)
- [X] `quickstart.md` executado no navegador
- [X] Revisão de segredos feita
- [ ] TV física (recomendada, não gate): D-pad nas abas novas, PIN por lista com teclas numéricas, migração com a 066 instalada

**Registro da Fase**:

- Status: Concluída (2026-10-10), exceto a passada na TV física (recomendada, não é gate — único item aberto do checklist).
- Feito: **T034** — o quickstart foi percorrido no Chromium pelo roteiro novo e por capturas de tela (globais, Conta, Categorias, EPG; ver Pendências para o que ficou fora); a migração (quickstart 12) foi provada em IndexedDB real com um banco v20 criado na hora (script descartável: `verno` 21, PIN antigo vale na lista com bloqueio, outro PIN não, lista sem bloqueio sem PIN, tabela antiga vazia). Achado visual corrigido: o rótulo "Categorias & controle parental" saía cortado na coluna de abas → coluna da tela da lista alargada (`.list-settings-screen .settings-body .side-category-nav`, 4×`--space-7`). **T035** — ajustados 7 roteiros: `home-busca-configuracoes` (excluir pela tela da lista, foco na vizinha), `fontes-estado` (Ressincronizar via Configurar), `carga-listas` (idem), `epg-dados-agora` (aba EPG › "Configurar EPG", foco volta ao botão), `limpar-historico` (aba Histórico; globais sem Privacidade), `ime-formularios` (EPG pela tela da lista + RETURN extra), `categorias-controle-parental` (caminho Configurar → Categorias, texto de recuperação, "adicionar lista não pede PIN" e "editar pede o PIN dela"); `metadata-tmdb`, `semelhantes-elenco-ator` e `trailers` já passavam sem mudança; `paridade-limpeza` **não** foi tocado nem rodado (ferramenta de evidência histórica da 028, fora da suíte, que grava em `sdd/specs/028`; a tela 08 mudou de propósito). **SC-004 da 066 medido: 14 teclas (≤ 16)** — não estourou, nada a perguntar (R-004). **T036** — `e2e/configuracoes-lista-global.mjs` (registrado em `run.mjs`): duas listas M3U fictícias; globais só com 5 abas + aviso; linha só com "Configurar"; tela de uma lista não ativa (título, aviso, abas, só as categorias dela); esconder sem tocar a ativa; RETURN com foco na linha; "Gerenciar categorias" do vazio → tela da lista ativa na aba Categorias (D-010); PIN por lista (o de uma não vale na outra, a outra segue sem PIN); cartão → "Configurar" em 5 teclas (SC-001) → RETURN com foco no cartão; adicionar lista sem PIN; nenhum PIN no console. **T037** — revisão de segredos: nenhum `console`/`logger`/`throw` nos arquivos de PIN e da tela da lista; espelho em `localStorage` guarda só ids de lista; telas novas sem DNS/usuário/senha/URL; o E2E confere o console. **T038** — gates abaixo. **T039** — nota `FR-036` (emenda 067) na spec da 066, `FR-025` (emenda 067) na spec da 026, README (Histórico/Categorias por lista, PIN por lista, nova seção "Configurações da lista × globais"), uma frase no `CLAUDE.md`; SC-001 da 067 emendado para 5 teclas por decisão do usuário (R-008). Também: texto do vazio "todas escondidas" e comentários que ainda citavam o caminho antigo.
- Contrato: 5/5 da 067 + 3 emendados (026/066) + `PinPrompt` verdes na suíte completa (`npm run test`); `check-contract-tests.ps1` íntegro nas **48** travas do repositório (0 com problema).
- Testes executados: `npx tsc -b` limpo; `npm run lint` ok (146 imports herdados, 17 avisos antigos); `npm run test` → 527 arquivos, 3164 testes verdes; `npm run build` e `npm run build:tizen` ok — o guard recusou na primeira vez e pediu `assets/SourcesPanel.js` e `assets/onlineStatus.js` (chunks compartilhados novos), já acrescentados a `CCPlayTv/tizen_web_project.yaml` junto de `route-list-settings.js`; `npm run test:e2e` → **45/45** scripts verdes (236 s, 3 em paralelo); depois dos últimos ajustes de texto e do cenário D-010, `configuracoes-lista-global` repetido verde, e `tsc`/`lint` e 946 testes de `i18n`/`components`/`live`/`vod`/`settings` verdes de novo.
- Pendências: (1) passada na **TV física** (D-pad nas abas novas, PIN por lista com teclas numéricas, migração com a 066 instalada na TV) — não feita; (2) fora do roteiro automatizado: "excluir a lista **ativa** pela tela dela" (só nos testes do redutor/`appNav`) e o **espelho do PIN no armazenamento real do aparelho**; (3) o `categorias-controle-parental.mjs` ainda mede o SC-004 pela via de Configurações (14 teclas) — a via curta por OK longo na trilha segue não adotada (R-014 da 066); (4) flake conhecido e já registrado da 066: `App.source-access.test.tsx` só sob carga (passou nas rodadas completas desta fase).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: depende da 066 convergida.
- **Fase 2**: depende da Fase 1 — BLOQUEIA as Fases 3–5.
- **Fase 3 (US1)**: depende da Fase 2.
- **Fase 4 (US2)**: depende da Fase 3 (o "Configurar" da linha abre a tela da lista; T031 usa a rota da T020).
- **Fase 5**: depende das Fases 3–4.

### Parallel Opportunities

- T004 com T005; T011–T013 entre si; T016, T017 e T023 entre si; T025–T027 entre si.

---

## Implementation Strategy

### MVP First

1. Fases 1–2 → PIN por lista com os contratos de dados verdes.
2. Fase 3 → tela da lista pelos perfis. **Parar e validar** (quickstart 1–7).

### Incremental Delivery

1. Fase 4 → globais limpas.
2. Fase 5 → E2E, docs, gates.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada task ou grupo coerente; nunca editar arquivo travado fora da T002.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 6: Convergence

**Purpose**: lacunas achadas pelo `sdd-converge` de 2026-10-10 (a implementação cobre FR-001..FR-008 e FR-010..FR-027; contratos 11/11 verdes e as 3 travas íntegras). Nenhuma toca arquivo travado.

- [X] T040 [MEDIUM] Resolver o caso "Ressincronizar → progresso → Voltar" do **FR-009/SC-006** (origem: FR-009, SC-006, edge case "Foco de volta de Editar/Ressincronizar/EPG"). Hoje o "Voltar"/RETURN do progresso vai à tela de perfis (`App.tsx` liga `onBack` a `import-back`, regra da 037 FR-039; `returnTo` em `appNav.ts:71` é só tipo, sem uso) — igual ao fluxo antigo de Configurações, mas contra o texto da spec. **Parar e perguntar ao usuário** (`AskUserQuestion`), recomendando (A): emendar FR-009/SC-006/edge case da `spec.md` por nota de emenda ("o progresso fica de fora; seu Voltar leva aos perfis, por 037 FR-039") e registrar `R-0XX` em `plan.md`, sem mexer em código nem em contratos da 034/037; alternativa (B): implementar o retorno do progresso à tela da lista (`returnTo: 'back'` quando aberto por Configurações da lista), com teste e checagem dos contratos travados da 034/037 antes de editar qualquer coisa.
- [X] T041 [LOW] Remover a chave sem uso `listSettings.configureNamed` nos três idiomas em `tv-web/src/lib/i18n/messages/listSettings.ts` (origem: FR-027; `unrequested`) e rodar `npx vitest run src/lib/i18n` + `npx tsc -b`.
- [X] T042 [LOW] Cobertura do SC-006/US1-AC5: em `tv-web/e2e/configuracoes-lista-global.mjs`, acrescentar (a) Editar → RETURN volta à tela da lista na aba "Conta & lista" com "Editar" focado e (b) excluir a lista **ativa** pela tela dela cai nos perfis sem lista ativa e sem tela em branco (origem: SC-006, US1/AC7); rodar o roteiro e `npm run test:e2e -- --only configuracoes-lista-global`.

**Critério de Conclusão**: T040 decidido e registrado (spec/plan, ou código + testes + travas 034/037 íntegras); `npx tsc -b`, `npm run lint` e `npm run test` verdes; o roteiro novo verde com as duas asserções; travas 067, 066 e 026 íntegras.

**Registro da Fase**:

- Status: Concluída (2026-10-10).
- Feito: **T040** — decisão do usuário, opção A: o progresso da ressincronização fica fora do FR-009/SC-006; o "Voltar" dele leva à tela de perfis (037 FR-039), como no fluxo antigo de Configurações. Nota de emenda no edge case, no FR-009 e no SC-006 da `spec.md`, pergunta registrada em Clarifications e `R-010` em `plan.md`; nenhum código nem contrato mexido. **T041** — chave `listSettings.configureNamed` removida nos 3 idiomas. **T042** — `e2e/configuracoes-lista-global.mjs` ganhou (a) Editar → RETURN volta à tela da lista na aba "Conta & lista" com "Editar" focado e (b) excluir a lista **ativa** pela tela dela (com o PIN dela) cai nos perfis como base, sem topbar, sem a tela da lista aberta, "Sala" fora e "Quarto" mantida.
- Contrato: sem contrato novo; as travas 067, 066 e 026 íntegras — e as 48 travas do repositório sem problema.
- Testes executados: `npx tsc -b` limpo; `npm run lint` ok (146 imports herdados); `npm run test` → 527 arquivos, 3164 testes verdes; roteiro novo verde 2 vezes seguidas; `npm run test:e2e -- --only configuracoes-lista-global,categorias-controle-parental,home-busca-configuracoes,fontes-estado` → 4/4.
- Pendências: só a passada na TV física (recomendada, não é gate), que continua aberta na Fase 5.
