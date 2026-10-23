# Tasks: Chave de legenda digitada no portal

**Input**: `sdd/specs/091-chave-legenda-portal/` (spec, plan, data-model, contracts, logic, quickstart)
**Prerequisites**: spec.md, plan.md, constitution 1.16.0 (a 1.17.0 é o gate G-1 / T001)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: arquivos diferentes, sem dependência. **[Story]**: US1, US2, US3.
- Contrato travado (5 casos): ver `plan.md` → Testes de Contrato. **Nunca** editar os 4 arquivos listados na trava.

## Path Conventions

- Serviço: `api/app/portal/…`, testes em `api/tests/portal/…` (emulador: `PORTAL_TEST_FIRESTORE=1`, Java 21 só no processo).
- TV: `tv-web/src/lib/portal/…`, `tv-web/src/features/{portal,settings}/…`, `tv-web/src/lib/i18n/messages/…`, `tv-web/e2e/…`.
- Portal: `portal-web/src/features/…`, `portal-web/src/lib/i18n/areas/novoPortal.ts`, `portal-web/e2e/*.spec.ts`.

---

## Phase 1: Setup / Gate de governança (G-1)

**Objetivo**: aprovar e aplicar a ADR-022 e a constitution 1.17.0 **antes** de qualquer código que envie a chave ao serviço.

- [X] T001 Aprovar com o usuário o texto de `logic/emenda-constitution.md` (exceção (m) + Relatório de Impacto + ADR-022) e
  aplicá-lo: `sdd-adr` cria `sdd/adr/ADR-022-chave-legenda-digitada-no-portal.md` e acrescenta `**Atualização (ADR-022):**`
  em ADR-020 §8 e ADR-021 §8; `.planning/memory/constitution.md` vai a **1.17.0** (exceção (m), nota na (l), histórico,
  rodapé, cabeçalho); `CLAUDE.md` cita v1.17.0 e a tabela de ADRs ganha a linha 022. **Sem aprovação explícita, parar.**
- [X] T002 [P] Linha de base verde antes de mexer: `uv run pytest tests/portal` com emulador (192), `npx vitest run
  src/lib/portal src/features/settings` (TV), `npx vitest run` (portal-web) e as travas 077/090 íntegras
  (`check-contract-tests.ps1 -Slug 077-redesenho-portal-web`, `090-legendas-externas`). Anotar o resultado no Registro.

**Critério de Conclusão**: ADR-022 e constitution 1.17.0 gravadas com a aprovação do usuário; baseline verde registrado.

**Registro da Fase**:

- Status: Concluída (2026-10-23).
- Feito: T001 — o usuário aprovou "como está" o texto de `logic/emenda-constitution.md`; constitution **1.17.0** (exceção (m),
  nota na (l), relatório de impacto, histórico, rodapé); `sdd/adr/ADR-022-chave-legenda-pelo-portal.md` criada; notas
  `**Atualização (ADR-022):**` em ADR-020 e ADR-021; `CLAUDE.md` cita v1.17.0, "ADR-001 to ADR-022" e ganhou as linhas 021/022 da
  tabela. T002 — linha de base antes de mexer: `tests/portal` 192 verdes com emulador (Java 21); TV `src/lib/portal
  src/features/settings src/lib/subtitles` e portal-web verdes exceto os 4 contratos vermelhos esperados; travas 077 (5) e 090 (5) íntegras.
- Contrato: sem contrato nesta fase (normativa); `check-contract-tests.ps1 -Slug 091-chave-legenda-portal` → trava íntegra (4 + 1 Python por SHA).
- Testes executados: ver Feito (baseline).
- Pendências: nenhuma.

---

## Phase 2: Foundational — serviço e contrato de API (bloqueante)

**Objetivo**: o serviço aceita, cifra, entrega e confirma chaves de legenda por fornecedor; o portal tem o cliente de API.

### Contrato da fase

`cd api; $env:PORTAL_TEST_FIRESTORE=1; uv run pytest tests/portal/test_subtitle_keys_contract.py` → verde (1 teste). Os testes da TMDB
(`test_tmdb_integration.py`) continuam verdes.

### Implementation

- [X] T003 Extrair `KeyIntegrationService` de `api/app/portal/tmdb_integration.py` para `api/app/portal/key_integration.py`
  (parâmetros: `kind`, rótulo de cifra, regex da chave, extrator do snapshot); `TmdbIntegrationService` vira especialização
  **sem mudar comportamento** (`logic §1`). Critério: `test_tmdb_integration.py` e o contrato 077 verdes **antes e depois**.
- [X] T004 [P] `api/app/portal/models.py`: alias `KeyOperationDocument = TmdbIntegrationDocument`; `SubtitlesSnapshot`
  (`opensubtitles`/`subdl` ∈ `none|configured|rejected|rate_limited`); `IntegrationsSnapshotDocument.subtitles` opcional
  (`tmdb` continua obrigatório). Conferir `configurations.py:175` (comparação de snapshot) e `routes/operations.py` (`SnapshotInput`).
