# Handoff — 066 Gestão de categorias e controle parental

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend `tv-web/` (React 19 + TS + Vite 8, Dexie/IndexedDB, react-query, navegação própria `useRemoteNav`). Tudo no aparelho, nenhuma rede nesta feature.
- Próximo comando: `/sdd-execute 066-categorias-controle-parental`.
- Backlog: `Planejada`, 0/48. Nada desta feature commitado ainda (spec, plan, tasks, logic, stubs, contratos e a trava estão só no disco).

## O que a feature entrega

- **US1 (P1)** Esconder categorias na nova aba Configurações › "Categorias & parental": somem de **todo** o app (trilhas, "Todos", busca, fileiras, Início, guia, zapping, Favoritos, Histórico, Continuar assistindo). Não exige PIN. Não apaga favorito/progresso.
- **US2 (P1)** Bloquear com **um** PIN de 4 dígitos para o app inteiro: cadeado na trilha, PIN ao entrar, itens fora de qualquer outra superfície; desbloqueio vale para a lista ativa até segundo plano/fechar/trocar de lista. Com PIN, também protege a aba e adicionar/editar/remover lista. **Sem limite de tentativas** (decisão do usuário).
- **US3 (P2)** Ao ligar: categorias de nome adulto vêm pré-marcadas e a pessoa confirma; depois, adulta **nova** chega bloqueada; recusa é lembrada.
- **US4 (P3)** "Esqueci o PIN" com usuário+senha (Xtream) ou endereço (M3U) de uma lista cadastrada, conferidos **só no aparelho** (o usuário escolheu isso no lugar de "sem recuperação").
- Fora: perfis de pessoa, classificação indicativa, item individual, reordenar/renomear, PIN para abrir o app.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..FR-034, edge cases (número do canal não muda; item em duas categorias).
2. `plan.md` — Decisões Invariantes D-001..D-012, riscos R-001..R-008 (tetos de linha!).
3. `tasks.md` — 7 fases; contratos por fase.
4. `logic/acesso-categorias.md` — fórmula do estado efetivo (§1), tabela de leitores a filtrar (§3), termos adultos (§4), rebloqueio/`resetQueries` (§5).
5. `logic/pin.md` — hash com sal + fallback JS, `PinPrompt`, onde o PIN é pedido, recuperação.
6. `data-model.md` — Dexie **v20**: `categoryPreferences`, `parentalPin`.
7. `quickstart.md` — roteiro de navegador e checklist.
8. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts` — 3 testes (US1 Fase 3, US2 Fase 4, US3 Fase 5; filtre com `-t "US1"` etc.).
- `tv-web/src/lib/parental/pin.categorias-controle-parental.contract.test.ts` — 1 teste (Fase 2, inclui a recuperação na camada `lib`).
- `tv-web/src/components/PinPrompt.categorias-controle-parental.contract.test.tsx` — 1 teste (Fase 4).
- Rodar: `cd tv-web; npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/components/PinPrompt.categorias-controle-parental.contract.test.tsx`
- Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 066-categorias-controle-parental` (raiz).
- Hoje: 5/5 vermelhos por `Error: not implemented`. O `afterEach` do contrato de acesso chama `relockSession()` — também lança até a Fase 2.
- Travas de outras features que podem quebrar: 026 (Configurações), 028 (Icon), 050/052/053/057 (vitrines), 060 (Home), 062/064 (aba Integrações). Nenhuma cita o mock parental (conferido).

## Stubs criados

- `tv-web/src/lib/catalog/categoryAccess.ts` — tipos `VisibleCategory` (com `locked` e `hiddenBefore`), `CategoryRef`, `CategoryPreferencePatch`, `CategoryAccess`; funções `listVisibleCategories`, `listManagedCategories`, `setCategoryPreference`, `getCategoryAccess`, `unlockWithPin`, `relockSession`, `isSessionUnlocked`, `subscribeCategoryAccess`, `isAdultCategoryName` — todas `throw new Error('not implemented')`.
- `tv-web/src/lib/parental/pin.ts` — `hasPin`, `verifyPin`, `enableParentalControl`, `changePin`, `disableParentalControl`, `recoverPinWithSource`; tipos `CategoryDecision`, `RecoveryInput`.
- `tv-web/src/components/PinPrompt.tsx` — props `title`, `onSubmit(pin) => Promise<boolean>`, `onCancel`, `onForgot?`.

