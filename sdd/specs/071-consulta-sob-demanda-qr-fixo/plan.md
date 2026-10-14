# Implementation Plan: Consulta sob demanda e QR fixo

**Slug**: `071-consulta-sob-demanda-qr-fixo` | **Date**: 2026-10-14 | **Spec**: `sdd/specs/071-consulta-sob-demanda-qr-fixo/spec.md`

## Summary

Tira o app do modo "agente com relógio" e o coloca em **ação da pessoa**: o `PortalAgent` deixa de ter ciclo diário, janela rápida e timers e ganha `refresh(scope)` chamado por botões **Atualizar** (listas e licença) com pausa de 10 s. O QR passa a ser **fixo e gerado na TV** (endereço + ID + chave no fragmento), a tela de bloqueio mostra QR/endereço/ID/chave, o **teste de 7 dias é contado no app** (relógio protegido por marca d'água) com **âncora no 1º contato manual**, e a TV **envia nome/host/usuário/senha** das listas ao site (fila durável, primeira vez sobe tudo).

Abordagem: evoluir as superfícies da 069/070 (agente, painel Adicionar, `LicenseGate`, portal-web `takeEntry`, API de configurações) sem tela nova de cadastro. Três decisões contrariam a constitution 1.10.0 (credenciais IPTV no serviço, chave dentro do QR, chave também no bloqueio): **a Fase 1 é a emenda 1.11.0 + ADR-016** e nenhum código de comportamento começa antes dela.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (Vite 8, alvo `chrome108`) em `tv-web/` e `portal-web/`; Python 3.13 + FastAPI (async) em `api/` (`app/portal/`, isolado do fallback).

**Primary Dependencies**: Dexie (IndexedDB) e `useRemoteNav`/`useTvKeyNav`; Firestore + `cryptography` (AES-GCM) no serviço; **nova**: gerador de QR em JS para a TV (ver `research.md` §1).

**Storage**: TV — tabelas novas `localTrial` e `sourceUploads` (Dexie; reler a versão livre do schema antes de migrar), `portalDevice`/`licenseCache` existentes. Serviço — `devices` (âncora do teste no cadastro), `configurations`/`configurationVersions` cifradas (069), sem coleção nova.

**Testing**: Vitest (`dom`/`node`), fake-indexeddb, Playwright E2E (`tv-web/e2e/*.mjs`, `portal-web/e2e/*.spec.ts`), pytest + emulador Firestore (`PORTAL_TEST_FIRESTORE=1`), Ruff.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`); portal em Cloud Run (staging `ccplaytv-511322`).

**Performance Goals**: Atualizar de listas/licença conclui em ≤ 5 s com internet (SC-002/003); QR fixo desenhado em < 200 ms sem rede.

**Constraints**: textos ≥ 20 px e tokens V14; todo estado focável; foco nunca dispara consulta (só SELECT no botão); ratchet de arquitetura (sem import feature→feature novo, teto de linhas); contratos travados de 069/070 preservados salvo emenda aprovada; segredo nunca em log/URL enviada ao servidor/erro; `tizen_web_project.yaml` lista todo arquivo novo emitido.

**Scale/Scope**: 1 TV por chave; ≤ 10 requisições/mês por TV em uso típico (SC-007); piloto de dezenas a centenas de TVs.

## Decisões Invariantes

- **D-001 — Gate normativo**: constitution 1.11.0 e ADR-016 aprovadas antes de qualquer task de US1–US5. Escopo da emenda: (d) a TV envia credenciais IPTV (host, usuário, senha, URL M3U) ao serviço, que as guarda cifradas, nunca em log e só as devolve à sessão da mesma TV; (e) a chave do dispositivo pode ir **no fragmento** do QR fixo (nunca em path, query, log ou resposta); (f) a chave é visível na tela de bloqueio além da tela Adicionar. Nada mais é relaxado.
- **D-002 — Sem timers de rede**: o agente não agenda nada. `DAY`, `RETRIES`, `quick`, `acquirePortalQuick`, `portalQuickMode` e `usePortalAgent(quick)` saem. `attach(_quick?)` mantém a assinatura (aceita e ignora) para não quebrar contratos/testes existentes. Só ações da pessoa disparam rede.
- **D-003 — Escopos do Atualizar**: `refresh('lists')` = `flushDeletions → flushUploads → pull → publishSnapshot`; `refresh('license')` = só `refreshLicense`. Pausa de 10 s **por escopo**, medida pelo relógio injetado; repetição dentro da pausa devolve `{ ok:false, code:'wait' }` **sem** requisição e **sem** dormir.
- **D-004 — Cadastro preguiçoso**: `connection.ready()` deixa de rodar no mount do app. É chamado quando uma tela precisa de ID/chave (Adicionar lista, bloqueio, Portal & licença), por Atualizar e pelo primeiro envio. Falha mostra estado focável; o botão tenta de novo.
- **D-005 — Teste local**: tabela `localTrial` `{ id:'trial', startedAt, highWatermark }` criada na 1ª abertura do build comercial, sem rede. Decisão de acesso = licença assinada válida **ou** teste local vigente; `state:'revoked'` assinado vence o teste local. `evaluatePlaybackAccess` (contrato C5 da 069) **não muda**.
- **D-006 — Âncora**: o cadastro (`POST /devices/enroll`) aceita `trialStartedAt` (ms) opcional; o serviço grava `trial_started_at = min(created_at, trialStartedAt válido)`, nunca mais tarde, e devolve o início gravado. A TV reconcilia com `min(local, servidor)`. Reinstalação da mesma identidade recebe o início existente (idempotência de enroll).
- **D-007 — QR fixo**: `buildFixedQrUrl({site,displayId,deviceKey})` = `<origem>/#id=<ID>&key=<chave>`. Gerado na TV (`research.md` §1), sem requisição. Rota de convite `manage` deixa de ser usada pela TV; os convites de recuperação (069) permanecem.
- **D-008 — Entrada pelo site**: o `portal-web` já consome o fragmento (`takeEntry`); passa a aceitar `#id`+`#key` → `POST /sessions/manual` (existente) e limpa o fragmento com `replaceState`. Sem rota nova de login; limites e recusa uniforme da 070 permanecem.
- **D-009 — Envio TV → site**: rota nova `POST /portal/v1/device/sources` (bearer da TV, lote ≤ 10). O serviço reutiliza `ConfigurationService` (cifra, versão imutável, CAS por revisão) gravando `applied_revision = revision`, **sem** operação pendente e sem expirar em 7 dias. Fonte com tombstone responde 410 por item. Idempotente por digest.
- **D-010 — Fila**: `sourceUploads { sourceId, uploadedRevision }` + `planSourceUploads` (função pura, contrato C5). Adicionar/editar tenta enviar uma vez, no ato; falha mantém a fila. A fila **não** é esvaziada ao abrir o app (nenhuma requisição inicial); só por Atualizar ou por nova ação de lista.
- **D-011 — Exclusão**: continua enviada no ato (T057 da 069); a observação da outbox por `liveQuery` deixa de disparar envio ao abrir o app com pendência herdada — fica para o Atualizar.
- **D-012 — Sem detecção de estorno**: aceito (R-005). A licença assinada vigente continua válida offline até vencer.
- **D-013 — Rótulos**: Atualizar em tela de listas, bloqueio e Portal & licença; a tela Adicionar **mantém "Recarregar"** (contrato C1 da 070 o exige pelo nome do botão) — mudar o rótulo exige emenda aprovada (R-002).
- **D-014 — Logs e marcadores**: nenhum corpo de `POST /device/sources` em log, erro, analytics ou cache; testes com marcadores fictícios (T023).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | ID + chave da TV; nada de conta pessoal. |
| Segredos Fora dos Clientes e dos Logs | **VIOLA** (3 cláusulas) | Condicionado a 1.11.0 | (d) credenciais IPTV ao serviço, (e) chave no fragmento do QR, (f) chave também no bloqueio. Decisão explícita do usuário em 2026-10-14; Fase 1 bloqueante (D-001), Complexity Tracking e R-001. |
| Categorias da Fonte Preservadas | OK | OK | Não toca catálogo nem classificação. |
| IA/Classificação não inventam | OK | OK | — |
| Comandos Locais Independem de Rede | OK | **Melhora** | Teste e bloqueio passam a ser 100% locais; nenhuma consulta no caminho de abertura. |
| Trailers/Metadados | N/A | N/A | — |
| Caminho Completo por Controle Remoto | OK | OK | Atualizar/Voltar focáveis em toda tela; RETURN fecha camada antes de sair. |
| Lista ≠ Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos | Atenção | OK | Estados de falha/offline/pausa têm botão focável (D-003); bloqueio tem Atualizar e Voltar. |
| Voltar Restaura Foco | Atenção | OK | Atualizar volta à lista com foco por id (FR-006). |
| Identidade de Reprodução | N/A | N/A | — |
| Progresso/Capacidades Reais | OK | OK | Resultado do Atualizar é o real (sem novidades / pendente / offline); nada inventado. |
| Documentação Canônica | OK | OK | Emenda, ADR-016, notas 069/070, docs/portal e README no Polish. |
| Restrições: plataforma/hardware | Atenção | OK | QR local roda no Chromium 120; lib listada no `tizen_web_project.yaml`; TV física no quickstart. |
| Fluxo: E2E antes da TV, revisão de segredos | OK | OK | E2E no dev server e no pacote `file://` antes da TV; revisão de segredos em T023. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/071-consulta-sob-demanda-qr-fixo/
├── spec.md
├── plan.md                 # este arquivo
├── research.md             # biblioteca de QR, âncora do teste, lote de envio
├── data-model.md           # localTrial, sourceUploads, enroll
├── contracts/portal-api-071.md
├── logic/atualizar.md      # escopos, pausa, cadastro preguiçoso, fila, âncora
├── quickstart.md
├── contract-tests.lock
├── tasks.md
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/licensing/{localTrial.ts,licenseMonitor.ts,licenseRuntime.ts,localTrialRepository.ts}   # teste local + decisão
├── lib/portal/{portalAgent.ts,portalRuntime.ts,usePortalAgent.ts,portalSync.ts,portalConnection.ts,
│               fixedQr.ts,sourceUploadPlan.ts,sourceUploads.ts,portalTables.ts}                # agente sob demanda, envio, QR
├── features/portal/{PortalPairingPanel.tsx,LicenseGate.tsx,usePortalIntegration.tsx,RefreshButton.tsx,FixedQr.tsx}
├── features/profiles/ProfilesScreen.tsx                                                         # botão Atualizar da lista
├── features/settings/PortalLicensePanel.tsx                                                     # Atualizar (licença)
├── components/…                                                                                 # só se o ratchet pedir extração
└── lib/i18n/messages/{portal.ts,sources.ts}                                                     # pt/en/es
tv-web/e2e/{consulta-sob-demanda.mjs,entrada-listas-gerenciador.mjs,portal-dev-server.mjs,licenca-anual.mjs,legibilidade-tv.mjs}
tv-web/package.json · CCPlayTv/tizen_web_project.yaml                                            # lib de QR
portal-web/src/features/{api.ts,SessionPage.tsx} · portal-web/e2e/{gerenciador.spec.ts}
api/app/portal/{configurations.py,enrollment.py,models.py,routes/operations.py,routes/auth.py}
api/tests/portal/{test_device_sources.py,test_enrollment.py,test_pairing.py}
.planning/memory/constitution.md · sdd/adr/ADR-016-*.md · docs/portal/operacao.md · README.md
```

**Structure Decision**: monorepo real com TV (`tv-web/` → `CCPlayTv/`), portal web (`portal-web/`) e API do portal (`api/app/portal/`). A feature toca os três; o fallback `api/main.py` e o catálogo não mudam.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Credenciais IPTV enviadas ao serviço (Segredos, exceção ADR-008/010/013) | Decisão do usuário: o site passa a ser visão completa e editável das listas da TV; "esses dados não são segredos" | Enviar só nome/tipo/estado (como na 070) foi oferecido e recusado; mantém-se cifragem em repouso e log proibido (custo zero) |
| Chave dentro do QR fixo, no fragmento (Segredos, 070 FR-026) | Decisão do usuário: QR fixo que entra "sem nenhuma ação"; só ID abriria o painel a qualquer um | "QR só com ID e digitar a chave" foi oferecido e substituído após o aviso de enumeração do ID |
| Chave visível também na tela de bloqueio (Segredos, 070 I-5) | Compra no site exige a chave; remover o atrito de ir a outra tela | Botão "Ver ID e chave" foi oferecido e recusado |
| Teste local reiniciável por reinstalação antes do 1º contato (produto) | Decisão do usuário: sem chamada inicial | Início só no serviço (como hoje) foi oferecido e recusado; âncora no 1º contato reduz o efeito |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base:

```powershell
# TV
cd tv-web; npx tsc -b; npm run lint; npx vitest run <arquivos>; npm run test; npm run build; npm run build:tizen
node e2e/consulta-sob-demanda.mjs     # E2E novo (isolado, fora do SUITE até a T025)
npm run test:e2e                      # gate final, com `npm run dev` comum ativo
# API (emulador Firestore: JAVA_HOME do Android Studio, porta 8085)
cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider "--basetemp=$env:TEMP\pytest-071"; .venv\Scripts\ruff.exe check app/portal tests/portal
# Portal web
cd portal-web; npm run lint; npm run test; npm run build; npm run test:e2e
# Travas (obrigatório em todo gate)
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 071-consulta-sob-demanda-qr-fixo
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 070-entrada-listas-gerenciador
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 069-portal-tv-licenca-anual
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5 testes):

