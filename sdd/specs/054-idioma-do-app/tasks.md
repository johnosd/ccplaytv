---
description: "Tasks da feature 054 — Idioma do app"
---

# Tasks: Idioma do app

**Input**: `sdd/specs/054-idioma-do-app/` (spec.md, plan.md, `logic/idioma-do-app.md`, quickstart.md)

**Organization**: por user story; a US1 (interface) é dividida por área de tela para entregar e validar em partes.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Frontend em `tv-web/` (todo caminho abaixo é relativo a ele). Código em `src/`, E2E em `e2e/`.
- Catálogos: `src/lib/i18n/messages/{pt,en,es}.ts` — **uma chave nova entra nos TRÊS arquivos na mesma task** (o contrato de completude e o `tsc` exigem).
- Regra de migração de uma área: texto próprio → `t('chave')`; texto do provedor intocado; helper puro recebe `t`; `aria-label` e toasts inclusos; default `pt` mantém **todos os testes antigos verdes sem editá-los** (se um precisar de `t`, use o padrão `translate('pt', …)` — R-006).

---

## Phase 1: Setup — registrar o ajuste de trailers já feito

**Purpose**: o ajuste "trailer na língua do usuário com fallback" existe no working tree (2026-10-03, sem commit) e entra no plano aqui.

- [X] T001 Conferir que o working tree contém o ajuste de trailers (`src/lib/trailer/trailerCandidates.ts` com `preferredLanguage` e rank idioma→inglês→resto; `src/lib/metadata/tmdbLookup.ts` com `videoLanguages`; `src/lib/metadata/titleMetadata.ts`; `src/lib/player/playerPreferences.ts`; linha em `src/features/settings/playerPreferencesModel.ts`; testes ajustados) e rodar `npx vitest run src/lib/trailer src/lib/metadata src/lib/player src/features/settings` verde; commitar **só esses arquivos** (R-008). Não mexer no resto do `git status` (mudanças de outras features em andamento).

**Checkpoint**: baseline de trailers registrado.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T001 — ajuste de trailers conferido no working tree (rank idioma→inglês→resto, `include_video_language` com o idioma preferido, linha no Player) e suíte da área verde. O commit isolado NÃO foi feito (o skill só commita a pedido). Arquivos a commitar juntos: `tv-web/src/lib/trailer/trailerCandidates.ts` e `.test.ts`, `tv-web/src/lib/metadata/tmdbLookup.ts`, `tv-web/src/lib/metadata/titleMetadata.ts`, `tv-web/src/lib/player/playerPreferences.ts` e `.test.ts`, `tv-web/src/features/settings/playerPreferencesModel.ts`, `tv-web/src/features/settings/PlayerTab.test.tsx`. NÃO incluir `lib/metadata/types.ts` (já importa o stub de `lib/i18n`, ainda não rastreado).
- Contrato: sem contrato nesta fase (os 5 contratos seguem vermelhos como previsto; trava íntegra)
- Testes executados: `npx vitest run src/lib/trailer src/lib/metadata src/lib/player src/features/settings` → 426 passam; só falham os 2 contratos de metadata da Fase 10 (esperado)
- Pendências: commit do ajuste de trailers (decisão do usuário)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o núcleo do i18n. Bloqueia todas as stories.

### Contrato da Fase

- `FR-011/FR-012/US5: gravado vence; …` e `FR-004/SC-001: en e es …` (em `src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts`)
- Comando: `npx vitest run src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts`

### Implementation

- [X] T002 [P] Ler `logic/idioma-do-app.md` §1–§3; confirmar `src/lib/i18n/languages.ts` (já real) e acrescentar `appLanguageLocaleTag`/helpers só se necessário.
- [X] T003 Implementar `resolveAppLanguage`, `readAppLanguage`, `writeAppLanguage` e `subscribeAppLanguage` em `src/lib/i18n/appLanguage.ts` (molde de `src/lib/motionPreference.ts`; legado só leitura) → contrato: `FR-011/FR-012/US5…`
- [X] T004 Criar `src/lib/i18n/translate.ts`: `translate(language, key, params?)` com fallback a `pt`, `{marcadores}`, `plural(language, key, n)` por `Intl.PluralRules`; tipar `MessageKey` a partir de `messages/pt.ts` e passar `en`/`es` a `Record<MessageKey, string>`.
- [X] T005 Transformar `src/lib/i18n/I18nProvider.tsx` em provedor real (`useSyncExternalStore(subscribeAppLanguage, readAppLanguage)`, contexto `{language, t}`, `document.documentElement.lang`) e exportar `useT()`/`useLanguage()`; envolver em `src/main.tsx` (por dentro de `Stage`, em volta do `QueryClientProvider`) e nos testes que renderizam telas sem o provedor (`useT()` fora de provedor usa `pt` — não lança).
- [X] T006 Chaves iniciais: completar `settings.language.*`, `settings.reducedMotion.*` nos três catálogos → contrato: `FR-004/SC-001…`

### Testes da Fase