- [X] T005 `api/app/portal/subtitle_keys.py`: `SubtitleKeyService` (`request/view/pull/ack`, `logic §1`) sobre duas instâncias
  da classe-base, rótulo de cifra `subtitle-key:<provider>`, formato `[A-Za-z0-9._-]{8,200}` → contrato:
  `test_per_provider_encrypted_pending_only_same_tv_pulls_replace_and_ack_erase_only_their_own`.
- [X] T006 `api/app/portal/routes/subtitle_keys.py` + registro em `application.py`: `GET/PUT/POST remove` do navegador,
  `GET pull`/`POST ack` da TV, limites `subtitle-key` (10/h), `subtitle-pull` (3/10 s), `subtitle-ack` (20/min) — `contracts/portal-api-legendas.md`.
- [X] T007 [P] `portal-web/src/features/api.ts`: tipos `SubtitleKeyServerState`/`SubtitleKeyProviderId` e
  `api.subtitleKeys.{status,set,remove}` (a chave só no corpo do `PUT`; `operationId` como header de idempotência).

### Testes da Fase

- [X] T008 [P] `api/tests/portal/test_subtitle_keys_routes.py` (emulador): rotas e limites (429 uniforme, `provider` inválido
  422, corpo extra 422, chave fora do formato 422), `Idempotency-Key` repetido não duplica, pendência vencida/de outra época
  some e o envelope é apagado, ack idempotente de fornecedor/operação errados, `retry` mantém a operação, snapshot
  `integrations.subtitles` aceito e devolvido e **TV antiga (sem o campo) segue válida**, `caplog` sem a chave em nenhum
  nível, rótulo de cifra por fornecedor (envelope de um não decifra no outro).

- [X] T009 [P] Aparelho apagado/desvinculado ou chave de acesso trocada **leva junto** os envelopes pendentes
  `integrations/subtitles-*` (FR-004), como já faz com `integrations/tmdb`: achar o ponto (`grep "integrations"` em
  `repositories/`, `auth.py`, `routes/operations.py`), cobrir `subtitles-*` e testar em `test_subtitle_keys_routes.py`.

**Critério de Conclusão**: contrato 1/1 verde com emulador; `uv run pytest tests/portal` verde (192 + novos); `uv run ruff check .` limpo;
`check-contract-tests.ps1 -Slug 091-chave-legenda-portal` íntegro.

**Registro da Fase**:

- Status: Concluída (2026-10-23).
- Feito: T003 `key_integration.py` com `KeyIntegrationService` (kind, rótulo de cifra, regex, extrator do snapshot) e
  `tmdb_integration.py` reduzido a uma especialização (re-exporta `KEY_PATTERN/RETENTION/…`): `test_tmdb_integration.py` 5/5 antes e depois;
  T004 `SubtitlesSnapshotDocument`, `IntegrationsSnapshotDocument.subtitles` opcional, alias `KeyOperationDocument`; T005
  `subtitle_keys.py` (`SubtitleKeyService` compõe duas instâncias; formato `8–200`; rótulo `subtitle-key:<fornecedor>`); T006
  `routes/subtitle_keys.py` registrado em `application.py` (5 rotas; limites `subtitle-key` 10/h, `subtitle-pull` 3/10 s,
  `subtitle-ack` 20/min; fornecedor validado antes de gastar limite); T007 `portal-web/src/features/api.ts`
  (`api.subtitleKeys.{status,set,remove}` + tipos); T008 `test_subtitle_keys_routes.py` (5 testes: retry/recusa por fornecedor, expiração e época,
  cifra que nomeia o fornecedor — o envelope do SubDL não abre como OpenSubtitles nem como TMDB —, rotas/limites/422/no-store/caplog,
  snapshot com TV antiga); T009 — achado: o serviço **não tem** rota de apagar aparelho; os envelopes morrem por época de
  autenticação (coberto no T008), expiração e ack, então não há ponto de limpeza extra a cobrir.
- Contrato: `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal/test_subtitle_keys_contract.py` → **1/1 verde**; trava íntegra.
- Testes executados: `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal` → **198 passaram** (192 + 5 + 1 contrato), `uv run ruff check .` limpo,
  `npx tsc -b` do portal-web limpo; travas 077 e 091 íntegras.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — Colar a chave no celular e a TV aplicar no Atualizar (Priority: P1) 🎯 MVP

**Objetivo**: enviar pelo portal e ver a chave em uso na TV depois de **um** Atualizar, com o estado correto no portal.

**Independent Test**: quickstart B1–B6 (E2E automatizado) e, no fechamento, C1–C3 na TV.

### Contrato da fase

`cd tv-web; npx vitest run src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts`
→ 3/3 verdes; `cd portal-web; npx vitest run src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` → 1/1 verde.

### Implementation — TV

