# Implementation Plan: Desvincular a TV do portal e backup dos dados de uso

**Slug**: `072-desvincular-backup` | **Spec**: `spec.md` | **Data**: 2026-10-14

## Summary

Duas capacidades sobre a infraestrutura do portal (069/070/071), sem tela nova de cadastro:

1. **Desvincular** (US1): ação em Portal & licença que apaga só o pareamento local e guarda o **código de recuperação**
   que já estava na TV. No próximo contato, o cadastro recusado (`recovery_required`) é resolvido pela própria TV numa
   rota nova, `POST /devices/recovery/self`, que prova a posse com esse código e devolve credenciais novas do **mesmo**
   registro (mesmo ID, listas, licença e backup; chave nova).
2. **Backup dos dados de uso** (US2–US4): um documento por TV no Firestore, cifrado no serviço, com favoritos,
   histórico, progresso, preferências de categoria, PIN em hash, configurações do app e chave TMDB. Sobe junto do
   Atualizar e por botão; é oferecido para restauração depois de re-parear; restauração mescla por lista e guarda
   pendências de listas ausentes por 5 dias; apagável na TV e no site.

**Fase 1 é bloqueante**: emenda da constitution 1.12.0 (item (g): dados de uso + chave TMDB + PIN em hash cifrados no
serviço, só para a mesma TV) e ADR-017 (reassociação pela própria TV com o código de recuperação + backup de uso).
Nenhum código de comportamento antes da aprovação do usuário.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (TV, Vite 8, alvo `chrome108`); Python 3.13 + FastAPI (API do portal,
`api/app/portal`); TypeScript + React (`portal-web`).
**Primary Dependencies**: Dexie (IndexedDB na TV), `google-cloud-firestore` (serviço), `cryptography` AES-GCM
(`PortalCrypto`, já usado nas configurações), TanStack Query (TV).
**Storage**: TV — Dexie (`portalDevice` ganha os ids `relink` e `backup`; tabela nova `pendingRestore` na **v25**);
serviço — Firestore `devices/{deviceId}/backups/current` (um documento, envelope cifrado).
**Testing**: Vitest (projetos `dom`/`node`), Playwright E2E (`tv-web/e2e`, `portal-web/e2e`), pytest com emulador
Firestore (`PORTAL_TEST_FIRESTORE=1`).
**Target Platform**: Samsung Tizen 9 (QN50Q60DAGXZD, `file://`), Cloud Run `us-central1` (`portal.ccplaytv.com`).
**Performance Goals**: o passo de backup não atrasa o Atualizar perceptivelmente; restauração local < 2 s para
~5 mil registros de uso.
**Constraints**: nada automático (ADR-016); ID imutável (ADR-015); segredos nunca em log/URL/erro/cache; Firestore
≤ 1 MiB por documento → **payload ≤ 512 KB** (corte do histórico mais antigo primeiro, favoritos e progresso nunca
cortados); arquivos de produção da TV ≤ 300 linhas (ratchet).
**Scale/Scope**: 1 backup por TV; dezenas de listas; milhares de itens de uso.

## Decisões Invariantes

- **D-001 — Gate normativo**: constitution 1.12.0 + ADR-017 aprovadas antes de qualquer task de US1–US4.
- **D-002 — Reassociação pela própria TV**: o Desvincular guarda em `portalDevice` (id `relink`) só `deviceId`,
  `displayId`, `recoveryCode` e `recoveryCodeVersion`. `PortalConnection.prepare()` trata `recovery_required` do
  `enroll`: com lembrete → `POST /devices/recovery/self` (corpo: `platformIdentity`, `nonce`, `recoveryCode`, `mac?`);
  sem lembrete → erro de hoje (a pessoa usa a recuperação pelo site da 069). O código vai **só no corpo HTTPS**, nunca
  em URL/log/erro; o lembrete é apagado ao concluir (consumido) e o serviço emite **código novo**.
