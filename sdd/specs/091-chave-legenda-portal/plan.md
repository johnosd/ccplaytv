# Implementation Plan: Chave de legenda digitada no portal

**Slug**: `091-chave-legenda-portal` | **Date**: 2026-10-23 | **Spec**: `sdd/specs/091-chave-legenda-portal/spec.md`

## Summary

No portal, **Ajustes → Chaves de legenda**: a pessoa cola a chave do OpenSubtitles e/ou do SubDL, que o serviço guarda
**cifrada** (uma pendente por TV e por fornecedor, até 7 dias) até a TV a buscar no **Atualizar**; a TV a aplica pelo
caminho que já existe (`saveSubtitleKey`: formato, teste no fornecedor, `chosen = true`) e devolve só
`applied|rejected|retry` + motivo fechado; o portal mostra o estado real e nunca a chave. É o **mesmo desenho da chave
TMDB (077/ADR-020)**, repetido por fornecedor: documento por fornecedor, rotas `/integrations/subtitles/*`, passo
`integrations` do Atualizar ampliado (o do card TMDB aplica tudo; o novo escopo `subtitles`, na seção Legendas, aplica só
as de legenda), snapshot opcional `integrations.subtitles`. **Gate de governança antes de qualquer código que envie a
chave ao serviço:** ADR-022 + constitution 1.17.0, exceção nova (m) (`logic/emenda-constitution.md`).

## Technical Context

**Language/Version**: Python 3.13 + FastAPI (`api/app/portal`); TypeScript 5 + React 19 (`tv-web`, `portal-web`).

**Primary Dependencies**: nenhuma nova. Serviço: `PortalCrypto`, `AuthService`, repositório Firestore (`transact`),
`RateConstraint`. TV: `saveSubtitleKey`/`removeSubtitleKey` (090), `PortalConnection`, `PortalAgent`. Portal: `api.ts`
(`request`), `DeleteDialog`, `EyeIcon`, `useTvDataContext`.

**Storage**: Firestore `devices/{id}/integrations/subtitles-{provider}` (novo, mesmo schema da TMDB); `rateLimits/` com
3 escopos novos; snapshot ganha `integrations.subtitles` opcional. TV e portal: **nada novo** (a chave aplicada vai para
`subtitleCredentials` da 090; o portal não persiste nada).

**Testing**: pytest + emulador Firestore (`PORTAL_TEST_FIRESTORE=1`, Java 21 — `memory/java-21-emulador-firestore.md`);
vitest `node`/`dom` (TV e portal-web); Playwright do portal-web (`portal-web/e2e/*.spec.ts`, dev server na 5174); E2E da
TV (`tv-web/e2e`, Vite comercial próprio + `context.route`); TV física só para G-2 (gate de fechamento, sem janela agora).

**Target Platform**: Cloud Run (serviço); navegador móvel/desktop (portal); Samsung QN50Q60DAGXZD Tizen 9 (`file://`).

**Performance Goals**: zero regressão (FR-014, SC-007): nenhum código novo no player, na navegação ou na montagem de tela;
na TV o código novo roda no clique de Atualizar e ao abrir Integrações; o `snapshot` do Atualizar lê ≤ 2 registros.

**Constraints**: ratchet de linhas (`IntegrationsTab.tsx`, `usePortalIntegration.tsx`, `portalAgent.ts` perto do teto —
extrair para arquivos novos); `tizen_web_project.yaml` precisa listar qualquer chunk novo; testes de contrato travados da
077 (`tmdbRemote…`, `tmdbStatus…`) e da 090 **não** podem quebrar; o comportamento da chave TMDB não muda; build base
(sem portal) não ganha nada visível.

**Scale/Scope**: 2 fornecedores × 1 TV; operações raras (alguns envios por vida do aparelho).

## Decisões Invariantes

- **D-001 — Repete a ADR-020, não a reinventa.** Mesma cifra de envelope, uma pendente, 7 dias, ack mínimo, idempotência,
  recusa uniforme, "o navegador só envia". Diferenças só onde o fornecedor exige: contexto de cifra por fornecedor, formato
  `8–200`, escopos de limite próprios.