- [X] T010 `tv-web/src/lib/portal/subtitleKeysRemote.ts`: `applyRemoteSubtitleKeys` (`logic §4`) → contratos:
  `cada fornecedor é aplicado pelo caminho da TV…` e `falha inesperada de um fornecedor…`.
- [X] T011 `createSubtitleKeysRemoteStep` (porta de produção, mesmo padrão de `createTmdbRemoteStep`): bearer, confere a
  identidade antes de cada efeito, valida a resposta item a item, `saveSubtitleKey`/`removeSubtitleKey` da 090.
- [X] T012 `tv-web/src/lib/portal/portalAgent.ts`: escopo `'subtitles'` (`['integrations','snapshot']`) e
  `applyIntegrations(signal, only)`; `lists`/`tmdb` sem `only` (`logic §5`) → contrato `escopo "subtitles" aplica só…`.
  Se o arquivo passar do teto do ratchet, extrair a tabela de passos por escopo.
- [X] T013 `tv-web/src/features/portal/usePortalIntegration.tsx`: `applyIntegrations` roda TMDB (se `!only`) e legendas,
  **independentes** (um lançar não impede o outro; lança depois). Se passar do teto, mover a montagem para
  `tv-web/src/lib/portal/integrationSteps.ts`.
- [X] T014 [P] `tv-web/src/lib/portal/snapshotPublisher.ts`: `integrations.subtitles` a partir de `listSubtitleKeyStatus()`
  (`none|configured|rejected|rate_limited`, `logic §3`); nunca valor/máscara.
- [X] T015 [P] `tv-web/src/lib/portal/useRefreshAction.ts`: `refreshFingerprint('subtitles')` (estado/escolha/instante de
  `subtitleCredentials`, sem a chave) e `refreshMessageKey` (`portal.refresh.subtitlesDone|Nothing`);
  `tv-web/src/lib/i18n/messages/portal.ts` nas três línguas.
- [X] T016 Seção **Legendas**: linha "Atualizar" (`useRefreshAction('subtitles')` + `RefreshStatusLine`) em
  `tabs/SubtitleKeysSection.tsx`, `integrationsModel.ts` (`SUBTITLE_ROW_COUNT` conta a linha; some sem portal),
  `tabs/IntegrationsTab.tsx` (foco/colunas; ao fim do Atualizar do card TMDB, `subtitleKeys.refresh()`); textos em
  `messages/subtitles.ts` (pt/en/es). **Atualizar as contagens de ↓** em `SettingsScreen.integrations.test.tsx`,
  `SettingsScreen.speedTest.test.tsx` e `tv-web/e2e/teste-conexao-tv.mjs` (R-004).

### Implementation — Portal

- [X] T017 `portal-web/src/features/settings/subtitleKeyStatus.ts` (`resolveSubtitleKeyView` reaproveitando `resolveTmdbView`;
  `checkSubtitleKey` 8–200) → contrato `estado por fornecedor sem o valor…`.
- [X] T018 `portal-web/src/features/settings/SubtitleKeysPage.tsx`: duas seções (OpenSubtitles, SubDL), formulário
  Adicionar/Substituir (campo oculto + olho, limpa após envio, `maxLength`, `autoComplete="off"`), badge de estado,
  "Enviado — na TV, aperte Atualizar", link de onde criar a chave (`logic §6`). **Sem** "cancelar envio".
- [X] T019 `portal-web/src/features/settings/items.ts` + `SettingsPage.tsx` (+ `shell/navigation.ts` se a sub-tela exigir):
  item "Chaves de legenda" logo depois de "Chave TMDB".
- [X] T020 [P] `portal-web/src/lib/i18n/areas/novoPortal.ts` (pt/en/es): título/descrição do item, rótulos de estado (§6.1),
  dicas, erros, "Enviado…"; FAQ (`lib/i18n/faq.ts`) ganha a pergunta da chave de legenda.

### Testes da Fase

- [X] T021 [P] `portal-web/e2e/subtitulos.spec.ts` (Playwright, serviço simulado como `tmdb.spec.ts`): adicionar chave em cada
  fornecedor (corpo do `PUT` correto, campo limpo, aviso "aperte Atualizar", chave **fora** de URL/storage/DOM), estados
  pendente/aplicada/recusada.
- [X] T022 [P] `tv-web/src/lib/portal/subtitleKeysRemote.http.test.ts` (rotas fixas, bearer, resposta malformada descartada,
  identidade trocada no meio aborta, chave nunca em erro/ack) e `snapshotPublisher` com legendas (sem valor/máscara).
- [X] T023 [P] `tv-web/src/features/settings/tabs/SubtitleKeysSection.test.tsx` (estende): linha "Atualizar" focável em todos
  os estados, sem portal a linha some, resultado por fornecedor depois do Atualizar.

**Critério de Conclusão**: os 4 contratos de TV/portal verdes; T021–T023 verdes; `npx tsc -b`, `npm run lint` (TV e portal) e
`npm run build` ok; guarda do Tizen vazia; travas 077/090/029/041/042 íntegras; quickstart B1–B6 conferidos.