- `tv-web/src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts` (1)
- `tv-web/src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts` (1)
- `tv-web/src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts` (1)
- `tv-web/src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts` (2)

Comando (em `tv-web/`): `npx vitest run src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `teste local de 7 dias: vale até o último instante, não ganha tempo com relógio atrasado e a âncora só encurta` | US3/AC1-AC4, FR-020/021/022, SC-006 | Fase 2 | `Error: not implemented` (`evaluateLocalTrial`) |
| C2 `sem ação da pessoa o agente não faz nenhuma requisição, mesmo com a TV parada por dias…` | FR-001/002, SC-001 | Fase 2 | `expect(port).not.toHaveBeenCalled()` falha: o ciclo diário chama as portas |
| C3 `Atualizar de listas envia exclusões, envios e busca nessa ordem; de licença só renova…` | FR-004/005, SC-003 | Fase 2 | `Error: not implemented` (`PortalAgent.refresh`) |
| C4 `QR fixo: endereço + ID + chave só no fragmento, estável, muda só com a chave…` | US5/AC1-AC3, FR-013/014/016, Constitution: Segredos | Fase 4 | `Error: not implemented` (`buildFixedQrUrl`) |
| C5 `envio TV → site: a 1ª vez sobe todas as listas completas; depois só as com revisão nova…` | US4/AC1-AC3, FR-008/009/010 | Fase 5 | `Error: not implemented` (`planSourceUploads`) |

Stubs criados pelo plan (ponto de partida do execute, **não** travados): `tv-web/src/lib/licensing/localTrial.ts`, `tv-web/src/lib/portal/fixedQr.ts`, `tv-web/src/lib/portal/sourceUploadPlan.ts`, e em `tv-web/src/lib/portal/portalAgent.ts` a porta opcional `flushUploads` e o método `refresh(scope)` (lança `not implemented`).

Travas de outras features afetadas: **070 C1** (`PortalPairingPanel.entrada-listas-gerenciador.contract.test.tsx`) usa o rótulo "Recarregar" e a rota de convite mockada — continua verde com D-013 e QR local; **069** C1–C5 e **070** C2–C5 não dependem do ciclo; **037/045/023/024/026** de telas devem permanecer verdes sem edição. Testes **não** travados que assumem o ciclo diário e precisam ser reescritos: `portalAgent.test.ts`, `usePortalAgent*.test.tsx`, `licenseMonitor*.test.ts`, testes do painel de licença/adicionar.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Planejamento | Spec, plan, tasks, research, data-model, contracts, logic, quickstart e 5 contratos travados (vermelhos). Nada implementado. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Três cláusulas de Segredos violadas por decisão do usuário (2026-10-14) | Crítico (normativo) | Fase 1 bloqueante: constitution 1.11.0 + ADR-016 com riscos aceitos e mitigações (D-001). |
| R-002 | Contrato 070 C1 nomeia o botão "Recarregar" e a 069 C-tests assumem protocolo atual | Médio | D-013 mantém o rótulo; qualquer emenda de trava exige aprovação explícita do usuário e regravação só do arquivo afetado (passo 5b do execute). |
| R-003 | Teste local reiniciável por reinstalação antes do 1º contato manual | Alto (receita) | Âncora no 1º contato (D-006), marca d'água do relógio (D-005); risco aceito pelo usuário. |
| R-004 | Foto/captura do QR fixo dá acesso ao painel e às credenciais das listas (agora no serviço) | Alto | Fragmento fora do servidor/logs; "Gerar nova chave" invalida QR e sessões; limites de tentativa e recusa uniforme (070 D-005); risco aceito pelo usuário. |
| R-005 | Estorno/chargeback só visto no Atualizar; nenhuma verificação ao abrir | Médio | Licença assinada vigente vale offline até vencer; botão de licença sob demanda; risco aceito. |
| R-006 | 1ª atualização sobe muitas listas (credenciais em lote) | Médio | Lotes de 10, progresso visível, retomada por `uploadedRevision`; 429/limites tratados como "tente de novo". |
| R-007 | Edição concorrente TV × portal | Médio | CAS por revisão da 069 (`expected_revision` x snapshot); conflito exibido, nunca sobrescreve em silêncio. |
| R-008 | Biblioteca de QR no Chromium 120/`chrome108` e na lista do pacote | Médio | Escolha em `research.md` §1; arquivo emitido entra no `tizen_web_project.yaml` (guarda do `sync-tizen`). |
| R-009 | Schema Dexie "livre" (versões tardias) | Médio | Reler `dbSchema`/`registerLateCatalogSchemas` antes de migrar (T004/T021). |
| R-010 | Cadastro preguiçoso: sem internet na 1ª vez, a tela não tem ID/chave/QR | Médio | Estado focável explícito + Atualizar; TV física no quickstart. |
| R-011 | Muitos testes não travados assumem timers/`quick` | Baixo | Reescrever junto das tasks; contratos C2/C3 definem o novo comportamento. |
| R-012 | Venda desligada e riscos da 069 (R-022..R-026) continuam abertos | Alto | Esta feature **não** reabre a venda; registrar na 069 notas de atualização. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-14 | Planejamento | Spec, plan, tasks, contratos C1–C5 vermelhos e travados. | Fase 1 (gate normativo) antes de qualquer código. |

**PRÓXIMO**: executar a Fase 1 (constitution 1.11.0 + ADR-016 + notas 069/070) e só então a Fase 2 (agente sob demanda e teste local).

## Arquivos Principais

- sdd/specs/071-consulta-sob-demanda-qr-fixo/{spec,plan,tasks,handoff}.md · logic/atualizar.md · contracts/portal-api-071.md
- tv-web/src/lib/portal/{portalAgent,portalRuntime,portalConnection,portalSync}.ts · tv-web/src/lib/licensing/{licenseMonitor,licenseRuntime}.ts
- tv-web/src/features/portal/{PortalPairingPanel,LicenseGate,usePortalIntegration}.tsx

## Cuidados para Retomada

- **Não editar** os 4 arquivos de contrato travados nem os da 069/070/026/037/045: emenda só com aprovação explícita do usuário e regravação só do arquivo afetado.
- `PortalAgent.attach(quick)` mantém a assinatura (aceita e ignora o argumento) — contratos e testes antigos ainda a chamam com `true`/`false`.
- A tela Adicionar **mantém o rótulo "Recarregar"** (contrato 070 C1).
- A chave aparece **só** em Adicionar lista e na tela de bloqueio; nunca em Portal & licença, cards, perfis, avisos ou diagnóstico (a constitution 1.11.0 delimita).
- O QR **nunca** carrega a chave em path/query; só em fragmento (`#id=&key=`).
- A emulação do relógio nos testes usa `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','Date'] })` + `setImmediate` real para o IndexedDB (ver `portalAgent.test.ts`).
- Arquivos da TV misturam LF e CRLF: prefira o Edit a substituições com `\n` no PowerShell.
- Emulador Firestore: `JAVA_HOME` do Android Studio, `gcloud ... cloud_firestore_emulator.cmd start --host=127.0.0.1 --port=8085`; matar os processos ao final.
- **Antes de instalar na TV**: publicar API (rota nova + âncora) no staging, senão a TV nova chama uma rota inexistente.