- **D-003 — O que o Desvincular apaga**: `device`, `bootstrap`, `licenseCache`, `sourceUploads` (re-subida idempotente
  por digest) e o estado do backup volta a `unknown`. **Preserva** `localTrial` (senão o teste de 7 dias reiniciaria),
  `pendingPortalDeletes` (intenção da pessoa; perder faria a lista excluída reaparecer no site), `sourceRevisions`,
  `portalOperations`, `pendingImportOutbox`, catálogo e todos os dados de uso. Desvia da letra da FR-002 ("filas"),
  ver R-005.
- **D-004 — Nada automático**: backup só no Atualizar da tela de listas (passo novo **depois** do snapshot) e no botão
  Fazer backup agora; a checagem de "existe backup?" acontece nesse mesmo passo. Nenhum timer, nenhuma consulta na
  abertura, nenhum retry.
- **D-005 — Nunca sobrescrever backup não decidido** (`logic/backup.md` §2): estado `unknown` → pergunta o resumo;
  existe → `offered` e **não sobe**; `offered` bloqueia o Atualizar até Restaurar ou "Substituir pelo desta TV"
  (confirmação). Contrato `backupDecision`.
- **D-006 — Mescla** (`logic/backup.md` §3): chave = `sourceId` + `stableId` (userStates), `sourceId+kind+matchKey`
  (categorias), `sourceId` (PIN); vence o maior `updatedAt` (`createdAt` no PIN). Lista ausente → `pendingRestore` com
  `expiresAt = now + 5 dias`; aplicada quando a lista existir; expirada é descartada.
- **D-007 — Conteúdo**: `usage` (userStates, categoryPreferences, parentalPins por lista, configurações do app por
  allowlist de chaves) e `secrets.tmdb`; **nunca** fontes, URLs, credenciais, catálogo, EPG, metadados TMDB. O serviço
  cifra o payload inteiro (`CipherContext(deviceId, "usage-backup", "v1")`) e só devolve à mesma TV (bearer).
- **D-008 — Configurações por allowlist**: `ccplaytv:app-language`, `ccplaytv:player-preferences`,
  `ccplaytv:reduce-motion`, `ccplay.parental.pinSources` (dica de PIN da 067, precisa voltar junto com os PINs).
  Nenhuma outra chave de `localStorage` sai do aparelho.
- **D-009 — Chave TMDB restaurada sem rede**: grava o registro `integrations/tmdb` direto (chave + formato), sem testar
  na TMDB na hora (a 1ª consulta real valida); nunca exibida.
- **D-010 — Site só vê resumo**: `GET /backup` devolve `{exists, createdAt, counts}`; `DELETE /backup` com sessão +
  CSRF. Nenhum título, canal, PIN ou chave.
- **D-011 — Uma versão**: `PUT` substitui o documento; `DELETE` remove; retenção apaga junto do aparelho.

## Constitution Check

| Princípio | Pré-Design | Pós-Design | Observação |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Sem login; backup preso à identidade da TV. |
| Segredos Fora dos Clientes e dos Logs | **Violação justificada** | OK após emenda | BYOK e PIN em hash saem da TV (proibido hoje: "BYOK … continuam proibidos"). Emenda 1.12.0 (g) + ADR-017 na Fase 1; cifrado em repouso, sem log/cache, só a mesma TV. |
| Categorias da Fonte São Preservadas | OK | OK | Só preferências da pessoa; nada de taxonomia. |
| IA e Classificação Nunca Inventam Dados | OK | OK | — |
| Comandos Locais Independem de Rede | OK | OK | Desvincular funciona offline (FR-003); restauração local. |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | Metadados TMDB não entram no backup. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Ações em Portal & licença e diálogos com foco. |
| Lista de Catálogo Nunca É Manifesto | OK | OK | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Diálogos com Cancelar inicial; estados com focável (FR-017). |
| Voltar Restaura Foco e Posição | OK | OK | RETURN fecha diálogo e volta à ação. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Mescla por `stableId` (D-006); contrato `usageMerge`. |
| Progresso e Capacidades São Reais | OK | OK | Contagens reais; sem percentuais inventados. |
| Documentação do Repositório É Canônica | OK | OK | Emenda, ADR-017, `docs/portal/operacao.md`, README. |
| Fluxo: E2E antes da TV, revisão de segredos | OK | OK | Polish com E2E e marcadores fictícios. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/072-desvincular-backup/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/portal-api-072.md
├── logic/desvincular.md
├── logic/backup.md
├── quickstart.md
├── tasks.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
api/app/portal/
├── backup.py                    # NOVO: UsageBackupService (put/get/summary/delete, cifra)
├── self_relink.py               # NOVO: reassociação pela própria TV (prova = código de recuperação)
├── routes/backup.py             # NOVO: /device/backup*, /backup (site), /devices/recovery/self
├── models.py                    # + UsageBackupDocument
├── retention.py                 # + backups no apagamento do aparelho
└── application.py               # + include_router(backup)
api/tests/portal/test_backup.py, test_self_relink.py   # NOVOS