**Registro da Fase**:

- Status: Concluída em código, teste e E2E (2026-10-23); a passada na TV física (G-2, T036) segue como gate de fechamento.
- Feito: **TV** — T010/T011 `subtitleKeysRemote.ts` (`applyRemoteSubtitleKeys`: aplica em ordem, falha inesperada de um
  fornecedor não impede o outro e lança `subtitle_apply_failed`; `createSubtitleKeysRemoteStep` com bearer, `same()` antes de
  cada efeito e resposta validada item a item); T012 escopo `'subtitles'` no `portalAgent.ts`; T013 `integrationSteps.ts`
  (montagem extraída de `usePortalIntegration.tsx` para não estourar o teto) com TMDB e legendas independentes; T014
  `integrations.subtitles` no snapshot (só estado) e recuo do 422 em `portalSync.ts` para serviço anterior à 091; T015
  fingerprint/mensagens do escopo (`portal.refresh.subtitlesDone|Nothing`, movidas para `messages/subtitles.ts` porque
  `messages/portal.ts` passou de 300 linhas); T016 linha "Atualizar" na seção Legendas (`integrationRows(hasPortal)` em
  `integrationsModel.ts`, no lugar das constantes estáticas; sem portal a linha some e o foco nunca fica numa linha
  inexistente) e o Atualizar do card TMDB passou a reler também as legendas. **Portal** — T017 `subtitleKeyStatus.ts`; T018
  `SubtitleKeysPage.tsx` (uma seção por fornecedor, campo oculto com olho, limpa ao enviar, sem "cancelar envio"); T019 item
  "Chaves de legenda" logo depois de "Chave TMDB"; T020 textos pt/en/es e FAQ. `CCPlayTv/tizen_web_project.yaml`: removida a
  entrada `assets/subtitleCredentials.js`, que o build deixou de emitir (o módulo passou a ser importado estaticamente pelo
  caminho do portal e foi absorvido por outro chunk) — a guarda `findStaleDeclared` recusava a sincronização.
- Contrato: TV `npx vitest run src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts
  src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` → **3/3 verdes**; portal `npx vitest run
  src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` → **1/1 verde**; serviço (Fase 2) 1/1 verde;
  `check-contract-tests.ps1 -Slug 091-chave-legenda-portal` → trava íntegra; travas 029/041/042/077/090 íntegras (exit 0).