- **D-002 — Um documento por TV e por fornecedor** (`subtitles-opensubtitles`, `subtitles-subdl`): substituir um não toca
  no outro; o rótulo da cifra inclui o fornecedor (envelope de um não decifra no outro).
- **D-003 — Refatorar, não copiar.** `KeyIntegrationService` (classe-base) em `key_integration.py`; `TmdbIntegrationService`
  vira especialização **sem mudar comportamento nem os testes**; `SubtitleKeyService` compõe duas instâncias.
- **D-004 — Um só Atualizar na TV para o usuário.** O escopo `tmdb` (card TMDB) e `lists` aplicam TMDB **e** legendas; o
  novo `subtitles` aplica só as de legenda. Os dois passos são independentes: a falha de um não impede o outro.
- **D-005 — A TV continua dona da decisão.** A chave só substitui a existente depois do teste no fornecedor; recusa não
  troca nada; `retry` mantém a operação.
- **D-006 — Sem "cancelar pendente" e sem "Usar o padrão" pelo portal** (spec, Fora de Escopo). Remover = operação `remove`.
- **D-007 — TV antiga ⇒ "Estado desconhecido".** `integrations.subtitles` é opcional no snapshot; ausente nunca é lido
  como "não configurada".
- **D-008 — A chave nunca aparece**: nem em ack, snapshot, erro, log, corpo de resposta ao navegador, URL, `Referer`,
  storage, DOM depois do envio, backup. O snapshot não leva máscara nem formato.
- **D-009 — Nada de código que envie a chave ao serviço antes do G-1** (ADR-022 + constitution 1.17.0 aprovados).

## Constitution Check

Constitution 1.16.0 (a 1.17.0 é o gate G-1).

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | O portal segue sem conta própria: a pessoa é a que já tem ID + chave da TV (ADR-014). |
| Segredos Fora dos Clientes e dos Logs | ⚠️ exige emenda | ✅ com G-1 | Nova exceção (m) no molde da (j): navegador → serviço (cifrado) → mesma TV. **T001 bloqueia o código.** A chave do desenvolvedor continua proibida em cliente. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Só o botão **Atualizar** (e as ações do portal) falam com o serviço; nada ao focar/abrir (ADR-016). Falha do serviço não afeta reprodução nem o que está guardado. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Digitar na TV (090) continua; o portal é um caminho a mais. Atualizar e a linha nova são focáveis. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | A linha "Atualizar" e o estado "sem portal" têm foco por estado; contagens de ↓ dos testes sobem em 1. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN/foco da aba Integrações inalterados; a linha nova entra no mesmo modelo de foco por linha. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | "Enviado — na TV, aperte Atualizar", nunca "aplicado" antes do ack; estado vem do resultado real. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | ✅ | ✅ | Não toca em catálogo. |
| Documentação do Repositório É Canônica | ✅ | ✅ | ADR-022, constitution 1.17.0, `docs/portal/operacao.md`, CLAUDE.md (versão e regra). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/091-chave-legenda-portal/
├── spec.md · plan.md · tasks.md · handoff.md · quickstart.md · data-model.md
├── contracts/portal-api-legendas.md
├── logic/chave-legenda-portal.md      # serviço, TV, portal (§1–§7)
├── logic/emenda-constitution.md       # texto proposto da (m) + ADR-022 (gate G-1)
└── contract-tests.lock
```

### Source Code (repository root) — arquivos que a feature toca

```text
api/app/portal/
├── key_integration.py            # NOVO (T003): classe-base extraída de tmdb_integration.py
├── tmdb_integration.py           # vira especialização (sem mudar comportamento)
├── subtitle_keys.py              # STUB do plano → T005
├── models.py                     # alias KeyOperationDocument; SubtitlesSnapshot; IntegrationsSnapshotDocument.subtitles
├── routes/subtitle_keys.py       # NOVO (T006)
├── routes/operations.py          # SnapshotInput aceita integrations.subtitles (já usa IntegrationsSnapshotDocument)
└── application.py                # registra o router
api/tests/portal/
├── test_subtitle_keys_contract.py    # CONTRATO (travado)
└── test_subtitle_keys_routes.py      # NOVO (T008)

