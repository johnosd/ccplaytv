# Handoff — 072 Desvincular a TV do portal e backup dos dados de uso

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`, Windows/PowerShell. Stack: TV React 19 + TS + Vite + Dexie
  (`tv-web`), serviço FastAPI + Firestore (`api/app/portal`), painel React (`portal-web`).
- Próximo comando: `/sdd-execute sdd/specs/072-desvincular-backup`. Backlog: **Planejada** (0/46).
- Portal em produção de staging: `https://portal.ccplaytv.com` (Cloud Run `ccplaytv-portal`/`-jobs`, us-central1).
- Nada da 072 foi commitado; a árvore também tem a 071 e o domínio sem commit.

## O que a feature entrega

- **US1 (P1)** Desvincular em Portal & licença: apaga só o pareamento; a TV volta ao **mesmo** registro sozinha usando
  o código de recuperação que ela já tinha (rota nova `POST /devices/recovery/self`). Não é a recuperação pelo site.
- **US2 (P1)** Backup de uso no Atualizar de listas e em "Fazer backup agora". **Nunca** sobrescreve um backup que a
  pessoa ainda não decidiu restaurar.
- **US3 (P1)** Restaurar com confirmação (foco inicial em "Agora não"); mescla por lista; lista ausente fica pendente
  por **5 dias**.
- **US4 (P2)** Apagar backup na TV e no site; o site só vê data e contagens.
- Decisões do usuário: backup inclui **chave TMDB e PIN** (com emenda); só a última versão; desvincular offline é
  permitido (avisa que o backup não foi feito).

## Leitura obrigatória, em ordem

1. `spec.md` — stories, FR-001..FR-017, SC-001..SC-007, Clarifications.
2. `plan.md` — Decisões Invariantes D-001..D-011, Constitution Check, riscos R-001..R-008.
3. `tasks.md` — fases 1–7 (Fase 1 é bloqueante).
4. `logic/desvincular.md` — o que apagar/preservar e a reassociação dentro de `PortalConnection.prepare()`.
5. `logic/backup.md` — máquina de estados `unknown/offered/settled`, passo de backup, restauração e pendências.
6. `data-model.md` — ids `relink`/`backup` em `portalDevice`, tabela `pendingRestore` (v25), documento do serviço.
7. `contracts/portal-api-072.md` — rotas, limites, formatos.
8. `research.md` — por que a reassociação é pela TV, Firestore e o teto de 512 KB.
9. `quickstart.md` — cenário ponta a ponta.
10. `.planning/memory/constitution.md` (1.11.0 hoje; 1.12.0 na T001).

## Testes de contrato (travados — nunca editar)

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/portal/unlink.desvincular-backup.contract.test.ts` | 1 | 3 |
| `tv-web/src/lib/portal/relink.desvincular-backup.contract.test.ts` | 1 | 3 |
| `tv-web/src/lib/backup/backupDecision.desvincular-backup.contract.test.ts` | 1 | 4 |
| `tv-web/src/lib/backup/usageBackup.desvincular-backup.contract.test.ts` | 1 | 4 |
| `tv-web/src/lib/backup/usageMerge.desvincular-backup.contract.test.ts` | 1 | 5 |

- Rodar: `cd tv-web; npx vitest run src/lib/backup src/lib/portal/unlink.desvincular-backup.contract.test.ts src/lib/portal/relink.desvincular-backup.contract.test.ts` (hoje 5/5 vermelhos por `not implemented`).
- Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 072-desvincular-backup`.
- Travas vizinhas que podem quebrar: 069 (`lib/portal/portal-tv-licenca-anual.contract.test.ts`), 070
  (`PortalPairingPanel`, `pairingIdentity`), 071 (`portalAgent`, `localTrial`, `sourceUploadPlan`, `fixedQr`),
  067 (`listPin`, `SettingsScreen`), 026/041/054 (`SettingsScreen`), 019 (`userStateRepository`).

## Stubs criados

