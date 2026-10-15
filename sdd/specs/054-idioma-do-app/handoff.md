# Handoff — 054 Idioma do app (plan → execute)

## Contexto

- Repo `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite em `tv-web/` (Tizen 9 / Chromium 120, build `chrome108`), client-first.
- Próximo comando: `/sdd-execute 054-idioma-do-app`. Status no backlog: **Planejada** (0/59 tasks).
- O `git status` está **sujo com trabalho de outras features** (048–053: remoções de `MoviesScreen`/`SeriesScreen`, e2e, `CCPlayTv/assets`…). Não commitar nem reverter isso. **Não usar `git stash`** (um log de MCP travado já deixou a árvore pela metade uma vez; foi restaurada). Commitar só arquivos desta feature.
- O **ajuste de trailers** (US3) já existe no working tree, sem commit: `lib/trailer/trailerCandidates.ts`, `lib/metadata/tmdbLookup.ts` (`videoLanguages`), `lib/metadata/titleMetadata.ts`, `lib/player/playerPreferences.ts` (`preferredLanguage`), `features/settings/playerPreferencesModel.ts` (5ª linha), testes ajustados. T001 o commita isolado.

## O que a feature entrega

- **US1 (P1)**: linha "Idioma" em Configurações → Acessibilidade & sistema (**índice 1**, depois de "Reduzir movimento"); pt/en/es; interface inteira traduzida por catálogo próprio; troca na hora **sem remontar a árvore** (foco e rolagem ficam). Padrão = idioma da TV (`navigator.languages`) se suportado, senão pt. Texto do provedor **nunca** é traduzido.
- **US2 (P2)**: TMDB com `language=` do idioma do app; resultado guarda o idioma; troca de idioma **rebusca só ao abrir o detalhe** (nunca por foco/lote); falha mantém o guardado; sinopse: idioma → en → original, marcada quando fora do idioma.
- **US3 (P2)**: trailer idioma do app > inglês > resto (oficial ainda vem antes do idioma — R-012 da 033, mantida). A linha "Idioma preferido (trailers)" **sai** do Player; o valor gravado migra para o idioma do app.
- **US4/US5 (P3)**: formatos `Intl` pelo idioma; detecção inicial pela TV.
- Decisão do usuário que contraria o óbvio: áudio/legenda do player **continuam independentes** do idioma do app.

## Leitura obrigatória, em ordem

1. `spec.md` — o quê (5 stories, FR-001..016, SC-001..007).
2. `plan.md` — Decisões Invariantes D-001..D-014, Constitution Check, riscos R-001..R-008, tabela de contratos.
3. `tasks.md` — 13 fases (1 Setup, 2 Foundational, 3 US1 núcleo, 4–9 US1 por área, 10 US2, 11 US3, 12 US4, 13 Polish).
4. `logic/idioma-do-app.md` — **o "como"**: resolução, reatividade, regras de `t()`, cache/rebusca TMDB, trailers, formatos, linha de Configurações.
5. `quickstart.md` — checagens e cenário ponta a ponta.
6. `.planning/memory/constitution.md` (v1.7.0) — foco, segredos, categorias da fonte.

## Testes de contrato (5, travados em `contract-tests.lock`)

- `tv-web/src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts` (2 — Fase 2)
- `tv-web/src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts` (2 — Fase 10)
- `tv-web/src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx` (1 — Fase 3)
- Rodar (em `tv-web/`): `npx vitest run src/lib/i18n/appLanguage.idioma-do-app.contract.test.ts src/lib/metadata/titleMetadata.idioma-do-app.contract.test.ts src/features/settings/SettingsScreen.idioma-do-app.contract.test.tsx`
- Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 054-idioma-do-app`
- Hoje: os 5 vermelhos (3 por `not implemented`/asserção de catálogo vazio, 2 por asserção de contagem de chamadas).
- Travas de **outras** features que esta pode quebrar (não editar): 026 `SettingsScreen.home-busca-configuracoes-ds-v14.contract`, 041 `SettingsScreen.player-reproducao.contract` (+ `PlayerLayer.qualidade-aspecto.contract`), 032 `titleMetadata.metadata-tmdb.contract`/`tmdbKeyRepository.metadata-tmdb.contract`/`MovieDetailScreen.metadata-tmdb.contract`, 033 `trailerCandidates`/`titleMetadata`/`TrailerLayer`/`MovieDetailScreen` `.trailers.contract`, 035 `titleMetadata`/`tmdbPeople`/`localTitleMatch` `.semelhantes.contract`, 029/020/027/042 do player. Se um quebrar, **parar e reportar**.