- Testes executados: TV `npx vitest run src/lib/portal src/features/settings src/lib/subtitles src/features/portal src/lib/i18n
  src/components` → **191 arquivos / 850 testes verdes** (T022 = `subtitleKeysRemote.http.test.ts` 5 + `snapshotPublisher.subtitles.test.ts`
  2 + `integrationSteps.test.ts`; T023 = `SubtitleKeysSection.test.tsx` ganhou "Atualizar focável e relê as linhas" e "sem portal a
  linha some"); contagens de ↓ subiram em 1 em `SettingsScreen.integrations.test.tsx`, `SettingsScreen.speedTest.test.tsx` e
  `SubtitleKeysSection.test.tsx` (R-004); `npx tsc -b` limpo (TV e portal); `npm run lint` (TV, com o ratchet: ok) e `npm run lint`
  (portal) limpos; `npm run build` TV e portal ok; guarda do Tizen (`findUnlistedFiles`/`findStaleDeclared`) → vazia nos dois sentidos;
  portal `npx vitest run` 13 arquivos / 32 testes; Playwright do portal (`subtitulos.spec.ts` T021 = 9 testes, `ajustes.spec.ts`,
  `tmdb.spec.ts`, `shell.redesenho-portal-web.contract.spec.ts`) → **21/21**, incluindo SC-001 (3 toques); TV E2E `npm run test:e2e --
  --only teste-conexao-tv,legendas-externas,configuracoes-lista-global,metadata-tmdb,ime-formularios,portal-configuracao,legibilidade-tv`
  → 7/7 (o `teste-conexao-tv` contava ↓ fixos e foi trocado por "anda até o foco chegar em Abrir teste"); `node e2e/chave-tmdb-pelo-portal.mjs`
  (pilha real: emulador Java 21 + API + portal + TV) → **OK** com o Atualizar do card TMDB agora escopado à região TMDB.
- Pendências: (1) quickstart B5/B6 (TV aplica e o portal relê) estão cobertos por teste unitário/HTTP e pela pilha real **da TMDB**, mas
  não há E2E de pilha real para o SubDL/OpenSubtitles — o fornecedor falso exige o preflight de rede da TV; fica para a Fase 6
  (T036 na TV física). (2) G-2 continua aberto.

---

## Phase 4: User Story 2 — Substituir, esperar e entender o estado (Priority: P2)

**Objetivo**: a pessoa troca a chave, vê "Aguardando a TV", entende offline/limite e TV antiga.

**Independent Test**: quickstart B7–B9.

### Implementation

- [X] T024 Portal: mensagens e ações de `pending` (com e sem nova tentativa), `rejected` (`refused`/`invalid_format`), `limited`
  e `unknown`; **Substituir** reaproveita o `operationId` após falha de rede enquanto a chave digitada não muda
  (`SubtitleKeysPage.tsx`, `novoPortal.ts`).
- [X] T025 TV: motivos do ack na seção Legendas — `retry` (offline/limite) deixa a operação pendente e a linha mostra
  "tentar de novo depois"; `rejected` mostra o motivo sem a chave (`messages/subtitles.ts`, `SubtitleKeysSection.tsx`).

### Testes da Fase

- [X] T026 [P] Serviço: substituir enquanto pendente (uma pendente por fornecedor), `retry` mantém envelope, expiração em 7 dias,
  época diferente (`test_subtitle_keys_routes.py` estende).
- [X] T027 [P] Portal (vitest + `subtitulos.spec.ts`): substituir; offline→pendente; TV antiga → "Estado desconhecido".

**Critério de Conclusão**: T026–T027 verdes; contratos 5/5 seguem verdes; quickstart B7–B9 conferidos.

**Registro da Fase**:

- Status: Concluída em código e testes (2026-10-23); modo contínuo autorizado até o fim da Fase 5.
- Feito: T024 conferida sem reescrever a página; T025 mostra o motivo mínimo do ack por fornecedor em pt/en/es
  (`subtitleKeyFeedback.ts`, só em memória por banco, sem operação/chave/tabela nova). Recusa e retry preservam a chave
  anterior; corrigir a chave na própria TV limpa o aviso antigo. T026 cobre substituição pendente nos dois fornecedores,
  ack atrasado, idempotência, retry offline/limite com envelope e prazo preservados e expiração no instante de 7 dias;
  a mudança de época segue coberta. T027 acrescenta vitest e E2E de substituição, troca do operationId ao editar após
  erro de rede e offline → pendente → aplicada; TV antiga continua desconhecida. Quickstart B7–B9b conferido por testes
  com serviço local/emulador e navegador; a pilha integrada de legendas permanece na T031.
- Contrato: TV `npx vitest run src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts
  src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` → 3/3; portal `npx vitest run` → inclui 1/1;
  serviço `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal --basetemp=<TEMP>/ccplay-091-phase4 -q` → inclui 1/1.
  Total 5/5 verdes; `check-contract-tests.ps1 -Slug 091-chave-legenda-portal` → trava íntegra (077/090 também).
- Testes executados: TV `npx vitest run src/lib/portal src/features/settings src/lib/subtitles src/lib/i18n` → 98 arquivos,
  386 testes; teste adicional de correção local: `npx vitest run src/features/settings/tabs/SubtitleKeysSection.test.tsx
  src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts`
  → 14/14. T025 precisou de duas iterações RED→GREEN (ausência do motivo; limpeza após correção local).
  TV/portal: `npx tsc -b`, `npm run lint`, `npm run build` → exit 0 (TV com avisos de lint e tamanho do chunk, sem subir
  baseline); guarda Tizen `findUnlistedFiles`/`findStaleDeclared` → ambas vazias. Portal `npx vitest run` → 36/36;
  `npx playwright test subtitulos.spec.ts --project=default` → 11/11. Serviço: comando acima → 202/202;
  `uv run ruff check .` → limpo. Nenhuma mudança nos contratos travados.
- Pendências: T031 (E2E integrado de legendas), T032 (legibilidade dos novos estados) e G-2/T036 permanecem na Fase 6.

---

## Phase 5: User Story 3 — Remover a chave pelo portal (Priority: P3)

**Objetivo**: remover pelo portal (confirmação no portal) e a TV apagar no Atualizar.

**Independent Test**: quickstart B10–B11.

### Implementation

- [X] T028 Portal: ação **Remover** com `DeleteDialog` por fornecedor (`SubtitleKeysPage.tsx`); sem chave não há ação (explica); operação
  `remove` pelo `api.subtitleKeys.remove`; "Remoção enviada — na TV, aperte Atualizar".
- [X] T029 TV/serviço: `remove` já nascido em T005/T010; aqui só a verificação ponta a ponta e a atualização do estado
  (`removeSubtitleKey` + ack `applied`; a linha volta a "Padrão do ccplayTv"/"Sem chave").

### Testes da Fase

- [X] T030 [P] `subtitulos.spec.ts` (remover com confirmação, sem chave não envia) e teste da TV (`remove` só do fornecedor pedido,
  `saveKey` nunca chamado).

**Critério de Conclusão**: T030 verde; contratos 5/5 verdes; quickstart B10–B11 conferidos.

**Registro da Fase**:

- Status: Concluída em código e testes (2026-10-23). Parada no limite autorizado pelo usuário: fim da Fase 5.
- Feito: T028 conferida e completada com "Remoção pendente" e a explicação de que não há chave pessoal para remover,
  em pt/en/es (dois testes E2E vermelhos antes do ajuste). T029 verifica as rotas locais reais: pedido de remoção,
  substituição do envelope, reenvio idempotente, pull sem chave, ack aplicado e snapshot sem chave, isolados por
  fornecedor. No adaptador real da TV, remove somente o fornecedor solicitado, sem chamar `saveSubtitleKey` nem o
  fornecedor; na seção, o próximo Atualizar volta a "Padrão do ccplayTv", preserva a outra chave e mantém o foco.
  T030 cobre confirmação/cancelamento no portal, ausência de mutação sem chave e estado final "Não configurada".
  Quickstart B10–B11 conferido por E2E do portal + integração HTTP/IndexedDB + componente da TV; o E2E integrado único
  de legendas permanece na T031. A revisão final da T025 também tirou o resumo genérico de sucesso/"sem novidades"
  quando há recusa/retry por fornecedor (terceira iteração RED→GREEN), preservando os avisos de espera/rede do botão.
- Contrato: TV `npm run test` inclui os 3 casos da 091, portal `npx vitest run` inclui 1, serviço
  `$env:PORTAL_TEST_FIRESTORE='1'; uv run pytest tests/portal --basetemp="$env:TEMP/ccplay-091-phase5-final" -q` inclui 1:
  **5/5 verdes, trava íntegra**. `check-contract-tests.ps1` das features 029/041/042/077/090 também íntegro.
- Testes executados: TV `npm run test` → **716 arquivos / 3858 testes verdes** (antes do último ajuste no resumo;
  depois dele, `npx vitest run src/features/settings/tabs/SubtitleKeysSection.test.tsx
  src/lib/portal/subtitleKeysRemote.http.test.ts` → **18/18 verdes**). Portal `npx vitest run` → **14 arquivos / 37 verdes**;
  `npx playwright test subtitulos.spec.ts --project=default` → **11/11 verdes**. Serviço (comando acima) → **204/204 verdes**;
  `uv run ruff check .` limpo; o primeiro ensaio dos novos testes de remoção acusou 503 por faltar `ConfigurationService`
  na fixture de snapshot, corrigida sem mudar o serviço, reprodução → 12/12. TV e portal: `npx tsc -b`, `npm run lint`,
  `npm run build` → exit 0 (TV com avisos, sem mudar baseline); guarda Tizen `findUnlistedFiles`/`findStaleDeclared` vazia.
  TV E2E `node e2e/run.mjs --only 'legendas-externas,legibilidade-tv,teste-conexao-tv'` → **3/3**, legibilidade em pt/en/es
  (a cobertura dos motivos novos fica na T032). Portal completo `npx playwright test` → **64 verdes, 4 pulados,
  1 falha**, descrita abaixo; a suíte completa **não** foi declarada verde.
- Pendências: flake fora do escopo em `portal-web/e2e/gerenciador.spec.ts:95` (sessão encerrada): timeout durante clique
  após o botão sair do DOM; `npx playwright test gerenciador.spec.ts --project=default --grep 'sessão encerrada'`
  → 1/1 isolado. Não corrigido, não aceito como baseline; decisão solicitada ao usuário (registrar para depois ou
  corrigir como desvio), ainda pendente neste checkpoint. Fase 6/T031–T036 não executada; G-2 continua aberto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T031 E2E da TV `tv-web/e2e/chave-legenda-portal.mjs` (Vite comercial próprio, `context.route` do portal com
  `GET /device/integrations/subtitles` entregando uma operação por fornecedor e `POST …/ack` gravado, fornecedores
  simulados; AVPlay não é necessário): Atualizar do card TMDB aplica TMDB + legendas, o da seção Legendas só as de legenda,
  recusa não troca, ack sem chave; incluir no `SUITE` de `tv-web/e2e/run.mjs`.
- [X] T032 [P] `tv-web/e2e/legibilidade-tv.mjs`: seção Legendas com a linha "Atualizar" e os estados novos em pt/en/es (SC-006);
  Playwright do portal (`layout.spec.ts`) cobre a página nos projetos mobile/tablet/desktop.
- [X] T033 [P] Docs: `docs/portal/operacao.md` (rotas, limites, retenção, escopos de limite, "sem cancelar"), regra curta no `CLAUDE.md`,
  `portal-web/README.md` (nova sub-tela).
- [X] T034 Revisão de segredos: o valor de uma chave de teste **não** aparece em `tv-web/dist`, `CCPlayTv/`, `portal-web/dist`, logs
  do serviço (`caplog`), respostas, URL, storage nem DOM; `rg -i "subtitle-key|subtitles-opensubtitles"` só em código; `.env`
  nunca impresso; chunk novo no `tizen_web_project.yaml` se a guarda acusar.
- [X] T035 Suíte completa: `npm run test`, `npm run lint`, `npm run build` (TV e portal-web), `uv run pytest tests/portal` (emulador),
  `uv run ruff check .`, `npm run test:e2e` (TV, com dev server) e Playwright do portal; quickstart A e B completos.
- [X] T036 **Gate G-2 (fechamento)**: passada na TV física — quickstart C1–C4 (chave enviada pelo portal aplicada no Atualizar,
  recusada não troca, remoção, TV sem rede mantém pendente). Sem janela de TV agora: **não fecha a feature** enquanto não
  for feita; registrar o resultado em `evidencias/`.

**Registro da Fase** (parcial — T035 e T036 abertas):

- Status: T031–T034 concluídas (2026-10-23); T035 executada com duas falhas fora do escopo da 091 (abaixo) e **não marcada**; T036 (G-2, TV física) aberta, sem janela.
- Feito: T031 `tv-web/e2e/chave-legenda-portal.mjs` (Vite comercial na 5182, portal/OpenSubtitles/SubDL/TMDB simulados por `context.route`; Atualizar do
  card TMDB aplica TMDB + legendas, o da seção Legendas só as de legenda e nem consulta a TMDB; fornecedor recusa e a chave anterior segue em uso; ack e
  snapshot só com fornecedor/id/estado/motivo; nenhuma chave em ack, snapshot, console, DOM, storage ou URL) incluído no `SUITE` de `e2e/run.mjs`.
  T032 `legibilidade-tv.mjs` (linha "Atualizar" e aviso do resultado nas três línguas) e `portal-web/e2e/layout.spec.ts` (página `subtitles` nos projetos
  mobile/tablet/desktop, 320 px e margem de rolagem do teclado). T033 `docs/portal/operacao.md` (nova seção da 091), `portal-web/README.md`, regra curta no
  `CLAUDE.md`. T034 revisão de segredos: `tv-web/dist`, `portal-web/dist` e `CCPlayTv/` sem as chaves de teste e sem nenhum dos 10 valores do `.env`
  (conferidos sem imprimir); identificadores de envelope só em código, testes, docs e specs.
- Contrato: `check-contract-tests.ps1 -Slug 091-chave-legenda-portal` → trava íntegra (exit 0); contratos 5/5 verdes nas fases anteriores e sem edição.
- Testes executados (T035): TV `npm run test` → **716 arquivos / 3858 testes verdes**; `npx tsc -b`, `npm run lint` (ratchet ok, baseline intocado) e `npm run build`
  ok; guarda do Tizen vazia nos dois sentidos. Serviço `PORTAL_TEST_FIRESTORE=1 uv run pytest tests/portal` (emulador Java 21) → **204 verdes**; `uv run ruff check .`
  limpo. Portal `npx tsc -b`, lint, `vitest` (14 arquivos / 37) e `npm run build` ok; Playwright completo → 63 verdes, 4 pulados e **falhas fora da 091**: ver Pendências.
  TV `node e2e/run.mjs` completo → **55/56**; `chave-legenda-portal` e `legibilidade-tv` verdes.
- Pendências: (1) `portal-web/e2e/gerenciador.spec.ts:95` falha sempre na suíte paralela (4 de 4 rodadas, com `--project=default`) e passa isolado/`--workers=1`;
  `licenca.spec.ts:124` falhou uma vez com o mesmo sintoma e passou nas reexecuções. A 091 não toca o shell nem o `TvDataProvider`, mas **não foi provado** que a falha existe
  antes dela; registrado como `[Bug]` no backlog (R-010), não corrigido. (2) `carrosseis-filmes-series` falhou na suíte completa da TV com "Maximum update depth exceeded"
  (flake já visto na 090) e passou 2/2 isolado; área não tocada pela 091; registrado como `[Bug]` no backlog. Por isso a suíte completa **não** está verde e T035 fica aberta.
  (3) Quickstart A/B completos não foram executados à mão (B1–B6, B10–B12 estão cobertos por `subtitulos.spec.ts` e `chave-legenda-portal.mjs`; B7–B9, B13 por testes unitários/E2E
  da TV). (4) T036/G-2 **fechado depois** (2026-10-23): 091 publicada em `ccplaytv-prod`, passada na TV com o caminho principal aceita pelo usuário (`evidencias/passada-tv-2026-10-23.md`); G-3 só oferta.

### Checklist de Release

- [X] Fase 1 (G-1: ADR-022 + constitution 1.17.0) concluída
- [X] Fase 2 (serviço e contrato de API) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Testes de contrato 5/5 verdes e `check-contract-tests.ps1` íntegro (091, 077, 090)
- [X] `test_tmdb_integration.py` e o contrato 077 verdes (a TMDB não regrediu)
- [X] `npm run lint` sem subir `architecture-baseline.json`
- [X] Revisão de segredos feita (T034)
- [X] E2E `chave-legenda-portal`, `legendas-externas`, `legibilidade-tv`, `teste-conexao-tv` e Playwright do portal verdes — ressalva: falha rara de primeira carga no Playwright do portal (bug `playwright-portal-licencaspects43-falha-esporadica-renovar`, parcial)
- [X] G-2 na TV física (T036) — fechado com o caminho principal por decisão do usuário; recusa, remoção e TV sem rede só com prova automatizada
- [ ] G-3 (aceitação do BYOK pelos fornecedores, gate G-4 da 090) registrado como pendência de **oferta** (não de código)
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

- **Fase 1** bloqueia T005 em diante (nada que envie a chave ao serviço antes do G-1). T003 (refatoração) pode começar
  antes se for puramente estrutural e não enviar nada — mas só depois de T002 (baseline).
- **Fase 2**: T003 → T005 → T006; T004 e T007 em paralelo; T008 depois de T006.
- **Fase 3** depende da Fase 2: T010 → T011 → T013; T012 e T014/T015 em paralelo; T016 depois de T012/T015; portal:
  T017 → T018 → T019; T020 em paralelo.
- **Fase 4** depende da Fase 3; **Fase 5** depende da Fase 3 (pode rodar com a 4).
- **Fase 6** depende de 3, 4 e 5; **T036** é o último.

### Parallel Opportunities

- Fase 2: T004, T007 e o início de T003. Fase 3: T014, T015, T020, T021, T022, T023.

## Implementation Strategy

1. Fase 1 (G-1) → 2. Fase 2 (serviço) → 3. Fase 3 (US1) → **parar e validar** quickstart B → 4. Fases 4–5 → 5. Polish → G-2.

## Notes

- Commitar após cada fase. Nunca editar os 4 arquivos de contrato travados.
- O molde é a feature 077: `tmdb_integration.py`, `tmdbRemote.ts`, `TmdbPage.tsx`, `tmdbStatus.ts`. Copiar a **forma**, não o texto de mensagens.
- Sem janela de TV agora (pedido do usuário, 2026-10-23): tudo menos o G-2 fecha em código, teste e E2E.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 7: Convergence

Achados do `sdd-converge` de 2026-10-23 (CRITICAL/HIGH: nenhum). T035 e os itens abertos do Checklist de Release **já são rastreados** acima e não foram duplicados aqui.

- [X] T037 Teste que prova que o backup de uso não leva a chave de legenda (origem: SC-002 / FR-009, achado F-1, MEDIUM): em arquivo novo ao lado de
  `tv-web/src/lib/backup/usageBackup.test.ts`, gravar uma chave em `subtitleCredentials` e conferir que o backup montado (e o que sobe ao serviço) não contém a chave,
  a máscara nem a tabela. Hoje a garantia é só "por construção" (`usageBackup` não lê a tabela).
- [X] T038 Fechar o SC-007 / FR-014 com número ou com decisão registrada (origem: SC-007 / FR-014 e achado A1 do Analyze, achado F-2, MEDIUM): ou repetir a medição de
  navegação/entrada de player da 089/090 na TV com o build 091 (`tizen-sonda`, **pede autorização antes de instalar**), ou registrar em `plan.md` → `## Riscos e Decisões`
  que o SC-007 fica "por construção" (nada novo roda fora do Atualizar e das telas de Integrações/portal) e foi aceito pelo usuário. Observação: o chunk
  `assets/subtitleCredentials.js` deixou de existir (absorvido por outro chunk) — conferir que o `runtime.ts` de legendas continua entrando por `import()` dinâmico.

**Registro da Fase** (Convergence):

- Status: T037 e T038 concluídas (2026-10-23).
- Feito: T037 `tv-web/src/lib/backup/usageBackup.chave-legenda.test.ts` — com as duas chaves de legenda guardadas e escolhidas, o backup de uso não contém a chave, o final dela, a tabela nem a máscara. T038 — SC-007/FR-014 aceitos **por construção** por decisão do
  usuário (sem medição na TV), registrados como R-011 em `plan.md` com a observação do chunk `subtitleCredentials.js` e do `import()` dinâmico do `runtime.ts`.
- Contrato: `check-contract-tests.ps1 -Slug 091-chave-legenda-portal` → trava íntegra (nenhum contrato novo nesta fase).
- Testes executados: `npx vitest run src/lib/backup` → 7 arquivos / 10 testes verdes; `npx tsc -b` e `npm run lint` (ratchet ok) limpos.
- Pendências: T035 (flakes fora da 091) e itens abertos do Checklist de Release; rodar o `sdd-converge` de novo.

**Atualização (2026-10-23, depois dos bugs)** — T035 fechada: os flakes que a travavam foram tratados pelo `sdd-bugfix`:
`playwright-portal-gerenciadorspects95-falha-na-suite` (verified), `e2e-tv-carrosseis-filmes-series-falha-maximum-update` (verified; `VodShowcaseScreen.tsx`) e
`playwright-portal-licencaspects43-falha-esporadica-renovar` (parcial: a corrida do `approve()` foi tratada; resta uma falha rara de primeira carga). Suítes: TV `npm run test` 717 arquivos / 3859 testes;
TV E2E `node e2e/run.mjs` 56/56; portal `npx playwright test` 65 passaram / 4 pulados; serviço 204 (sem alteração desde a Fase 6); `npx tsc -b`, lint e builds ok.