tv-web/src/lib/portal/
├── unlink.ts                    # stub → unlinkPortal/readRelinkHint
├── portalConnection.ts          # + recovery_required → /devices/recovery/self
├── portalAgent.ts / portalSync.ts / usePortalAgent.ts  # + passo 'backup' no Atualizar de listas
tv-web/src/lib/backup/           # NOVO
├── usageBackupTypes.ts          # tipos (pronto)
├── backupDecision.ts            # stub → nextBackupAction
├── usageMerge.ts                # stub → planRestore
├── usageBackup.ts               # stub → buildUsageBackup
├── usageRestore.ts              # aplica plano + pendências (novo)
├── backupState.ts               # registro `portalDevice/backup` (novo)
└── backupClient.ts              # chamadas /device/backup* (novo)
tv-web/src/lib/catalog/dbSchema.ts   # v25: pendingRestore
tv-web/src/features/settings/PortalLicensePanel.tsx (+ PortalBackupActions.tsx novo), PortalPrivateDialog.tsx
tv-web/src/features/portal/RestoreOffer.tsx (novo, montado em usePortalIntegration)
tv-web/src/lib/i18n/messages/portal.ts
portal-web/src/features/ (BackupCard.tsx novo; api.ts) 
```

**Structure Decision**: frontend TV (`tv-web`) + serviço (`api/app/portal`) + painel (`portal-web`), como nas 069–071.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| BYOK (TMDB) e PIN em hash saindo da TV | Pedido explícito do usuário (spec, Clarifications); sem isso a reinstalação ainda perde a chave e os PINs | Deixar fora: a dor original (perder tudo) continua parcialmente; o usuário escolheu a emenda |
| Rota nova de reassociação | "Mesma TV em até 3 ações" (SC-002) sem a pessoa digitar código no celular | Recuperação pelo site (069): exige QR + celular + digitar o código; não cumpre SC-002 |

## Estratégia de Testes

Prioridade: unitário/contrato (lógica pura e Dexie em `node`) → pytest com emulador (API) → E2E opt-in com
`lib/portalStack.mjs` → TV física (recomendação, não gate).

Comandos-base (copy-paste):

```powershell
cd tv-web; npx tsc -b; npm run lint; npm run test; npm run build
cd tv-web; npx vitest run src/lib/backup src/lib/portal/unlink.desvincular-backup.contract.test.ts src/lib/portal/relink.desvincular-backup.contract.test.ts
cd api; $env:PORTAL_TEST_FIRESTORE='1'; .venv\Scripts\python.exe -m pytest tests/portal -q -p no:cacheprovider; .venv\Scripts\python.exe -m ruff check .
cd portal-web; npm run lint; npm run test; npm run build
cd tv-web; node e2e/desvincular-backup.mjs   # novo, opt-in (pilha local)
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 072-desvincular-backup
```

Emulador: `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'` (ou `npm run dev:portal`, que já sobe tudo).

### Testes de Contrato