## Stubs criados

- `lib/i18n/languages.ts` — **real** (constantes `APP_LANGUAGES`, nomes nativos, `APP_LANGUAGE_LOCALE`, `isAppLanguage`).
- `lib/i18n/appLanguage.ts` — constante da chave + 3 funções com `throw new Error('not implemented')` (T003). Falta `subscribeAppLanguage`.
- `lib/i18n/I18nProvider.tsx` — só repassa filhos (T005 faz o provedor real + `useT`).
- `lib/i18n/messages/pt.ts` (2 chaves provisórias) e `en.ts`/`es.ts` (`{}` provisório; T004 tipa `Record<MessageKey,string>`).
- `lib/metadata/types.ts` — `MetadataOptions.language?: AppLanguage` já existe (ainda ignorado).

## Armadilhas já mapeadas

- **Nada de `key={language}` na raiz**: remontar perde foco/rolagem (Constituição + FR-003/FR-014).
- Todo componente com texto próprio chama `useT()`; helpers puros (`sourceFormat`, `importSections`, `trailerAction`, erros) recebem `t`/`language` com **padrão pt** para os testes antigos não mudarem (R-006).
- Chave nova entra em **pt, en e es na mesma task** (contrato de completude + `tsc`); placeholders `{x}` idênticos nos 3.
- Contrato de UI: a linha "Idioma" tem de ser a **2ª** da aba (a 1ª segue "Reduzir movimento", usada pelo teste 026); o teste usa a lista `pt,en,es` na ordem do seletor.
- Moldes: `lib/motionPreference.ts` (armazenamento tolerante a falha), `features/settings/tabs/PlayerTab.tsx` (seletor `Modal`+`radiogroup`), `titleMetadata.tmdb.test.ts` (helpers de fetch falso e Dexie).
- Testes `.ts` que precisam de DOM entram em `TESTES_TS_COM_DOM` (`vite.config.ts`); o contrato de `appLanguage` e o de metadata rodam em `node` e **não** usam `window` (storage injetado).
- Cache TMDB: o idioma é só um marcador (`language?` ausente = `pt`); **sem** versão nova de Dexie; `no_match`/`dead_id` não invalidam; falha de rebusca não grava nada.
- `Intl.DisplayNames` varia entre Node e o Chromium da TV: manter a tabela explícita em `tracks.ts` para áudio/legenda; usar `Intl` só para país/idioma exibidos.
- Não tocar `initials.ts`, `vodSort.ts`, `catalogSearch.ts` (ordenação do conteúdo do provedor).
- `build:tizen`: catálogos entram no `index.js`; nenhum arquivo novo emitido, mas confira `findUnlistedFiles`.
- E2E novo `e2e/idioma-do-app.mjs` precisa entrar em `SUITE` (`e2e/run.mjs`); cada script usa Chromium e servidor falso próprios.

## Pendências do Analyze

- **MEDIUM** — SC-002 (troca ≤ 1 s) não tem task de medição; recomendação: medir no `quickstart.md` item 2 e registrar em Execution Notes.
- **MEDIUM** — T046 (formatos) toca arquivos também migrados nas Fases 5/6/8; recomendação: executar a Fase 12 depois delas (já é a ordem em Dependencies).
- **LOW** — R-001 (idioma da TV via `navigator.languages`) só se prova na TV física; recomendação: tratar a passada em hardware como gate desta feature (decisão do usuário se não for possível).
- **LOW** — a spec cita "nomes de país/idioma" em FR-010 e a Fase 12 cobre país/idioma de `DetailMetadata`/`tmdbMapping`; conferir que `tracks.ts` (nomes de faixa) está na T026, não na T046.
- Nenhum CRITICAL/HIGH.

## Gate de pronto

- 5 contratos verdes + `check-contract-tests.ps1` íntegro; contratos de 026/032/033/035/041 intactos.
- Em `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run test:e2e` (suíte completa, `npm run dev` ligado) e `npm run build:tizen`.
- `quickstart.md` executado. Passada na **TV física** (idioma da TV, textos longos, controle remoto): gate recomendado desta feature; pular exige decisão explícita do usuário registrada em R-001/R-003.
- Docs no Polish: `plan.md` (Estado Atual, Execution Notes), backlog via `update-feature-status.ps1`; `CLAUDE.md` só com regra permanente curta.