tv-web/src/lib/portal/
├── subtitleKeysRemote.ts             # STUB do plano → T010/T011
├── subtitleKeysRemote.http.test.ts   # NOVO (T011)
├── portalAgent.ts                    # RefreshScope 'subtitles' + applyIntegrations(signal, only) (T012)
├── snapshotPublisher.ts              # integrations.subtitles (T014)
├── useRefreshAction.ts               # fingerprint/mensagens do escopo 'subtitles' (T015)
tv-web/src/features/portal/usePortalIntegration.tsx   # monta applyIntegrations (T013)
tv-web/src/features/settings/{integrationsModel.ts,tabs/IntegrationsTab.tsx,tabs/SubtitleKeysSection.tsx}  # linha Atualizar (T016)
tv-web/src/lib/i18n/messages/{subtitles.ts,portal.ts}                                              # textos (T016)

portal-web/src/features/
├── api.ts                              # subtitleKeys.{status,set,remove}
├── settings/subtitleKeyStatus.ts       # STUB do plano → T017
├── settings/SubtitleKeysPage.tsx       # NOVO (T018)
├── settings/{items.ts,SettingsPage.tsx}   # item "Chaves de legenda" após a TMDB (T019)
└── lib/i18n/areas/novoPortal.ts        # textos pt/en/es (T020)
portal-web/e2e/subtitulos.spec.ts       # NOVO (T021)
```

**Structure Decision**: monorepo existente (`api/`, `tv-web/`, `portal-web/`); nenhum diretório novo de código.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Nova exceção (m) em "Segredos" (G-1) | A (l) e a ADR-020 exigem decisão própria para estender o envio pelo portal a um novo BYOK | Estender a ADR-020 por nota: contraria a frase dela; "só digitar na TV": rejeitada pelo usuário (é a dor que a feature resolve) |
| Refatorar `tmdb_integration.py` em classe-base | Evita copiar ~200 linhas sensíveis (cifra, época, expiração) e divergir | Copiar e colar: dois lugares para corrigir bug de segredo |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV física, só G-2).

Comandos-base:

```powershell
# TV
cd tv-web; npx vitest run src/lib/portal src/features/settings src/lib/subtitles src/lib/i18n
npx tsc -b; npm run lint; npm run build
# Portal web
cd portal-web; npx vitest run; npm run test:e2e -- tests --project=default   # dev server na 5174
# Serviço (emulador Firestore, Java 21 só no processo — ver memory/java-21-emulador-firestore.md)
cd api; $env:PORTAL_TEST_FIRESTORE=1; uv run pytest tests/portal; uv run ruff check .
# E2E da TV (com `npm run dev`)
cd tv-web; node e2e/run.mjs --only chave-legenda-portal,legendas-externas,legibilidade-tv,teste-conexao-tv
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 casos; o Python entra pelo SHA256 — o contador do script só conta JS/TS):
`tv-web/src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts` (2),
`tv-web/src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` (1),
`portal-web/src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` (1),
`api/tests/portal/test_subtitle_keys_contract.py` (1, exige emulador).

