# Handoff — 071 (execução em outra sessão)

## Contexto

Repositório `ccplayTv`, branch `feature/designWave2`. Stack: TS/React 19 (TV `tv-web/`, portal `portal-web/`) + Python/FastAPI (`api/app/portal/`) no Cloud Run/Firestore. Próximo comando: `/sdd-execute 071-consulta-sob-demanda-qr-fixo` (modo pausado por padrão). Status no backlog: **Planejada**. A 069 está **Encerrada com riscos aceitos** (venda desligada) e a 070 **Convergida**: esta feature emenda ambas; leia as notas `Atualização (070)` já anexadas na 069.

## O que a feature entrega

- **P1 / US1** — Adicionar lista pelo site e **Atualizar** na TV (botão, volta à lista com foco na nova); nenhuma consulta automática.
- **P1 / US2** — Tela de bloqueio com QR, endereço, ID e **chave visível**; **Atualizar** consulta só a licença, libera e retoma a entrada negada.
- **P1 / US3** — Teste de 7 dias **contado no app**, sem rede; marca d'água do relógio; âncora no 1º contato manual (enroll aceita `trialStartedAt`).
- **P2 / US4** — A TV envia **nome, tipo, host, usuário, senha** ao site (cifrado no serviço, nunca em log); fila durável; 1ª atualização sobe todas as listas.
- **P2 / US5** — **QR fixo** gerado na TV (`/#id=…&key=…`); abre o painel autenticado.
- Decisões do usuário que contrariam a expectativa óbvia: **nada automático, nem ao abrir o app e nem ao negar entrada**; a tela **Adicionar mantém o rótulo "Recarregar"** (contrato 070 C1); a chave também aparece no bloqueio.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..FR-026, SC-001..SC-009, clarificações.
2. `plan.md` — D-001..D-014 (invariantes), Constitution Check, riscos R-001..R-012, estratégia de testes.
3. `tasks.md` — T001..T034 por fase; Registro da Fase vazio.
4. `logic/atualizar.md` — escopos, pausa de 10 s, cadastro preguiçoso, teste local, fila, bloqueio.
5. `data-model.md` e `contracts/portal-api-071.md` — tabelas Dexie novas e a rota `POST /device/sources` + âncora no enroll.
6. `research.md` — biblioteca de QR, âncora, lote de envio.
7. `quickstart.md` — cenário ponta a ponta e gate de TV física.
8. `.planning/memory/constitution.md` (1.10.0 hoje; 1.11.0 na T001) e ADR-013/014/015.

## Testes de contrato (5, travados)

Arquivos (em `tv-web/`):
- `src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts` (1) — Fase 2
- `src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts` (2) — Fase 2
- `src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts` (1) — Fase 4
- `src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts` (1) — Fase 5

Comando: `npx vitest run src/lib/licensing/localTrial.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/portalAgent.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/fixedQr.consulta-sob-demanda-qr-fixo.contract.test.ts src/lib/portal/sourceUploadPlan.consulta-sob-demanda-qr-fixo.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 071-consulta-sob-demanda-qr-fixo`. Hoje os 5 estão **vermelhos** (4 por `not implemented`, 1 por asserção do ciclo diário).

Travas de outras features que esta pode quebrar: **070** (C1 usa o botão "Recarregar" e a rota de convite mockada), **069** (C1–C5), **026/037/045/023/024**. Rodar `check-contract-tests.ps1` para 071, 070, 069 e 026 em todo gate (a 026 já foi emendada na 069).

## Stubs criados

- `tv-web/src/lib/licensing/localTrial.ts` — constantes e assinaturas; corpo `throw` (T004).
- `tv-web/src/lib/portal/fixedQr.ts` — `buildFixedQrUrl` com `throw` (T018).
- `tv-web/src/lib/portal/sourceUploadPlan.ts` — tipos prontos, `planSourceUploads` com `throw` (T024).
- `tv-web/src/lib/portal/portalAgent.ts` — porta opcional `flushUploads` e método `refresh(scope)` com `throw` (T006). **Provisório**: `attach(quick)` deve manter a assinatura.

