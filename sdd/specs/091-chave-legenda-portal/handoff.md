# Handoff — 091 chave de legenda pelo portal (para o `sdd-execute`)

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Monorepo: `api/` (FastAPI, serviço do portal), `tv-web/` (React 19 + Vite, app da TV),
  `portal-web/` (React 19 + Vite, site). Planejada em 2026-10-23; **nada implementado**.
- Próximo comando: `/sdd-execute 091-chave-legenda-portal`. Status no backlog: **Planejada**.
- **Comece pela T001 (gate G-1):** ela exige a **aprovação explícita do usuário** do texto de `logic/emenda-constitution.md`
  (constitution 1.17.0, exceção (m)) e a criação da ADR-022 por `sdd-adr`. Sem isso, **não escreva** código que envie a chave ao serviço.
- O usuário **não quer janela de TV agora**: a T036 (G-2) fica como gate de fechamento; todo o resto fecha em código, teste e E2E.
- Arquivos que mudaram em disco fora desta sessão e valem reler: `sdd/specs/090-legendas-externas/*` (fechada em 67/69; BYOK
  dos dois provado na TV), `api/app/portal/` (nada tocado pela 091 além do stub), `tv-web/src/lib/portal/portalAgent.ts`
  (só a união `RefreshScope` e a assinatura de `applyIntegrations` — **sem** comportamento).

## O que a feature entrega

- **US1 (P1):** colar a chave do OpenSubtitles/SubDL em **Ajustes → Chaves de legenda** (portal); o **mesmo Atualizar** do card TMDB
  (TV, aba Integrações) a aplica (testa no fornecedor, `chosen=true`); a seção Legendas também tem **Atualizar** próprio
  (só legendas); o portal mostra "Aplicada na TV" e nunca a chave.
- **US2 (P2):** substituir (uma pendente por fornecedor), estados pendente/retry/recusada/limite/desconhecida.
- **US3 (P3):** remover pelo portal (confirmação no portal), a TV apaga no Atualizar.
- **Decisões do usuário que contrariam a expectativa óbvia:** sem "cancelar envio" e sem "Usar o padrão" no portal; sem
  confirmação na TV antes de aplicar; envio **não** exige licença; um só Atualizar (o do card TMDB) aplica tudo.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..014, SC-001..007, gates G-1..G-3, Fora de Escopo.
2. `plan.md` — decisões D-001..009, Constitution Check, riscos R-001..008, estratégia de testes.
3. `tasks.md` — 6 fases, 36 tarefas, checklist.
4. `logic/chave-legenda-portal.md` — **o "como"**: serviço (§1–§3), TV (§4–§5), portal (§6), desempenho (§7).
5. `logic/emenda-constitution.md` — texto proposto da (m) + ADR-022 (T001).
6. `contracts/portal-api-legendas.md` e `data-model.md` — rotas, corpos, limites e documento Firestore.
7. `quickstart.md` — A (automático), B (navegador), C (TV, gate G-2).
8. Molde da feature 077 (**ler, não editar**): `sdd/adr/ADR-020-*.md`, `sdd/specs/077-redesenho-portal-web/contracts/portal-api-tmdb.md`,
   `api/app/portal/tmdb_integration.py`, `routes/integrations.py`, `tv-web/src/lib/portal/tmdbRemote.ts`,
   `portal-web/src/features/settings/TmdbPage.tsx` e `tmdbStatus.ts`.
9. `.planning/memory/constitution.md` (exceções (j), (k), (l)) e `sdd/adr/ADR-021-*.md`.

## Testes de contrato (5 casos, travados)

| Arquivo | Casos | Fase |
| --- | --- | --- |
| `tv-web/src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts` | 2 | 3 |
| `tv-web/src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` | 1 | 3 |
| `portal-web/src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` | 1 | 3 |
| `api/tests/portal/test_subtitle_keys_contract.py` | 1 (o script de trava conta 0 — é Python; vale pelo SHA256) | 2 |