## Armadilhas já mapeadas

- **Tetos da catraca** (`npm run lint` reprova): `catalogApi.ts` 2190/2190 (troque `listCategories` por `listVisibleCategories` **na mesma linha**), `App.tsx` 624/625 (o hook novo custa 2 linhas → compense 1), `AddSourceScreen.tsx`/`ProfilesScreen.tsx` 421, `LiveScreen.tsx` 349, `liveColumns.tsx` 511, `VodCategoryScreen.tsx` 950. Proteção de adicionar/editar vai em `navigation/routeModules.ts` (`withParentalGate`), não nas telas.
- **Catraca de imports**: `components/` não importa `features/`; `lib/` não importa UI. Por isso `PinPrompt`, `ParentalGate`, `LockedCategoryState` e `RecoverPinFlow` ficam em `components/`.
- **Filtrar depois dos memos** (`blockMemo`, `readProjectionMemo`, `WeakMap` da busca): nunca memorize dado filtrado em `lib`.
- **Não use `listCategories` filtrado na pré-carga/carga por seção/bancada** — elas precisam da lista crua (pré-carga só pula escondidas).
- **Número do canal** (`features/live/channelNumber.ts`) soma as categorias que recebe → com a trilha filtrada renumeraria. Use `hiddenBefore` (D-012).
- **Regra adulta é calculada na leitura** — não ponha gancho em `importPipeline`/`structureRefresh`. Ligar o controle é atômico; cancelar não grava nada.
- `resetQueries`, não `invalidateQueries`, ao mudar o acesso (senão o bloqueado fica na tela durante a releitura).
- `Modal`/`useRemoteNav` deixam passar teclas `0`–`9` (não mapeadas); na TV elas precisam de `registerKey` — faça dentro de `registerMediaKeys()` (sem linha em `App.tsx`).
- `crypto.subtle` existe no Node (contrato) mas pode faltar na origem `file://` da TV → fallback `lib/parental/sha256.ts` obrigatório.
- `normalizeForSearch` (catalogSearch) preserva `+` — use-o antes do regex adulto; "adulteração" **não** é adulto.
- Testes que mudam com a aba nova: `SettingsPanels.test.tsx`, `SettingsScreen.test.tsx`, `lib/comingSoon.test.ts`, E2E `paridade-limpeza.mjs`.
- E2E: `npm run dev` no ar em `:5173`; roteiro novo precisa entrar no `SUITE` de `e2e/run.mjs`.

## Pendências do Analyze

- A-01 MEDIUM — FR-009 (vazio "categorias escondidas" com ação "Gerenciar") exige navegação para Configurações a partir de Live/Filmes/Séries, telas no teto (R-001). Recomendação: componente em `components/` e callback já existente das telas para abrir Configurações; se não houver, registrar em `plan.md` como passar o destino sem crescer as telas.
- A-02 LOW — SC-004 (≤ 10 teclas) só é verificado no E2E (T034); conferir a contagem real e registrar.
- A-03 LOW — A lista de chaves para `resetQueries` (D-005) deve vir de `grep "queryKey: \['" catalogApi.ts`, não da lista do `logic` (pode estar incompleta).
- A-04 LOW — Top 10/Dica e Semelhantes dependem do filtro em `listAllOfKind`/`catalogSearch`; não há teste unitário dedicado — cobrir no E2E (T034) ou em T018.

## Gate de pronto

- 5/5 contratos verdes + `check-contract-tests.ps1` íntegro; travas das outras features íntegras.
- `npx tsc -b`, `npm run lint` (tetos), `npm run test`, `npm run build`, `npm run test:e2e` completo (com `npm run dev`).
- `quickstart.md` no navegador; revisão de segredos (T035); medição (T036).
- Docs: `CLAUDE.md` só se nascer regra permanente; `comingSoon.ts` sem `settings-parental`.
- TV física: **recomendação, não gate** (teclas numéricas, hash em `file://`, botão Home rebloqueia).