- `tv-web/src/lib/backup/usageBackupTypes.ts` — tipos prontos (payload, pendente, estados, ações). Não são provisórios.
- `tv-web/src/lib/backup/backupDecision.ts` — `nextBackupAction` lança `not implemented`.
- `tv-web/src/lib/backup/usageMerge.ts` — `planRestore` e `PENDING_RESTORE_TTL_MS` (5 dias, constante definitiva).
- `tv-web/src/lib/backup/usageBackup.ts` — `buildUsageBackup(db, { now, settings })`.
- `tv-web/src/lib/portal/unlink.ts` — `RelinkHintRecord`, `unlinkPortal`, `readRelinkHint`.

## Armadilhas já mapeadas

- **Perda de dados no 1º Atualizar após reinstalar**: subir o backup "vazio" apagaria o antigo. O estado `unknown`
  sempre pergunta o resumo antes (D-005, contrato `backupDecision`).
- **`localTrial` NÃO pode ser apagado** no Desvincular: o teste de 7 dias reiniciaria (071 D-005/R-003).
- **`pendingPortalDeletes` é preservado** (D-003): FR-002 fala em "filas", mas apagar ressuscita lista excluída no site.
- **Dica de PIN da 067**: `localStorage['ccplay.parental.pinSources']` precisa voltar junto dos PINs, senão o controle
  parental aparece desligado (R-008, `lib/parental/listPin.ts`).
- **Chave TMDB restaurada**: gravar direto em `integrations/tmdb` sem testar na TMDB (nada de consulta externa sem ação).
- **Código de recuperação**: só no corpo HTTPS; nunca em `PortalRequestError`, URL ou log; lembrete apagado ao concluir.
- **`enroll` já responde 409 `recovery_required`** quando a identidade existe (`api/app/portal/enrollment.py`); o código
  `recovery_required` já está na lista de `portalClient.ts`.
- **Firestore ≤ 1 MiB**: payload ≤ 512 KB; cortar histórico antigo sem favorito/progresso (research §3).
- **Ratchet de linhas**: `PortalLicensePanel.tsx` tem 146 linhas; colocar as ações novas em `PortalBackupActions.tsx`.
  `PORTAL_ACTION_COUNT` é usado por `PortalLicensePanel.test.tsx` e `PortalLicenseTab.tsx` (foco por índice).
- **Esquema**: v25 com `pendingRestore`; `pinMigration.upgrade.test.ts` lista tabelas esperadas.
- **E2E opt-in**: use `tv-web/e2e/lib/portalStack.mjs` (como `consulta-sob-demanda.mjs`); `npm run dev:portal` sobe tudo.
- **Benchmark instável**: `scripts/bench/importBench.test.mjs` estoura o hook sob carga e passa isolado (não é da 072).
- **Staging**: a origem pública é `https://portal.ccplaytv.com`; publicar a API antes de instalar o pacote na TV.

## Pendências do Analyze

| ID | Severidade | Resumo | Recomendação |
| --- | --- | --- | --- |
| A001 | MEDIUM | FR-002 manda apagar "filas"; D-003 preserva a fila de exclusões | Emendar o texto da FR-002 na T001 (ou aceitar R-005) |
| A002 | MEDIUM | Spec (edge case) diz que a chave TMDB "vale a mais recente"; D-009 só restaura se a TV não tiver chave | Confirmar com o usuário; recomendação: manter a local (ela foi digitada nesta TV) e corrigir a spec |
| A003 | LOW | Configurações do app restauram "sempre o do backup", sem timestamp, enquanto FR-010 fala em "mais recente" | Registrar como exceção na T001/logic (configurações não têm data) |
| A004 | LOW | FR-009 diz "na primeira ação que fala com o serviço"; o plano oferece no passo de backup do Atualizar | Aceitar: abrir Adicionar lista não oferece; o Atualizar sim |
| A005 | LOW | US4 sem teste de contrato | Aceito (P2, sem risco alto); coberto por pytest e portal-web |

## Gate de pronto

- 5/5 contratos verdes na suíte completa + `check-contract-tests.ps1` íntegro (072 e vizinhas).
- `cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build; npm run build:tizen`.
- `cd api; pytest tests/portal` (emulador) + `ruff check .`; `cd portal-web; npm run lint; npm run test; npm run build; npm run test:e2e`.
- `node e2e/desvincular-backup.mjs` (opt-in) e `npm run test:e2e` completo com `npm run dev`.
- Docs no Polish: `docs/portal/operacao.md`, `README.md`, `CLAUDE.md` (ADR-017).
- TV física: recomendação, não gate.