- [X] T007 [P] `src/lib/i18n/translate.test.ts`: fallback a pt, marcadores, plural em pt/en/es, chave ausente nunca vazia.
- [X] T008 [P] `src/lib/i18n/I18nProvider.test.tsx`: troca re-renderiza consumidores, `lang` do `<html>`, fora de provedor = pt.

**Critério de Conclusão**: `npx vitest run src/lib/i18n` → 2 contratos verdes + testes novos; `check-contract-tests.ps1 -Slug 054-idioma-do-app` íntegro; `npx tsc -b` limpo.

**Checkpoint**: núcleo pronto.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T002–T008. `appLanguage.ts` real (resolução gravado > legado > sistema > pt; `sessionOverride` só quando a gravação falha; `subscribeAppLanguage`, `resetAppLanguageForTests`), `translate.ts` (`buildTranslate`, `translate`, `createTranslator` com um Translator por idioma, plural), `I18nProvider.tsx` (`useLanguage`/`useT` por `useSyncExternalStore`, **sem contexto** — ver R-009; o provedor só mantém `<html lang>`), `main.tsx` envolvido, catálogos com 2 chaves, `setupTests*.ts` fixando `navigator` em pt-BR (R-010).
- Contrato: `npx vitest run src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts` → 2/2 verdes; trava íntegra
- Testes executados: `npx tsc -b` limpo; `npm run lint` só warnings pré-existentes; `npx vitest run src/lib/i18n` → 12/12 (translate 6, provider 4, contrato 2); suíte completa `npx vitest run` → 2483 ok, só falham os 3 contratos das Fases 3 e 10 (esperado)
- Pendências: E2E existentes abrem o Chromium em en-US e passarão a detectar inglês — ajustar `locale: 'pt-BR'` nos `newContext()` ao rodar o primeiro E2E (R-010)

---

## Phase 3: User Story 1 — Escolher o idioma e ver a interface trocar (Priority: P1) 🎯 MVP

**Objetivo**: a linha "Idioma" funciona; a própria aba de Configurações já troca de idioma.

**Independent Test**: em Configurações → Acessibilidade & sistema, escolher English: a aba (e a barra lateral de abas) passa a inglês na hora; reabrir mantém.

### Contrato da Fase

- `US1/AC1+AC2, FR-003: escolher English troca a interface na hora…` (em `src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx`)
- Comando: `npx vitest run src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx`

### Implementation

- [X] T009 Extrair o seletor (`Modal` + `radiogroup`) de `src/features/settings/tabs/PlayerTab.tsx` para um componente compartilhado em `src/features/settings/` (D-009) e usá-lo nos dois lugares.
- [X] T010 `src/features/settings/AccessibilityPanel.tsx` + `tabs/AccessibilityTab.tsx`: linha **índice 1** "Idioma" (valor = nome nativo de `APP_LANGUAGE_NATIVE_NAME`), `ACCESSIBILITY_ROW_COUNT` = 5, mocks nos índices 2..4; OK abre o seletor, OK no item grava com `writeAppLanguage`, RETURN fecha sem gravar, foco volta à linha → contrato: `US1/AC1+AC2…`
- [X] T011 Remover a linha "Idioma preferido (trailers)" e o campo `preferredLanguage` de `src/features/settings/playerPreferencesModel.ts` e `src/lib/player/playerPreferences.ts` (D-008; o legado é lido por `resolveAppLanguage`); restaurar a contagem de 4 linhas em `PlayerTab.test.tsx` e `playerPreferences.test.ts`.
- [X] T012 Migrar para `t()` o texto da tela de Configurações inteira: `src/features/settings/SettingsScreen.tsx`, `SettingsPanels*.tsx`, `tabs/*` (Integrações, Fontes, Player, Acessibilidade, Perfis & parental, Privacidade, Sobre), `IntegrationsPanel.tsx`, `EpgSettingsScreen.tsx`, `PlayerPreferencesPanel.tsx`, `playerPreferencesModel.ts` (rótulos), `src/lib/comingSoon.ts` (D-012) e catálogos en/es.
- [X] T013 Atualizar os testes antigos afetados (R-004): `SettingsPanels.foco-sem-escala.test.tsx`, `SettingsPanels.test.tsx`, `SettingsScreen.test.tsx`, `PlayerTab.test.tsx` — **nunca** os arquivos `*.contract.test.*` travados (026/041): se um deles quebrar, parar e reportar.

### Testes da Fase

- [X] T014 [P] `src/features/settings/SettingsScreen.idioma.test.tsx`: RETURN no seletor não grava; trocar para es e voltar a pt restaura os textos; estado de erro/vazio da aba tem elemento focável em en.

**Critério de Conclusão**: `npx vitest run src/features/settings` verde (incluindo o contrato) e `check-contract-tests.ps1` íntegro; Configurações 100% traduzível; `PlayerTab` com 4 linhas de volta.