Comandos: ver `plan.md` → Testes de Contrato. Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 091-chave-legenda-portal`.
Travas de **outras** features que isto pode quebrar: **077** (`tmdbRemote…`, `tmdbStatus…`, shell/listas do portal),
**090**, **029/041/042** (PlayerLayer — não deveriam ser tocados).

Estado vermelho confirmado em 2026-10-23: TV `not implemented` ×2 e `expected [ 'license' ] to deeply equal [...]` (agente);
portal `Error: not implemented`; serviço `NotImplementedError` (com emulador).

## Stubs criados

- `api/app/portal/subtitle_keys.py` — `SubtitleKeyService` com 4 métodos que lançam `NotImplementedError` (T005).
- `tv-web/src/lib/portal/subtitleKeysRemote.ts` — tipos prontos; `applyRemoteSubtitleKeys`/`createSubtitleKeysRemoteStep` lançam (T010/T011).
- `portal-web/src/features/settings/subtitleKeyStatus.ts` — tipos prontos; `resolveSubtitleKeyView`/`checkSubtitleKey` lançam (T017).
- `tv-web/src/lib/portal/portalAgent.ts` — `RefreshScope` com `'subtitles'` e `applyIntegrations(signal, only?)` na interface; o escopo
  `'subtitles'` ainda cai no ramo da licença (é o que deixa o contrato vermelho) — T012 implementa.

## Armadilhas já mapeadas

- **A TMDB não pode mudar.** T003 extrai a classe-base; rode `test_tmdb_integration.py` e o contrato 077 antes e depois.
- **O rótulo da cifra inclui o fornecedor** (`subtitle-key:<provider>`) — senão um envelope serviria nos dois.
- **Dois passos independentes** no `applyIntegrations`: um lançar não pode impedir o outro (contrato e `logic §5`).
- **Erro com a chave:** o `Error` que sobe de `applyRemoteSubtitleKeys` tem mensagem **fixa** (`subtitle_apply_failed`), nunca a causa.
- **Contagens de ↓** nos testes de Integrações e em `tv-web/e2e/teste-conexao-tv.mjs` sobem em 1 com a linha "Atualizar"
  (a 090 passou exatamente por isto: R-004).
- **Ratchet de linhas:** `portalAgent.ts`, `usePortalIntegration.tsx`, `IntegrationsTab.tsx` estão perto do teto —
  extraia para arquivos ao lado em vez de subir o baseline.
- **Tizen:** se o build emitir um chunk novo (ex.: compartilhado pelo `subtitleKeysRemote`), liste em `CCPlayTv/tizen_web_project.yaml`
  (rode a guarda `findUnlistedFiles` depois do `npm run build`).
- **Java 21 fora do PATH** para o emulador (memória do projeto `java-21-emulador-firestore`); o Java padrão é o 17 (Tizen Studio).
- **O CORS do OpenSubtitles se decide na TV, não no PC** (090); aqui nada fala com o fornecedor além de `saveSubtitleKey`.
- **Portal-web:** o Playwright precisa do dev server na 5174; os testes de UI são só Playwright, a lógica é vitest `node`.
- **Pytest com emulador:** `--basetemp` no scratchpad (a pasta temporária padrão do Windows já falhou nesta máquina).
- `E2E campos-da-listagem` foi consertado (bug `e2e-campos-da-listagem-nao-acha-fileira-avaliados`); o flake de
  `carrosseis-filmes-series` ("Maximum update depth", pilha de 302 categorias sob carga) é **pré-existente** — não é da 091.

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A1 | MEDIUM | FR-013 (digitar na TV continua) e SC-007 (sem regressão de desempenho) não têm tarefa própria | Cobrir por T035 (suíte da 090 verde) e por construção (FR-014); registrar no Registro da Fase. Se quiser número, a T036 pode repetir a sonda de navegação |
| A2 | MEDIUM | SC-001 ("no máximo 3 toques") não é asserção de nenhum teste | Acrescentar a contagem de ações em `subtitulos.spec.ts` (T021) |
| A3 | MEDIUM | O contrato Python é protegido só por SHA256 (o script o conta como 0 testes) e pula sem emulador | Rodar a suíte do serviço **com** emulador antes de fechar a Fase 2 (T008/T035) |
| A4 | LOW | A spec cita "Atualizar do card TMDB aplica tudo" mas não diz o que a mensagem do botão informa | Texto `portal.refresh.tmdbDone` fica; o resultado por fornecedor vem pelas linhas da seção Legendas (T016) |

## Gate de pronto

- Contratos 5/5 verdes e travas íntegras (091, 077, 090, 029, 041, 042).
- `npx tsc -b`, `npm run lint` (ratchet sem subir), `npm run build` (TV e portal-web) com guarda do Tizen vazia; `uv run pytest tests/portal`
  (emulador) e `uv run ruff check .`; `npm run test`; E2E `chave-legenda-portal`, `legendas-externas`, `legibilidade-tv`,
  `teste-conexao-tv` e Playwright do portal; quickstart A e B.
- Docs a atualizar no Polish: `docs/portal/operacao.md`, `CLAUDE.md` (versão da constitution e regra curta), `portal-web/README.md`.
- **G-2 (TV física) é gate de fechamento** (T036) e o usuário não tem janela agora: deixe a feature em "Em Execução" até lá.