## Armadilhas já mapeadas

- **Agente**: `portalAgent.test.ts` e `usePortalAgent*.test.tsx` (não travados) assumem ciclo diário/quick — **remover** os casos obsoletos (os contratos C2/C3 cobrem o novo), manter só lifecycle/overlap/exclusão no ato.
- **Orçamento de testes**: ver `plan.md` → "Orçamento de testes": 1 teste por unidade alterada, 1 E2E novo, suíte completa só no Polish; não crie teste de componente onde o E2E já passa.
- **Fake timers do contrato**: usam `toFake: ['setTimeout','clearTimeout','Date']`; `refresh` não pode depender de `setInterval`/`performance.now`/sleep real.
- **Teste local e migração**: instalação em uso com `licenseCache` herda `startedAt` do JWS (T004); nunca `now`, senão estende o teste de quem já está no meio.
- **Revogação**: JWS `revoked` vence o teste local (D-005).
- **Cadastro preguiçoso**: hoje `usePortalIntegration` chama `connection.ready()` no mount; remover, senão SC-001 falha. Telas que mostram ID/chave precisam chamar `ensurePairing()`.
- **Exclusão no ato**: o `liveQuery` da outbox dispara envio na abertura com pendência herdada — desligar a parte de abertura (D-011) mantendo o envio no ato.
- **Chave**: só em Adicionar lista e no bloqueio; Portal & licença mantém a exibição por ação explícita (070 I-5, constitution 1.11.0).
- **QR**: nunca chave em path/query; só fragmento; `portal-web` limpa com `replaceState` antes de renderizar.
- **Pacote**: arquivo novo da lib de QR entra em `CCPlayTv/tizen_web_project.yaml`, senão o `sync-tizen` para.
- **API**: `ConfigurationService.submit` cria operação de 7 dias e conta 5 pendentes — o envio da TV usa caminho novo `submit_from_device` (sem operação, `applied_revision` direto); tombstone → `gone`.
- **Publicação**: API no staging **antes** do pacote na TV (R-010).
- **Emulador**: `JAVA_HOME` do Android Studio; matar os processos no fim; `--basetemp` com `"--basetemp=$tmp"` entre aspas.
- **Dexie**: schema com versões tardias — reler antes de migrar (R-009).

## Pendências do Analyze

| ID | Sev. | Resumo | Recomendação |
| --- | --- | --- | --- |
| A001 | HIGH | FR-003 da spec cita o rótulo "Atualizar" em Adicionar lista, mas D-013 mantém "Recarregar" por causa do contrato 070 C1. | Ajustar o texto de FR-003 na T003 (ou pedir ao usuário a emenda do 070 C1); não renomear sem aprovação. |
| A002 | MEDIUM | SC-007 (≤ 10 requisições/mês) não é verificável por unitário. | Medir no E2E (T030) com contagem de requisições em 30 dias simulados. |
| A003 | MEDIUM | Constitution Check depende da emenda 1.11.0; enquanto não aprovada, T001 bloqueia US1–US5. | Não iniciar a Fase 3 sem T001/T002 aprovadas. |
| A004 | LOW | Rótulos i18n novos (Atualizar, estados, bloqueio) sem catálogo definido. | Definir chaves em `messages/portal.ts` na T011 com os três idiomas. |

## Gate de pronto

Contratos 5/5 verdes e travas íntegras (071/070/069/026); TV `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`; `node e2e/consulta-sob-demanda.mjs` e `npm run test:e2e` com `npm run dev`; API `pytest tests/portal` com emulador + Ruff; portal lint/test/build/E2E; quickstart §3; revisão de segredos (T028); docs no Polish (T029). **Staging e TV física exigem confirmação do usuário**; a passada na TV física é gate antes de cobrar, e a venda continua desligada.