| Arquivo | Teste | Origem | Saída vermelha registrada |
| --- | --- | --- | --- |
| `tv-web/src/lib/portal/unlink.desvincular-backup.contract.test.ts` | desvincular solta identidade… guarda o código | US1/AC1, FR-002, D-003 | `Error: not implemented` (`unlinkPortal`) |
| `tv-web/src/lib/portal/relink.desvincular-backup.contract.test.ts` | cadastro recusado resolvido com o código guardado | US1/AC2, FR-004, Segredos | `Error: not implemented` (`unlinkPortal`) |
| `tv-web/src/lib/backup/backupDecision.desvincular-backup.contract.test.ts` | só sobe sem backup pendente de decisão | US2/AC1, US3/AC1/AC5, FR-006/009, D-005 | `Error: not implemented` (`nextBackupAction`) |
| `tv-web/src/lib/backup/usageMerge.desvincular-backup.contract.test.ts` | mescla por lista; pendente 5 dias | US3/AC2–AC4, FR-008/010/011, Identidade | `Error: not implemented` (`planRestore`) |
| `tv-web/src/lib/backup/usageBackup.desvincular-backup.contract.test.ts` | só dados de uso, sem URL/credencial | FR-005, SC-005, Segredos | `Error: not implemented` (`buildUsageBackup`) |

Comando: `cd tv-web; npx vitest run src/lib/backup src/lib/portal/unlink.desvincular-backup.contract.test.ts src/lib/portal/relink.desvincular-backup.contract.test.ts`
→ hoje 5/5 vermelhos por `not implemented` (confirmado em 2026-10-14; `tsc -b` limpo; demais testes de `src/lib/portal` verdes).

A API não tem contrato travado (orçamento de 5 usado na TV); a rota `/devices/recovery/self` e o backup têm pytest
obrigatórios nas tasks (sigilo, mesma TV, limites).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (gate normativo) | Concluída e aprovada: constitution 1.12.0, ADR-017, notas ADR-013/015/CLAUDE.md; A001/A002 resolvidos na spec. |
| Fase 2 (fundação) | Concluída: Dexie v25 `pendingRestore`, `backupState.ts`, `UsageBackupService` + rotas `/device/backup*` e `/backup`; pytest 148. |
| Fase 3 (US1) | Concluída: `unlinkPortal`, `/devices/recovery/self` (rotação `revoke` com prova de código), reassociação no `PortalConnection`, cliente HTTP lê `recovery_required`/`invalid_credentials`, ação Desvincular. |
| Fase 4 (US2) | Concluída: backup no Atualizar de listas e no botão; `expectExisting` + estado `disabled` (R-009). |
| Fase 5 (US3) | Concluída: `planRestore`, `usageRestore`, `RestoreOffer`, pendências de 5 dias. |
| Fase 6 (US4) | Concluída: apagar na TV e no site (`BackupCard`). |
| Fase 7 (Polish) | T030–T034 concluídas: segredos, E2E opt-in + legibilidade, docs, gates (3359 unit, E2E 49/49, pytest 152), staging `portal-00019-kqv`/`jobs-00018-t7g`; pacote na TV. T035 aguarda o usuário. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | BYOK e PIN em hash saem da TV (constitution proíbe hoje) | Crítico (normativo) | Fase 1: emenda 1.12.0 (g) + ADR-017, aprovação do usuário antes de qualquer código. |
| R-002 | PIN de 4–6 dígitos em sha256 com sal é reversível por força bruta se o backup vazar | Alto | Payload inteiro cifrado (AES-GCM, chave do serviço); só a mesma TV lê; apagável; documentado na emenda como risco aceito. |
| R-003 | Código de recuperação guardado após desvincular | Médio | É o mesmo segredo que já estava na TV; uso único (o serviço emite código novo); limites por ID/IP; nunca em URL/log. |
| R-004 | Backup grande ultrapassar 1 MiB do Firestore | Médio | Teto de 512 KB; corte do histórico mais antigo primeiro; favoritos/progresso nunca cortados; teste no limite. |
| R-005 | FR-002 fala em apagar "filas"; D-003 preserva a fila de exclusões | Baixo | Resolvido: FR-002 esclarecida com o usuário (A001). |
| R-006 | Atualizar sobe um backup "vazio" logo após reinstalar e apaga o anterior | Alto (perda de dados) | D-005 + contrato `backupDecision`: `unknown` nunca sobe sem perguntar o resumo antes. |
| R-007 | Reinstalação sem lembrete (dados apagados) não reassocia em 1 ação | Médio | Fluxo da 069 (recuperação pelo site com o código anotado) continua; quickstart documenta. |
| R-009 | **Decisão (execute)**: depois de a pessoa apagar o backup (TV ou site), o Atualizar não pode recriá-lo sozinho (SC-006) | Médio | `PUT` com `expectExisting` quando a TV já tinha backup; serviço responde 404 sem gravar; TV fica `disabled` até "Fazer backup agora". |
| R-010 | **Achado (execute)**: `portalClient` mapeava 409 → `conflict` e 401 → `unauthorized`, escondendo `recovery_required`/`invalid_credentials` | Alto (reassociação nunca aconteceria na TV real) | Resolvido: leitura só desses dois códigos do corpo JSON curto; teste `portalClient.codes.test.ts`. |
| R-008 | Restaurar PIN sem a dica `ccplay.parental.pinSources` deixa o controle "desligado" na UI | Médio | D-008 inclui a chave na allowlist e a restauração regrava a dica (armadilha no handoff). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-14 | Polish (T030–T034) | Segredos, `desvincular-backup.mjs`, legibilidade da oferta, docs, gates completos, publicação no staging com `smoke-backup.ps1` e instalação na TV. | T035: a pessoa testa Desvincular/backup/restaurar na TV. |
| 2026-10-14 | Fases 3–6 (T008–T029) | Desvincular + reassociação pela TV (API e cliente), backup no Atualizar/botão com `expectExisting`/`disabled`, restauração com oferta e pendências, apagar na TV e no site. Achado: cliente HTTP da TV escondia `recovery_required`/`invalid_credentials` (corrigido). 5/5 contratos verdes; pytest 152; portal-web 16/16. | Polish: segredos, E2E opt-in, docs, gates, staging (com confirmação). |
| 2026-10-14 | Fase 2 (T003–T007) | Esquema v25, estado do backup na TV, serviço e rotas de backup cifrado na API, pytest do backup (sigilo, no-store, uma versão, 413). | Fase 3: desvincular e reassociar. |
| 2026-10-14 | Fase 1 (T001–T002) | Constitution 1.12.0 ((g) backup de uso, (h) código guardado), ADR-017 e notas; A001/A002 resolvidos com o usuário. | Fase 2: esquema v25 e serviço de backup. |
| 2026-10-14 | Planejamento | Spec, plan, tasks, research, data-model, contracts, logic, quickstart e 5 contratos travados (vermelhos). | Fase 1 (emenda + ADR-017) antes de qualquer código. |
| 2026-10-23 | Fechamento | T035 (TV) validada pelo usuário; T036 sincronizada; status Convergida | — |