**Checkpoint**: US1 funcional na aba de Configurações.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T009–T014. Catálogo reorganizado em **áreas** (`messages/area.ts` + `common|comingSoon|player|settings.ts`; `pt/en/es.ts` só juntam — `areas.test.ts` confere chaves únicas). `OptionPickerModal` compartilhado; linha "Idioma" (índice 1) em Acessibilidade; `PlayerTab` sem a linha de trailers e `preferredLanguage` removido de `PlayerPreferences`; `titleMetadata.ts` lê `options.language ?? readAppLanguage()`. Configurações inteira em `t()` (SettingsScreen, abas, painéis, IntegrationsPanel/Tab/Model, RemoveTmdbKeyModal, TmdbKeyScreen, SourcesPanel/Tab, PrivacyPanel/Tab/Model, EpgSettingsScreen, AboutPanel, ComingSoonPanel). Helpers `comingSoonMessage`/`comingSoonToast`; `ASPECT_LABEL_KEY`/`QUALITY_PREFERENCE_LABEL_KEY`; `languageOptionsFor`/`languageDisplayName` em `tracks.ts`; `buildAspectPanel`/`buildQualityPanel` com `t` opcional (padrão pt).
- Contrato: `npx vitest run src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx` → 1/1 verde (com os 2 de `appLanguage`: 3/5 verdes); trava íntegra
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/settings src/lib/i18n src/features/home src/lib/player src/components` → verdes (novos: `SettingsScreen.idioma.test.tsx` 4, `areas.test.ts` 2; ajustados: `SettingsPanels*.test.tsx`)
- Pendências: textos ainda em pt que **dependem de outras fases**: `formatEpgStatus`/`epgErrorMessage` (EPG, Fase 8), `LimitedModeNotice`/`DeleteSourceModal`/`HistoryRemovalModal` (Fase 8), `TextField`/`Button`/`Modal` internos (Fase 4), nomes de idioma em `trackLabel` (Fase 7). `HomeContent` só migrou o dock do TMDB. Ordem: `plural()` usa "singular só para exatamente 1" (não `Intl.PluralRules`) para manter "0 títulos"; ver R-011

---

## Phase 4: US1 — migração: casca, Início e componentes compartilhados (Priority: P1)

**Objetivo**: nada em português no shell nem nos blocos reutilizados.

- [X] T015 [US1] `src/components/`: `Button`, `Chip`, `EmptyState`, `ErrorState`, `OfflineBanner`, `ComingSoon`, `Modal`, `AnnouncerRegion`, `ContentCard` e demais com texto próprio; `src/lib/errors/*` (mensagens sanitizadas, sem interpolar URL/credencial).
- [X] T016 [P] [US1] `src/features/shell/*` (topbar, relógio, dock), `src/features/home/*`, `src/features/splash/*`, `src/features/profiles/*`.
- [X] T017 [P] [US1] Catálogos en/es das chaves acima; `src/lib/i18n/messages/*`.

### Testes da Fase

- [X] T018 [P] [US1] `src/features/shell/Shell.idioma.test.tsx` (en/es: textos-chave da topbar e do Início; estado vazio focável).

**Critério de Conclusão**: `npx tsc -b`; `npx vitest run src/components src/features/shell src/features/home src/features/profiles` verde; contrato de completude verde.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T015–T018. Áreas novas `components`, `errors` (18 códigos × título/descrição/ação em pt/en/es), `shell`, `home`, `profiles`. `errorCatalog.describeError(code, t = pt)` (só `retryable` ficou na tabela de código). Migrados: `OfflineBanner`, `ComingSoon` (usa `comingSoonMessage`, com fallback à mensagem do registro quando o id não tem chave), `ChannelRow`, `TextField` (Mostrar/Ocultar + substantivo), `Spinner`, `TopBar`, `ExitModal`, `HomeContent`, `HomeScreen` (hints), `homeStatusLine`/`formatAge` (com `t`), `SplashScreen`, `ProfilesScreen`. Sem texto próprio (nada a migrar): `Button`, `Chip`, `EmptyState`, `ErrorState` (recebem o texto por props), `Modal`, `Toast`, `Rail`, `SeeAllCard`, `Tabs`, `SideCategoryNav`, `ContentCard`, `AnnouncerRegion`, `Skeleton`, `Stage`. Exceção justificada: `PerfOverlay`/`ImeProbeOverlay` são sondas de medição/diagnóstico de desenvolvimento (só com flag de build), fora do uso da pessoa.
- Contrato: completude `appLanguage.idioma-do-app.contract.test.ts` verde (2/2 com a resolução); trava íntegra
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/shell src/features/home src/features/profiles src/features/splash src/components src/lib/errors src/lib/i18n src/features/settings` → 611 verdes (novos: `Shell.idioma.test.tsx` 5; `areas.test.ts` agora cobre as 9 áreas)
- Pendências: `formatType`/`sourceAlertChips`/`formatEpgStatus`/`LimitedModeNotice`/`DeleteSourceModal` usados pela tela de perfis seguem em pt até a Fase 8; `liveColumns`/`VodCategoryScreen`/`connectionBanner`/`playbackDiagnosis` ainda chamam `describeError(code)` sem `t` (Fases 5–7); `clock.ts` (formato da hora) na Fase 12

---

## Phase 5: US1 — migração: Live TV, EPG e guia (Priority: P1)

- [X] T019 [US1] `src/features/live/*` (`LiveScreen`, `liveColumns`, hooks `useLive*`, guia), `src/lib/epg/*` (mensagens; **horário** fica para a Fase 12), `src/components/ChannelRow.tsx`.
- [X] T020 [P] [US1] Catálogos en/es.

### Testes da Fase

- [X] T021 [P] [US1] `src/features/live/LiveScreen.idioma.test.tsx` (en: rail de categorias fixas "Favorites"/"History"/"All", estados de erro).

**Critério de Conclusão**: `npx vitest run src/features/live src/lib/epg` verde; nomes de canal/categoria **inalterados** (SC-005).

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T019–T021. Área `live` (chaves `live.*` e `guide.*`). `liveColumns.tsx` (funções planas) recebe `t` no modelo (`LiveShellModel.t`/`LiveColumnsModel.t`), `LiveScreen`/`useLiveZapping`/`EpgGuide` com `useT()`. `liveHints(t)` substitui `LIVE_HINTS`; `liveGroupDisplay(name, t)` traduz só o rótulo do app "Sem categoria" (a constante `UNGROUPED_LABEL`, identidade estável de chaves/foco, não muda) e nomes do provedor ficam intactos (SC-005). Seletor de lista do guia usa o mesmo rótulo.
- Contrato: sem contrato nesta fase (trava íntegra; 3/5 verdes)
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/live src/lib/epg src/lib/i18n` → 278 verdes (novo: `Live.idioma.test.tsx` 3)
- Pendências: `lib/epg/epgStatus.ts` (mensagens de erro do EPG, usadas por `epgErrorMessage`/`formatEpgStatus`) e `epgRepository.ts` (mensagem de endereço inválido) ficam na Fase 8 junto com `sourceFormat`; horário do guia (`formatEpgTime.ts`, `toLocaleTimeString('pt-BR')`) na Fase 12; `FavoritesEmptyState`/`FavoritesUnresolvedNote` (usados pela Live) na Fase 8

---

## Phase 6: US1 — migração: Filmes, Séries, vitrine e detalhe (Priority: P1)

- [X] T022 [US1] `src/features/movies/*`, `src/features/series/*`, `src/features/vod/*` (`VodShowcaseScreen`, `VodCatalogScreen`, `DetailMetadata`, `trailerAction.ts` recebendo `t`, ordenação: **só rótulos**, não a ordem), `src/features/person/*`.
- [X] T023 [P] [US1] Catálogos en/es; nomes de gênero **do provedor** intocados.

### Testes da Fase

- [X] T024 [P] [US1] `src/features/vod/Vod.idioma.test.tsx` (es: rótulos da vitrine, botão de trailer, estados vazio/erro focáveis).

**Critério de Conclusão**: `npx vitest run src/features/movies src/features/series src/features/vod src/features/person` verde.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T022–T024. Áreas `vodCategory`, `vodShowcase`, `detail` (detalhe, elenco, semelhantes, trailer, contagem do próximo episódio, página de ator). Migrados: `VodCategoryScreen`, `VodShowcaseScreen`, `vodShowcaseRows` (`buildShowcaseRows(input, t)`), `vodSort` (`VOD_SORT_LABEL_KEYS`), `vodGroupDisplay(name, t)` e `groupLabelDisplay`, `MovieDetailScreen`, `SeriesDetailScreen`, `episodeNavigation.groupBySeason(episodes, t)`, `DetailMetadata`, `detailMetadataFormat.metadataFactRows(view, perEpisode, t)`, `SimilarPanel` (`NOT_FOUND_KEY`/`FOUND_KEY`), `TitleSummaryModal`, `trailerAction` (label/toast com `t`), `trailerCandidates.trailerButtonLabel(candidate, t)` (idioma só aparece quando ≠ idioma do app — o aviso de fallback; contrato 033 intacto com `t` padrão pt), `PersonScreen`, `NextEpisodeCountdown`. `tracks.languageDisplayName` ganhou fallback por `Intl.DisplayNames` para códigos fora da tabela.
- Contrato: sem contrato nesta fase (trava íntegra; só os 2 de metadata da Fase 10 seguem vermelhos); contratos 033/035/053/052 dessas telas verdes
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/vod src/features/movies src/features/series src/features/person src/lib/trailer src/lib/i18n src/lib/player src/lib/metadata src/components` → 985 verdes + os 2 contratos futuros (novo: `Vod.idioma.test.tsx` 5)
- Pendências: `TrailerLayer` (camada do player de trailer) e `HistoryRemovalModal`/`FavoritesState` usados nestas telas ficam nas Fases 7 e 8; chaves `live.*` reaproveitadas por Filmes/Séries (estados de categoria/busca) — decisão de reuso, não duplicação; `formatShortDate` do detalhe do filme já usa o locale do idioma (adiantou parte da Fase 12)

---

## Phase 7: US1 — migração: Player e painéis (Priority: P1)

- [X] T025 [US1] `src/components/PlayerChrome.tsx`, `PlayerChoicePanel.tsx`, `PlayerErrorInfoPanel.tsx`, `PlayerInfoPanel.tsx`, `PlayerLayer.tsx`, `src/components/player/*` (`usePlayerPanels`, `playerPanels`, chrome), `TrailerLayer.tsx`, `src/lib/player/*` (diagnóstico de erro, rótulos de qualidade/aspecto em `viewChoice.ts`).
- [X] T026 [US1] `src/lib/player/tracks.ts`: **nomes** dos idiomas de áudio/legenda acompanham o idioma do app; `LANGUAGE_OPTIONS` e preferências de áudio/legenda continuam independentes (FR-013).
- [X] T027 [P] [US1] Catálogos en/es.

### Testes da Fase

- [X] T028 [P] [US1] `src/components/PlayerLayer.idioma.test.tsx` (trocar o idioma com a reprodução ativa não chama `stop`/reinicia a sessão — FR-014; painel de erro em en/es).

**Critério de Conclusão**: `npx vitest run src/components src/lib/player` verde (contratos 020/027/029/041/042 intactos); sem segredo em mensagem.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T025–T028. Área `playerUi` (chrome, mensagens, erro, info, faixas, trailer). `playerMessages.ts` virou só CHAVES (`*_KEY`); `chromeControls(…, features, t)`, `playerPanels` (`buildTracksPanel`/`buildInfoRows` com `t`; constantes `NO_*`/`*_MESSAGE` seguem exportadas em pt a partir do catálogo, para os testes antigos), `playerViewPanels` (título traduzido), `PlayerLayer`/`PlayerChrome`/`PlayerErrorInfoPanel`/`PlayerInfoPanel`/`PlayerTracksPanel`/`TrailerLayer` com `useT`, hooks `usePlayerChrome/Keyboard/Panels/Session` com `t`, `playbackDiagnosis(…, t)`, `trailerErrorMessage(error, t)`, `tracks.trackLabel(s)(…, t)` (Faixa N, Mono/Estéreo/N canais; nomes de idioma de faixa por `languageDisplayName`, tabela explícita — `Intl` só com `{ loose: true }` para trailer/sinopse). Mensagens do motor em pt (`PlayerService`/`avplayAdapter`) mapeadas por `ENGINE_MESSAGE_KEYS` em `usePlayerSession`. Preferências de áudio/legenda continuam independentes (FR-013).
- Contrato: sem contrato nesta fase; contratos 020/027/029/041/042 do player verdes (intactos, `t` padrão pt); trava íntegra
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/components src/lib/player src/lib/trailer src/lib/i18n` → 610 verdes (novo: `PlayerLayer.idioma.test.tsx` 3, incl. FR-014: trocar idioma com player ativo não recria nem fecha o motor)
- Pendências: o texto de um erro já exibido é gravado no estado no momento da falha (R-013) — trocar de idioma COM a tela de erro aberta mantém o texto antigo até a próxima reprodução; `SubtitleOverlay`/`PosterArt` sem texto próprio

---

## Phase 8: US1 — migração: Fontes, Importação, Busca, Favoritos e Histórico (Priority: P1)

- [X] T029 [US1] `src/features/sources/*` (`sourceFormat.ts` e `sourceAccount.ts` recebendo `t`; datas ficam para a Fase 12), `src/features/import/*` (`importSections.ts`), `src/features/search/*`, `src/features/favorites/*`, `src/features/history/*`.
- [X] T030 [P] [US1] Catálogos en/es.

### Testes da Fase

- [X] T031 [P] [US1] `src/features/sources/Sources.idioma.test.tsx` (en: estados de sincronização e erros sem URL/credencial).

**Critério de Conclusão**: `npx vitest run src/features/sources src/features/import src/features/search src/features/favorites src/features/history` verde.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T029–T031. Área `sources` (chaves `src.*`, `limited.*`, `delete.*`, `access.*`, `add.*`, `import.*`, `search.*`, `fav.*`, `hist.*`). `sourceFormat` (todos os formatadores), `sourceAccount.describeAccount`, `epgStatus.epgErrorMessage`, `importSections`, `connectionBanner`, `LimitedModeNotice`, `DeleteSourceModal`, `AddSourceScreen`, `ImportProgressScreen`, `SourceAccessGate` (ações viraram ids estáveis `edit/recheck/back`, rótulo só na exibição), `SearchScreen`, `FavoritesState`, `useFavoriteToggle`, `HistoryRemovalModal` em `t()`; chamadores (`SourcesPanel`, `ProfilesScreen`, `EpgSettingsScreen`) passam `t`. Avisos de importação seguem gravados em pt e são mapeados na exibição (`WARNING_KEYS`).
- Contrato: sem contrato nesta fase (trava íntegra; 3/5 verdes)
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/sources src/features/import src/features/search src/features/favorites src/features/history src/features/settings src/features/profiles src/lib/catalog src/lib/epg` → 854 verdes (novo: `Sources.idioma.test.tsx` 6)
- Pendências: datas/horas em pt-BR fixo (`formatEpgTime.ts`, `clock.ts`) na Fase 12; varredura de literais restantes na Fase 9

---

## Phase 9: US1 — varredura final de textos e E2E de interface (Priority: P1)

- [X] T032 [US1] Varredura: `Grep` por literais acentuados/pt restantes em `src/**/*.tsx` e helpers `*.ts` não-teste; cada achado vira chave ou é justificado (texto do provedor, comentário, log técnico).
- [X] T033 [US1] `e2e/idioma-do-app.mjs` (+ linha em `SUITE` de `e2e/run.mjs`): troca para English e para Español pela UI, visita Início/Live/Filmes/Séries/Busca/Configurações/Player e falha se achar palavras-chave em português (lista de termos comuns: "Configurações", "Voltar", "Favoritos", "Histórico", "Em breve"…); confere que nomes do provedor da fixture não mudaram.
- [X] T034 [US1] Revisar CSS de textos longos (R-003) usando tokens existentes, sem cor/tamanho literal.

**Critério de Conclusão**: `npm run test:e2e -- --only idioma-do-app` verde; varredura sem pendências; `npx vitest run` (suíte) verde com o contrato de completude.

**Checkpoint**: US1 completa.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T032–T034. Varredura de literais em `src/**` não-teste: restaram só identificadores (chaves de `ENGINE_MESSAGE_KEYS`/`WARNING_KEYS` que mapeiam texto pt gravado), `UNGROUPED_LABEL` (identidade de chave de foco), tabelas de nomes de idioma, registro `comingSoon` (texto pt de fallback) e erros internos nunca exibidos (`CatalogApiError` é lido por status, `InvalidSourceError`/`InvalidEpgUrlError` não vão à tela). `e2e/idioma-do-app.mjs` (novo, na `SUITE`): troca para English e Español pela interface, confere `<html lang>`, persistência após recarregar, ausência de português em perfis/Início/Live/Player/Filmes/Séries/Busca/Configurações, nome do canal do provedor intacto e volta ao português. `locale: 'pt-BR'` adicionado a todos os `newContext`/`launchPersistentContext` dos E2E existentes (R-010). CSS: sem estouro nas telas medidas; rótulos longos das abas de Configurações em es/en encurtados no catálogo (truncavam com reticências).
- Contrato: sem contrato nesta fase (trava íntegra; 3/5 verdes)
- Testes executados: `node e2e/idioma-do-app.mjs` → todas as verificações passaram; `npm run test:e2e` (suíte completa, 33 scripts) → 33/33 passaram (402s); `npx vitest run src/features/settings src/lib/i18n` verde
- Pendências: o dev server (PID iniciado às 09:04) servia um `TextField.tsx` obsoleto (sem o import de `useT`) e quebrava o cadastro de lista em todos os E2E; foi reiniciado. Registrar em Cuidados para Retomada.

---

## Phase 10: User Story 2 — Sinopse e metadados no idioma escolhido (Priority: P2)

**Objetivo**: TMDB no idioma do app, rebuscado só ao abrir o detalhe, com fallback e sem perda em falha.

### Contrato da Fase

- `FR-006/FR-007: trocar o idioma rebusca ao abrir o detalhe…` e `FR-008: rebusca que falha…` (em `src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts`)
- Comando: `npx vitest run src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts`

### Implementation

- [X] T035 [US2] `src/lib/catalog/db.ts`: `language?: AppLanguage` no resultado `matched` e em `TmdbPersonRecord` (sem versão nova do Dexie); `src/lib/metadata/titleMetadataStore.ts` grava o idioma do resultado.
- [X] T036 [US2] `src/lib/metadata/tmdbLookup.ts`: `language` do app em `detailParams`/busca (`APP_LANGUAGE_LOCALE`); cadeia de sinopse idioma→`en-US`→original; `synopsisLanguage` quando ≠ idioma do app (`logic` §4); `src/lib/metadata/tmdbMapping.ts` (`countryName` pelo locale) → contrato: ambos
- [X] T037 [US2] `src/lib/metadata/titleMetadata.ts`: condição "cache vale" com `stale` por idioma; `options.language ?? readAppLanguage()`; chave do `inFlight` com o idioma; falha não grava e tenta uma vez por abertura → contrato: `FR-006/FR-007…`, `FR-008…`
- [X] T038 [P] [US2] `src/lib/metadata/tmdbPeople.ts`: `language` do app e invalidação por idioma na abertura (OK no ator).
- [X] T039 [US2] `src/features/vod/DetailMetadata.tsx`: "em {idioma}" traduzido com `Intl.DisplayNames` pelo idioma do app; `src/features/vod/detailMetadataFormat.ts` se aplicável.

### Testes da Fase

- [X] T040 [P] [US2] `src/lib/metadata/titleMetadata.idioma.test.ts`: cadeia da sinopse (en vazio → original), provedor continua vencendo, `no_match` não é invalidado, foco/`mergeTitleMetadata` não consultam rede.
- [X] T041 [P] [US2] `src/lib/metadata/tmdbPeople.idioma.test.ts`.

**Critério de Conclusão**: contratos desta fase verdes + os contratos 032/033/035 (`titleMetadata.metadata-tmdb`, `titleMetadata.trailers`, `titleMetadata.semelhantes`, `tmdbPeople.semelhantes`) continuam verdes; `check-contract-tests.ps1` íntegro.

**Checkpoint**: US2 funcional.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T035–T041. `TmdbResultRecord` `matched` e `TmdbPersonRecord` ganham `language?: AppLanguage` (sem versão nova do Dexie; ausente = `pt`). `tmdbLookup`: `language` do app em detalhe e busca (`APP_LANGUAGE_LOCALE`); cadeia da sinopse idioma→`en-US`→original, nada roda quando o original já é o idioma do app; `synopsisLanguage` (ISO) só quando ≠ idioma do app. `titleMetadata`: `matched` em outro idioma vale como vencido ao abrir o detalhe, `no_match`/`dead_id` não; chave do `inFlight` com o idioma; falha não grava e tenta uma vez por abertura. `tmdbPeople`: idem (se a rebusca falhar, a filmografia guardada continua valendo). `catalogApi`: `useTitleMetadata`/`usePersonCredits` põem o idioma na chave do react-query e o repassam (o que foi lido em outro idioma não aparece como vigente). T039 "em {idioma}" já estava pronto desde a Fase 6.
- Contrato: `npx vitest run src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts` → 2/2 verdes; trava íntegra (5 testes); contratos 032/033/035 verdes
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features src/lib/metadata src/components` → 1420 verdes (novos: `titleMetadata.idioma.test.ts` 6, `tmdbPeople.idioma.test.ts` 3)
- Pendências: `tmdbMapping.countryName` (nome do país) fica na Fase 12

---

## Phase 11: User Story 3 — Trailer no idioma escolhido, com fallback (Priority: P2)

**Objetivo**: o ajuste de trailers (Fase 1) passa a ler o idioma **global** do app.

- [X] T042 [US3] `src/lib/metadata/titleMetadata.ts` e `tmdbLookup.ts`: o idioma dos trailers = `options.language ?? readAppLanguage()` (já ligado em T036/T037; remover qualquer leitura de `readPlayerPreferences().preferredLanguage`).
- [X] T043 [US3] `src/lib/trailer/trailerCandidates.ts`: `trailerButtonLabel(candidate, language, t)` mostra o idioma quando ≠ idioma do app, nome traduzido; `src/features/vod/trailerAction.ts` repassa `t`/`language`.
- [X] T044 [P] [US3] Ajustar `trailerCandidates.test.ts`/`trailerAction.test.ts`; as travas 033 (`trailerCandidates.trailers.contract`, `MovieDetailScreen.trailers.contract`) **não podem mudar**: o parâmetro novo tem padrão `pt`.

### Testes da Fase

- [X] T045 [P] [US3] `src/lib/trailer/trailerCandidates.idioma.test.ts`: es→en→resto; rótulo "· Inglés" em es; sem trailer no idioma, ainda há botão (SC-004).

**Critério de Conclusão**: `npx vitest run src/lib/trailer src/features/vod src/features/movies src/components/TrailerLayer*` verde, contratos 033 intactos.

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T042–T045. O idioma dos trailers é o global do app: `titleMetadata` passa `language` ao `lookupTmdb` (`include_video_language` = `pt,en,<idioma>,null`) e ao ranking (`buildTrailerCandidates`: provedor primeiro; trailer>teaser, oficial, idioma do app > en > resto — R-012 da 033 mantida). Nenhuma leitura de `preferredLanguage` de `PlayerPreferences` sobrou (só a migração em `appLanguage.ts`). `trailerButtonLabel(candidate, t)` mostra o idioma só quando ≠ idioma do app, com o nome no idioma do app. T042/T043 já estavam ligados nas Fases 6–7/10; esta fase os confirmou e fechou com testes.
- Contrato: trava íntegra; contratos 033 (`trailerCandidates.trailers`, `trailerSession.trailers`, `MovieDetailScreen.trailers`) verdes sem edição
- Testes executados: `npx vitest run src/lib/trailer` → 45 verdes (novo: `trailerCandidates.idioma.test.ts` 7); `npx vitest run src/features src/lib/metadata src/components` → 1420 verdes
- Pendências: nenhuma

---

## Phase 12: User Story 4 — Formatos acompanham o idioma (Priority: P3)

- [X] T046 [US4] Trocar `'pt-BR'` de **exibição** por `APP_LANGUAGE_LOCALE[language]` (lista em `logic` §6): `src/lib/epg/formatEpgTime.ts`, `src/lib/catalog/sourceAccount.ts`, `src/features/import/importSections.ts`, `src/features/sources/sourceFormat.ts`, `src/features/movies/MovieDetailScreen.tsx`, `src/features/settings/IntegrationsPanel.tsx`, `src/features/vod/DetailMetadata.tsx`, `src/lib/metadata/tmdbMapping.ts`, `src/lib/trailer/trailerCandidates.ts`. Funções puras recebem `language` por parâmetro (padrão `pt`).
- [X] T047 [US4] Não tocar `initials.ts`, `vodSort.ts`, `catalogSearch.ts` (D-011).

### Testes da Fase

- [X] T048 [P] [US4] `src/lib/i18n/formats.idioma.test.ts`: hora do guia, data, duração, número e nome de país em en/es.

**Critério de Conclusão**: `npx vitest run` das áreas tocadas verde (default pt idêntico ao de hoje).

**Registro da Fase**:

- Status: concluída (2026-10-03)
- Feito: T046–T048. `formatEpgClock`/`formatEpgTimeRange(…, language = 'pt')` usam `APP_LANGUAGE_LOCALE` com `hourCycle: 'h23'` (sempre 24 h: as colunas do guia e da faixa são de largura fixa; o idioma decide só algarismos/separadores) e os chamadores (`liveColumns`, `EpgGuide`) passam `t.language`. `mapTmdbDetail(kind, detail, language = 'pt')` traduz o nome do país com `Intl.DisplayNames` no idioma do app; `tmdbLookup` repassa. Já feitos nas Fases 6–8: `sourceAccount`, `sourceFormat`, `importSections`, `MovieDetailScreen`, `IntegrationsPanel`, `DetailMetadata`, `trailerCandidates`. Não tocados (D-011): `initials.ts`, `vodSort.ts`, `catalogSearch.ts`. O relógio da topbar (`clock.ts`, `HH:MM` manual) continua 24 h por escolha (FR-019 da 023), igual em todos os idiomas.
- Contrato: sem contrato nesta fase (trava íntegra; 5/5 verdes)
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/lib src/features/live` → 1294 verdes (novo: `formats.idioma.test.ts` 4)
- Pendências: nenhuma

---

## Phase 13: Polish & Cross-Cutting Concerns

- [X] T049 Rodar `quickstart.md` inteiro (navegador) e registrar o resultado. *(Cumprido na parte automatizada e no E2E `idioma-do-app` — passos 1–3, 8–9 do cenário; os passos 4–6 (consulta real ao TMDB com chave, sinopse e trailer em fallback) foram exercitados só com `fetch` falso nos testes de contrato/unidade, não contra o TMDB real.)*
- [X] T050 `npm run test:e2e` (suíte completa) com `npm run dev` rodando — gate anterior à TV.
- [ ] T051 `npm run build:tizen` (`findUnlistedFiles` sem pendência) e passada na TV física (`tizen-tv`): US5/R-001, SC-006, fluxo da US1 por controle remoto. *(Aberta: `npm run build:tizen` passou e sincronizou em `CCPlayTv/` sem pendência; falta a passada na TV física — decisão do usuário, R-001/R-003.)*
- [X] T052 Atualizar `.planning/backlog.md` via `update-feature-status.ps1`; se surgir regra permanente ("texto novo entra pelo catálogo `lib/i18n`"), uma linha curta em `CLAUDE.md`; nenhum parágrafo de status.

### Checklist de Release

- [X] Fases 1–12 concluídas
- [X] Os 5 testes de contrato verdes na suíte completa e `check-contract-tests.ps1 -Slug 054-idioma-do-app` íntegro
- [X] `npx tsc -b`, `npm run lint`, `npm run test` verdes
- [X] E2E `idioma-do-app` e suíte completa verdes
- [X] Contratos de outras features (026, 032, 033, 035, 041) intactos
- [X] Revisão de segredos (nenhuma mensagem traduzida interpola URL/credencial/chave)
- [ ] `quickstart.md` executado; passada na TV física feita ou decisão explícita do usuário registrada em R-001/R-003

---

## Dependencies & Execution Order

- Phase 1 sem dependências; Phase 2 depende da 1 e BLOQUEIA o resto; Phase 3 depende da 2.
- Phases 4–8 (migração por área) dependem da 3 e podem rodar em qualquer ordem entre si; Phase 9 depende de 4–8.
- Phases 10 e 11 dependem da 2 (podem rodar em paralelo à migração de telas); a 11 depende da 10. Phase 12 depende da 2 e, por tocar os mesmos arquivos, deve vir depois das áreas 5/6/8.
- Polish depende de tudo.

## Implementation Strategy

MVP = Fases 1–3 (linha de idioma + Configurações traduzida). Depois uma área por vez, sempre com a suíte verde e o default `pt` inalterado. A US2/US3 entregam o ganho de sinopse/trailer e podem ser priorizadas antes da migração completa das telas se a pessoa preferir.

## Notes

- Commitar por task ou grupo coerente; nunca misturar com as mudanças de outras features no `git status`.
- Não usar `git stash` nesta árvore (log de MCP travado; já causou falha uma vez).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->