Comando (TV + portal): `cd tv-web; npx vitest run src/lib/portal/subtitleKeysRemote.chave-legenda-portal.contract.test.ts src/lib/portal/portalAgent.chave-legenda-portal.contract.test.ts` ·
`cd portal-web; npx vitest run src/features/settings/subtitleKeyStatus.chave-legenda-portal.contract.test.ts` ·
`cd api; $env:PORTAL_TEST_FIRESTORE=1; uv run pytest tests/portal/test_subtitle_keys_contract.py`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| aplica cada fornecedor pelo caminho da TV; recusa não confirma; ack só com fornecedor/id/resultado | US1/AC5-AC6, US3, FR-006/007/008, Segredos | 3 | `Error: not implemented` |
| falha inesperada de um fornecedor não confirma, não impede o outro, erro sem a chave | FR-006/007, Segredos | 3 | `Error: not implemented` |
| escopo `subtitles` aplica só as de legenda; `tmdb`/`lists` aplicam tudo | FR-005, US1/AC3-AC4 | 3 | `expected [ 'license' ] to deeply equal [ 'integrations:subtitles', 'snapshot' ]` |
| estado por fornecedor sem o valor; "desconhecido"; formato 8–200 sem eco | US1/US2/US3, FR-002/003 | 3 | `Error: not implemented` |
| por fornecedor: cifrada, só a mesma TV, substituir/ack só do seu fornecedor, nunca a chave na vista | FR-004/009/010, SC-002/004 | 2 | `NotImplementedError: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `api/app/portal/subtitle_keys.py`,
`tv-web/src/lib/portal/subtitleKeysRemote.ts`, `portal-web/src/features/settings/subtitleKeyStatus.ts`, e em
`tv-web/src/lib/portal/portalAgent.ts` a união `RefreshScope` com `'subtitles'` e a assinatura
`applyIntegrations(signal, only?)` (sem o comportamento).

## Estado Atual

<!-- Preenchido pelo sdd-execute -->

| Área | Estado |
| --- | --- |
| Planejamento / Fase 1 (G-1) | Concluído: constitution 1.17.0 (exceção (m)), ADR-022 aceita, notas nas ADR-020/021 |
| Serviço (Fase 2) | Concluído: `KeyIntegrationService`, `SubtitleKeyService`, 5 rotas, 198 testes do portal com emulador, ruff limpo |
| TV (Fase 3) | Concluído: aplicação das chaves, agente (escopo `subtitles`), passos independentes, snapshot com recuo, linha "Atualizar" da seção Legendas |
| Portal (Fase 3) | Concluído: `subtitleKeyStatus`, `SubtitleKeysPage`, item em Ajustes, textos pt/en/es, FAQ; 9 testes Playwright |
| Fase 4 (US2) | Concluída: motivos do ack na TV, substituição/retry/expiração por fornecedor e estados do portal; 202 testes do serviço, 36 unitários e 11 E2E do portal |
| Fase 5 (US3) | Concluída: remoção com confirmação, estado pendente/final, isolamento por fornecedor; 204 testes do serviço, 37 unitários e 11 E2E de legendas do portal |
| Validação TV | 3858 unitários verdes; ajuste final do resumo validado em 18 testes; 3/3 E2E de regressão, builds e guarda Tizen vazia |
| Validação portal completa | 64 passaram, 4 pulados e 1 timeout em `gerenciador.spec.ts:95`; passa isolado, flake aberto fora do escopo (decisão do usuário pendente) |
| Fase 6 | Parcial: T031–T034 feitas (E2E da TV, legibilidade/layout, docs, revisão de segredos); T035 aberta por dois flakes fora da 091; T036 (G-2) aberta |
| G-2 (TV física, T036) | Fechado em 2026-10-23 com o caminho principal por decisão do usuário (envio → Atualizar → validação → legendas dos dois provedores); recusa, remoção e TV sem rede só com prova automatizada; G-3 só oferta |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O serviço passa a guardar, cifrada e por até 7 dias, uma chave pessoal de terceiro por fornecedor (risco aceito na ADR-020, estendido) | Vazamento simultâneo de sessão do portal + cofre do serviço expõe a cota gratuita da pessoa | Resolvido: envelope cifrado com contexto por fornecedor, uma pendente, 7 dias e apagado ao aplicar/recusar/substituir/remover (204 testes do serviço, incluindo cifra por fornecedor e expiração); G-1 registra o risco. Mesma cifra/contexto/expiração da TMDB; chave revogável no fornecedor; G-1 registra o risco |
| R-002 | Quem tem a sessão do portal pode trocar a chave sem confirmação na TV | Chave trocada sem a pessoa saber | Resolvido: a TV só troca depois do teste no fornecedor (recusa não troca, verificado em `chave-legenda-portal.mjs` e nos testes da TV) e o resultado fica visível; sem confirmação na TV por decisão do usuário. A TV só troca depois do teste no fornecedor; o resultado fica visível; se houver abuso, exigir confirmação na TV (revisitar ADR-022) |
| R-003 | Refatorar `tmdb_integration.py` pode alterar o TMDB | Regressão num segredo já em produção | Resolvido: `test_tmdb_integration.py` e o contrato 077 seguem verdes (204 testes do portal) e o E2E de pilha real da TMDB (`chave-tmdb-pelo-portal.mjs`) passou com a 091. T003 sem mudar comportamento; `test_tmdb_integration.py` e o contrato 077 devem ficar verdes **antes** de começar o subtitles |
| R-004 | Contagens de ↓ nos testes da aba Integrações (e `e2e/teste-conexao-tv.mjs`) sobem em 1 com a linha "Atualizar" | Falso vermelho em testes que não são desta feature | Resolvido: contagens de ↓ trocadas por "andar até o foco chegar" em `teste-conexao-tv.mjs` e ajustadas nos testes de Settings; `integrationRows(hasPortal)`. T016 atualiza as contagens, como a 090 fez; lição de `memory`/R-024 da 090 |
| R-005 | TV antiga/serviço antigo | Portal afirmaria algo falso | Resolvido: `subtitles` opcional no snapshot, recuo do 422 na TV e "Estado desconhecido" no portal (testes e `subtitulos.spec.ts`). D-007: `subtitles` opcional, "Estado desconhecido" |
| R-006 | Limite de 10 mutações/h somado aos dois fornecedores | Pessoa que erra a colagem muitas vezes é barrada | Resolvido: 429 uniforme (testes de rotas); mesmo teto da TMDB. Mensagem uniforme 429 do portal; é o mesmo teto da TMDB |
| R-007 | G-2 (passada na TV física) não tem janela agora | Feature não pode ser declarada entregue | Resolvido (com ressalva): a 091 está em produção (`ccplaytv-prod`) e o G-2 foi fechado em 2026-10-23 com o caminho principal observado na TV; recusa, remoção e TV sem rede só têm prova automatizada (`evidencias/passada-tv-2026-10-23.md`). Fica como gate de fechamento explícito no `tasks.md` (T036); o resto fecha em código/teste/E2E |
| R-008 | A feature 090 deixou a chave pessoal funcional e provada na TV; esta não mexe nela | — | Resolvido: `saveSubtitleKey` reaproveitado sem alteração; só o caminho de entrada é novo. Só o caminho de entrada é novo; `saveSubtitleKey` é reaproveitado sem alteração |
| R-009 | O estado da chave guardada não informa por que a nova chave do portal falhou | A TV mostraria só a chave anterior válida, sem explicar recusa/retry | Resolvido: resultado mínimo do ack em memória por banco (`subtitleKeyFeedback`), lido ao reler a seção; sem chave, operação ou persistência. Novo Atualizar e correção local limpam o aviso |
| R-010 | A suíte completa Playwright do portal apresentou timeout em `gerenciador.spec.ts:95`, fora do escopo, ao clicar num botão removido do DOM; passa isolado | A suíte completa do portal ainda não está verde | Resolvido: `gerenciador.spec.ts:95` corrigido pelo bug `playwright-portal-gerenciadorspects95-falha-na-suite` (verified). Resíduo: falha rara de primeira carga no Playwright do portal (bug `playwright-portal-licencaspects43-falha-esporadica-renovar`, parcial). Arquivo preservado; achado aberto, sem tratá-lo como baseline. Usuário consultado para registrar depois ou autorizar correção como desvio |
| R-011 | SC-007 / FR-014 (sem regressão de desempenho) aceitos "por construção", sem medição na TV (decisão do usuário, 2026-10-23) | Regressão de desempenho não detectada por número | Resolvido: nenhuma evidência de violação — nada novo roda fora do Atualizar e das telas de Integrações/portal; decisão do usuário registrada. Mitigação por construção, confirmada na convergência: nada novo roda fora do Atualizar (snapshot, passo `integrations`) e das telas de Integrações/portal; o player continua sem leitura nova e o `runtime.ts` de legendas entra por `import()` dinâmico (`components/player/useExternalSubtitles.ts`). Observação: o chunk `assets/subtitleCredentials.js` deixou de ser emitido (módulo absorvido por outro chunk pelo caminho do portal) e foi removido do `tizen_web_project.yaml`. Se a TV ficar lenta, medir com a `tizen-sonda` antes de otimizar (lição da 088/089) |

## Execution Notes

<!-- Preenchido pelo sdd-execute -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-23 | Fase 1 — Setup (G-1) | Emenda aprovada "como está": constitution 1.17.0 (m), ADR-022, notas ADR-020/021, `CLAUDE.md`; linha de base verde | — |
| 2026-10-23 | Fase 2 — Foundational | `KeyIntegrationService` extraído sem mudar a TMDB (5/5 antes e depois); `SubtitleKeyService`, rotas, cliente do portal; 198 testes com emulador | — |
| 2026-10-23 | Fase 3 — US1 | TV (T010–T016), portal (T017–T020), testes (T021–T023); contratos 3+1 verdes, 850 testes da TV, 21 Playwright do portal, E2E da pilha real da TMDB; yaml do Tizen sem a entrada obsoleta | Sem E2E de pilha real para legendas; G-2 aberto |
| 2026-10-23 | Fase 4 — US2 | T024–T027: estados conferidos; motivos do ack na TV sem trocar chave anterior; substituição/retry/retenção testados; contratos 5/5, builds e guarda Tizen verdes | T031/T032 e G-2 ficam na Fase 6 |
| 2026-10-23 | Fase 5 — US3 | T028–T030: remoção pendente/final em pt/en/es, rotas/ack/snapshot e IndexedDB por fornecedor; 204 serviço, 3858 TV, 37 portal, 11 E2E de legendas e 3 E2E da TV verdes; resumo da T025 ajustado e 18 testes verdes | Parada autorizada; Fase 6/G-2 abertos e flake de sessão no E2E completo do portal (R-010) |
| 2026-10-23 | Fase 6 — Polish (T031–T034) | E2E `chave-legenda-portal` no SUITE; legibilidade e layout cobrem a página; docs; revisão de segredos limpa; 3858 TV + 204 serviço verdes; E2E TV 55/56 | Flakes `gerenciador.spec.ts:95` e `carrosseis-filmes-series` (registrados como [Bug]); G-2/T036 |

PRÓXIMO: rodar o `sdd-converge` outra vez. Itens ainda abertos no Checklist: G-3 (oferta, sem código) e o `quickstart.md` à mão. Resíduo: falha rara de primeira carga no Playwright do portal (bug `playwright-portal-licencaspects43-falha-esporadica-renovar`, parcial) e falhas do início do roteiro `carrosseis-filmes-series` só sob `E2E_CPU=4` (pré-existentes).

## Arquivos Principais

<!-- Preenchido pelo sdd-execute -->

```text
api/tests/portal/test_subtitle_keys_routes.py
tv-web/src/lib/portal/{subtitleKeysRemote.ts,subtitleKeyFeedback.ts,subtitleKeysRemote.http.test.ts}
tv-web/src/features/settings/{useSubtitleKeys.ts,tabs/IntegrationsTab.tsx,tabs/SubtitleKeysSection.tsx,tabs/SubtitleKeysSection.test.tsx}
tv-web/src/lib/i18n/messages/subtitles.ts
portal-web/src/features/settings/{subtitleKeyStatus.ts,subtitleKeyStatus.test.ts,SubtitleKeysPage.tsx}
portal-web/src/lib/i18n/areas/novoPortal.ts
portal-web/e2e/subtitulos.spec.ts
```

## Cuidados para Retomada

- A trava de contrato inclui um arquivo **Python** (`test_subtitle_keys_contract.py`): ele é protegido pelo SHA256, mas o
  script de trava o conta como 0 testes. Ele exige o emulador Firestore (Java 21 fora do PATH, ver memória do projeto) e
  `PORTAL_TEST_FIRESTORE=1`; sem isso, **pula** em vez de falhar.
- O `tmdbRemote.ts` e a página `TmdbPage.tsx` são o molde — mas **não os edite** além do estritamente necessário (a TMDB já
  está em produção).
- O CORS e o resto dos fornecedores já foram provados na 090; aqui nada fala com o fornecedor a não ser `saveSubtitleKey`.
- As linhas da aba Integrações da TV agora vêm de `integrationRows(hasPortal)` (não há mais `SUBTITLE_ROW_*`/`SPEED_TEST_ROW`
  estáticos): a linha "Atualizar" das legendas existe só com o portal visível. Teste/E2E que conta ↓ deve andar até o foco
  chegar no alvo, não contar passos fixos.
- `messages/portal.ts` está no teto de 300 linhas do ratchet: texto novo do portal da TV vai em outra área (as chaves
  `portal.refresh.subtitles*` moram em `messages/subtitles.ts`).
- O E2E `chave-tmdb-pelo-portal.mjs` não está em `SUITE` de `e2e/run.mjs`: rode direto, com a 8085/5174/3001/5176 livres e
  `CCPLAY_EMULATOR_JAVA_HOME` apontando para o Java 21.
- No PowerShell desta sessão, `npm run test:e2e -- --only a,b,c` foi consumido como opção do npm; a execução sem filtro
  foi interrompida. O comando confirmado é `node e2e/run.mjs --only 'legendas-externas,legibilidade-tv,teste-conexao-tv'`.
- O resultado mínimo do ack só vive em `subtitleKeyFeedback.ts`, em memória por banco; a seção o relê depois do Atualizar.
  Não persistir operação nem chave para explicar recusa; corrigir/testar/remover localmente precisa limpar o aviso antigo.
- `gerenciador.spec.ts:95` passou isolado depois de falhar na suíte completa: R-010 continua aberto. Não aumentar timeout,
  mexer no teste fora do escopo ou declarar a suíte completa verde sem resolver a pendência.

## Resultado Final

**Convergida em 2026-10-23** (`sdd-converge`). A chave de legenda (OpenSubtitles e SubDL) colada no portal (Ajustes → Chaves de legenda) é cifrada no serviço (uma pendente por TV e por fornecedor, 7 dias),
buscada pela TV só no **Atualizar**, testada no próprio fornecedor antes de gravar (recusa não troca a chave que já funciona) e confirmada com o resultado mínimo `applied|rejected|retry`. O snapshot informa o estado por
fornecedor, sem valor nem máscara; TV ou serviço antigos mostram "Estado desconhecido".

- **Construído:** `KeyIntegrationService` (classe-base extraída sem mudar a TMDB) + `SubtitleKeyService` e 5 rotas; `subtitleKeysRemote.ts`, escopo `subtitles` no `PortalAgent`, `integrationSteps.ts`, linha "Atualizar" na seção Legendas
  (`integrationRows(hasPortal)`), resultado do ack em memória (`subtitleKeyFeedback.ts`); portal com `SubtitleKeysPage`, item em Ajustes, textos pt/en/es e FAQ; constitution 1.17.0 (exceção (m)) e ADR-022.
- **Em produção:** `ccplaytv-prod` (`ccplaytv-portal` rev. `00007-dsn`, `ccplaytv-portal-jobs` rev. `00007-f9t`, imagem `091-20261023-1408`); staging (`ccplaytv-511322`) também recebeu a imagem. TV de referência com o pacote novo.
- **Desvios em relação ao plano:** (1) `windowAnchor` da vitrine de Filmes não pôde ser derivado (ciclo) e passou a ser ajustado durante o render — corrigiu o "Maximum update depth" do E2E `carrosseis-filmes-series` (bug próprio, fora do escopo
  da 091); (2) resultado do ack por fornecedor em memória (`subtitleKeyFeedback.ts`, R-009) para explicar recusa/retry sem persistir nada; (3) `assets/subtitleCredentials.js` deixou de ser um chunk próprio e saiu do `tizen_web_project.yaml`;
  (4) mensagem do Atualizar da TMDB passou de "Chave TMDB atualizada." para "Chaves atualizadas."; (5) `messages/portal.ts` no teto do ratchet: as chaves `portal.refresh.subtitles*` vivem em `messages/subtitles.ts`.
- **Decisões do usuário:** SC-007/FR-014 "por construção" (R-011); G-2 fechado com o caminho principal (recusa, remoção e TV sem rede só com prova automatizada).
- **Pendências honestas:** G-3 (aceitação do BYOK pelos fornecedores) é só oferta, sem código; o `quickstart.md` não foi executado inteiro à mão (B1–B6 e B10–B12 têm cobertura automatizada); resíduo de teste: falha rara de primeira carga no Playwright
  do portal (≈ 1 em 15–40 suítes completas) e falhas do início do roteiro `carrosseis-filmes-series` só sob `E2E_CPU=4` (pré-existentes).
- **Validação final:** contratos 5/5 verdes (4 TS/portal + 1 Python no pytest do serviço) e trava íntegra; TV 717 arquivos / 3859 testes; serviço 204; portal 14 arquivos / 37 testes; E2E da TV 56/56; Playwright do portal 65 passaram / 4 pulados.