PRÓXIMO: T035 — a pessoa testa na TV (Desvincular → Atualizar, Fazer backup agora, Restaurar, Apagar); depois T036 e `sdd-converge`.

## Arquivos Principais

- sdd/specs/072-desvincular-backup/{spec,plan,tasks,handoff}.md · logic/{desvincular,backup}.md · contracts/portal-api-072.md
- tv-web/src/lib/portal/{unlink,portalConnection,portalAgent,portalSync}.ts · tv-web/src/lib/backup/*
- api/app/portal/{backup,self_relink}.py · api/app/portal/routes/backup.py

## Cuidados para Retomada

- **Não editar** os 5 arquivos travados desta feature nem os de 019/026/067/069/070/071 (ver handoff).
- Nada automático (ADR-016): backup só no Atualizar de listas e no botão; nenhum timer.
- O código de recuperação nunca vai em URL, log ou erro; só no corpo HTTPS.

## Resultado Final

Fechada a pedido do usuário em 2026-10-23, que declarou ter testado tudo (inclusive na TV física); as tarefas que dependiam dessa validação foram marcadas como "validado pelo usuário" — relato, sem evidência anexada nesta sessão. Os riscos da tabela **não** foram reauditados um a um nesta passada; o que é bug daqui em diante entra como bug. Ressalva: `evidencias/tv.md` não recebeu a passada de hoje; a evidência é o relato do usuário.
