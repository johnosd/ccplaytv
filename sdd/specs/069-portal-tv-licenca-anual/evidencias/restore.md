# Ensaio de restore em banco isolado — T039/T060 (parcial) — 2026-10-14

Autorizado pelo usuário em 2026-10-13 (criar `portal-restore-070`, ler o banco restaurado e apagá-lo ao final). Projeto `ccplaytv-511322`, staging; produção não existe.

## O que foi executado

| Passo | Resultado |
| --- | --- |
| `manage-backup.ps1 -Action inspect` (usuário) | `backup_current`, 22,9 h, snapshot `2026-10-13T03:31:48Z` |
| `gcloud firestore backups list` | 1 backup READY (`…/backups/380ac9a7-…`) |
| `manage-backup.ps1 -Action restore -DestinationDatabase portal-restore-070 -Apply` | `backup_operation_submitted`, `reopenTraffic=false`; submissão em 5,3 s |
| Banco restaurado disponível | 23,2 s após o início (banco criado; dados ainda em restauração) |
| Operação de restore concluída (`done`, sem erro) | **532,5 s (~8,9 min)** desde o início, medido por polling de 10 s |
| Leitura somente-leitura do banco restaurado | 15 `devices`, coleções raiz `devices, grants, identityClaims, jobs, orderClaims, orders, paymentClaims, paymentEvents, rateLimits, recoveryCodes, recoveryResults, sessions` |
| Banco de ensaio apagado | `gcloud firestore databases delete` COMPLETED; só `(default)` permanece |

A leitura imprimiu só contagens, nomes de campo e booleanos: nenhum hash, token, chave ou ID foi exibido.

## Medições

- **RTO observado**: restore de um banco de staging pequeno (15 dispositivos) levou ~8,9 min até `done`. É piso, não promessa: o tempo cresce com o volume e a medição tem granularidade de 10 s.
- **RPO observado**: idade do snapshot na inspeção 22,9 h (agendamento diário, meta nominal ≤ 24 h).

## Achado importante: o snapshot é anterior à 070

O snapshot de `2026-10-13T03:31Z` foi tirado **antes** do staging receber a API da 070 (revisão `00016`, publicada depois). No banco restaurado nenhum dispositivo tem `displayId` e não existe a coleção `displayIdClaims`. Portanto este ensaio:

- **prova**: o restore para nova base funciona, é isolado, não reabre tráfego e preserva as coleções e os dispositivos da 069;
- **não prova ainda** (T060): que `display_id`, `display_id_source` e `displayIdClaims` sobrevivem ao restore, nem o caso "TV com chave mais nova que o snapshot". Registros sem ID seguem o upgrade D-004 na primeira rotação (coberto por `test_pairing.py`), mas isso não foi observado num restore real.

**Repetir** com um snapshot posterior à publicação da 070 (o próximo diário, após ~03:31Z de 2026-10-14).

## Não coberto (T039 segue aberta)

- Replay do journal e reconcile/manutenção pós-restore: só existe o decodificador fail-closed (`restore_journal.py`); não há executor de replay.
- Cenário "backup anterior a um delete" sem ressuscitar segredo ou grant.
- Recuperação da cópia protegida das chaves e restore dos pagamentos/grants com revalidação.


## Atualização 2026-10-14 — executor de replay implementado (T064/T065)

O gap "não há executor de replay do journal" deixou de existir: `api/app/portal/restore_replay.py` aplica `source_deleted`, `access_revoked` e `license_revoked` sobre a base restaurada, idempotente e sem segredo. Cobertura com emulador: `api/tests/portal/test_restore_replay.py` (6/6; suíte `tests/portal` 138 passed). **Ainda não foi executado contra um banco restaurado com o journal real** — depende do snapshot pós-070. O cenário "backup anterior a delete" está demonstrado em teste (configuração restaurada some, tombstone e comando de exclusão ficam, nada é reentregue).


## Ensaio 2 — snapshot posterior à 070 — 2026-10-14

Autorizado pelo usuário em 2026-10-14 (criar `portal-restore-070`, ler o banco restaurado e rodar o dry-run do replay). Backup `fb496533-…`, snapshot `2026-10-14T03:40:53Z`, 7,3 h de idade na restauração.

| Item | Resultado |
| --- | --- |
| Restore (`manage-backup.ps1 -Action restore -Apply`) | operação concluída em **1008,8 s (~16,8 min)**, sem erro, `reopenTraffic=false` |
| `devices` | **64** (o ensaio anterior tinha 15; crescimento por dispositivos de fixture dos smokes/medições/homologação) |
| Dispositivos com `displayId` | **4** (3 `derived`, 1 `generated` = TV de referência); 60 anteriores à 070 ainda sem ID |
| `displayIdClaims` | **4** — cada dispositivo com ID tem exatamente 1 reserva, 0 reservas sem dono, IDs únicos |
| Campos novos no banco restaurado | `displayId`, `displayIdSource` em `devices`; coleção raiz `displayIdClaims` presente |
| Modelos do replay x documentos reais | 64 `devices`, 66 `recoveryCodes`, 2 `grants`, 3 `tombstones`, 3 `deletionIntents`: **todos válidos**, 0 inválidos |
| Journal real (`ccplaytv-511322-portal-journal`) | 5 objetos, **5 decodificados** pelo decodificador fail-closed (2 `access_revoked`, 3 `source_deleted`) |
| Dry-run do replay | os 5 eventos já estão aplicados no snapshot (`already_applied`): `--apply` seria no-op; 0 `device_absent`, 0 `fence_pending` |
| Banco de ensaio | apagado; só `(default)` permanece |

## Conclusões

- **T060 provado em restore real**: `display_id`, `display_id_source` e `displayIdClaims` sobrevivem ao restore, com reserva 1:1 e sem colisão.
- **Executor de replay (T064)**: o decodificador e os modelos funcionam com dados reais. O `--apply` não foi executado (a autorização cobria o dry-run, e o resultado seria no-op); a lógica de aplicação está provada pelos 6 testes com emulador.
- **RTO**: restore real levou 532,5 s (15 dispositivos) e 1008,8 s (64 dispositivos). Não é linear nem estável; registrar a faixa observada, não uma promessa.
- **RPO**: snapshots diários com 22,9 h e 7,3 h de idade nas duas inspeções; o objetivo nominal ≤ 24 h se mantém.
- **Segue aberto em T039**: replay `--apply` contra eventos que **não** estejam no snapshot (exige gerar uma exclusão/revogação depois do snapshot e restaurar de novo), recuperação da cópia protegida das chaves e restore de pagamentos/grants com revalidação do provedor.