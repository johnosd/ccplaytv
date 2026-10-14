# Data Model — 069

Revisão sdd-plan 2026-10-11. Firestore guarda controle, IndexedDB guarda catálogo/configuração aplicada. Somente Xtream/M3U URL; nenhum arquivo M3U remoto.

## Firestore Standard/Native

| Documento | Dados e invariantes |
| --- | --- |
| devices/{deviceId} | ID público aleatório, identityHmac, hashes distintos TV bearer/deviceKey, recoveryCodeHmac/hashKeyVersion corrente, authEpoch, trialStartedAt/trialExpiresAt imutáveis, entitlementGeneration. DUID bruto não persiste. |
| identityClaims/{hmac} | Reserva transacional de identidade→deviceId; identificador nunca autentica ou recupera sozinho. |
| invites/{tokenHash} | deviceId/purpose/epoch/createdAt/expiresAt/consumedAt; purpose=recover exige recoveryClaimId e não abre sessão comum. 256 bits, 5 min/uso único transacional. |
| sessions/{tokenHash} | deviceId/epoch/createdAt/lastSeenAt; purpose=manage usa 30 min inatividade/8 h absoluta. purpose=recover tem recoveryClaimId obrigatório, namespace HMAC/cookie separado e limite de 5 min do desafio. Hash, nunca token em claro. |
| devices/{id}/configurations/{sourceId} | type/nome/desejada configVersion/revisão local conhecida/status; ciphertext/nonce/keyVersion/AAD; permanente enquanto cadastrada. Secretos não retornam em leitura browser. |
| devices/{id}/configurationVersions/{versionId} | Payload cifrado imutável exato do comando, createdAt, referenceCount; sem indexar ciphertext. Versão corrente ou referenciada não expira com ACK; versões órfãs expurgadas. |
| devices/{id}/operations/{operationId} | action/sourceId/expectedRevision/configVersion/authEpoch/expiresAt/state/lease/receipt/importState/idempotencyDigest. Delete não usa expiry de entrega. |
| devices/{id}/tombstones/{sourceId} | deletionId/origin/lastKnownRevision/deletedAt/confirmedAt/journalObjectId; sem URL/credencial. sourceId jamais reutilizado. |
| devices/{id}/deletionIntents/{deletionId} | pending_journal→pending_device→confirmed; fence por sourceId, confirmação e tentativa separadas. Persiste até confirmação, inclusive TV offline >7 dias. |
| devices/{id}/accessIntents/{operationId} | Fence/epoch anterior e alvo, verificador corrente e proposto, hashes bearer/key/claim, journalObjectId/digest, emissão cifrada pendente até5min, envelopeExpired distingue expurgo de journal ainda pendente, rodada e janela de retomada24h ancorada na primeira emissão. Código/token em claro nunca persistem. Finalização move envelope para recoveryResults; ACK elimina envelope. |
| devices/{id}/snapshot/current | capturedAt/snapshotRevision/allowlist/revisões aplicadas; não é estado desejado nem autoridade para criar/remover configuração guardada. |
| orders/{orderId} | deviceId/offerVersion/priceMinor=3500/currency=BRL/termMonths=12/reference/status/confirmedAt; beneficiário/preço imutáveis. |
| paymentClaims/{paymentId} | orderId/deviceId, reservado com ledger/grant na mesma transação; colisão nunca gera nova concessão. |
| paymentEvents/{dedupeId} | Referências mínimas e status/reconcileAt, sem webhook cru/cartão/segredos. |
| grants/{orderId} | deviceId/confirmedAt/startsAt/expiresAt/status/providerPaymentId; exatamente uma concessão/pedido. Revogar compra específica não apaga compras válidas. |
| jobs/{jobId} | kind/dedupeKey/deviceId (obrigatório para finalizar delete/access)/leaseOwner/leaseUntil/attempt/nextDueAt/checkpoint; callback transacional repetível, sem I/O externo. |
| recoveryCodes/{codeHmac} | deviceId/version/status/consumedByOperationId; hash por finalidade, nunca código em claro. Código corrente enquanto vínculo existir; versão/floor duráveis impedem reuso após restore. |
| recoveryClaims/{claimId} | identityHmac/challengeHash/claimSecretHash/authEpoch/recoveryEpoch/expiresAt/state/operationId/requestId/submittedCodeHash/idempotencyDigest. Bootstrap cifrado permite repetir resposta privada do mesmo nonce por 5 min; reservado apaga bootstrapEnvelope. Confirmação web é restrita ao claim e retorna só estado; prova de polling da TV não vai ao browser. Desafio 256 bits/5 min, consumo CAS e retomada limitada. |
| recoveryResults/{operationId} | envelope cifrado de emissão, deviceId/claimSecretHash/expiry/ack; máximo 5 min, remover após ACK. Verificador de retomada da mesma operação até 24 h, sem autenticação comum. |

IDs determinísticos substituem unique SQL; transações fazem leituras antes das escritas e validam epoch/revisões/fences. Além do authEpoch por TV, sessões/convites/bearers carregam recoveryEpoch global aleatório, alterado em todo restore e validado no acesso; isso invalida acessos emitidos depois do ponto restaurado. Floor de entitlement usa journal e JWS anterior verificado, conforme logic §7; nunca confiar em contador livre do cliente. Não usar consulta seguida de insert como unicidade. Retentativas não fazem rede/pagamento/crypto com nonce reutilizado. Preparar payload cifrado fora do callback, usando versão imutável; se CAS falhar, descartar e preparar nova versão.

### Retenção

- Configuração corrente: enquanto cadastrada. Exclusão elimina ciphertext corrente e todas as versões referentes, cancela comandos e escreve tombstone; limpeza pode ser em lotes, mas fence impede qualquer entrega durante ela.
- Create/update: 7 dias de entrega, até 5 pendentes/TV; recibos e estados terminais 30 dias. Digest/recibo compactado e revisão evitam replay após expurgo. RequestId velho fora da janela de idempotência retorna expired/409, nunca novo create silencioso.
- Deletes/tombstones: intenção até ACK, tombstone compacto enquanto device cadastrado, sem TTL de 7/30 dias. Excluir toda TV não é escopo deste incremento; política futura não pode remover tombstones com backups/operações ainda restauráveis.
- Convites/sessões: validade lógica em todo acesso; TTL físico pode atrasar. Expurgo não é autorização.
- Pagamentos/grants e claims de idempotência: enquanto dispositivo cadastrado, para conciliação e preservação dos direitos; não guardar cartão/webhook bruto. Exclusão integral de TV não integra este incremento. T045 publica finalidade/retenção e verifica adequação antes da venda, sem decisão de produto em aberto. Recovery: desafio/envelope 5 min, verificador de retomada até 24 h, metadados terminais sem segredo por 30 dias; código corrente/verificador e floor enquanto vínculo cadastrado. Sem casos/anexos de atendimento.
- Backup: diário/7 dias propostos, contém ciphertext e ledger, não chaves. Journal operacional: 30 dias, sem segredos; não é arquivo M3U nem backup do catálogo.

## Journal independente do restore

Bucket privado Cloud Storage em us-central1, uniforme/IAM sem ACL pública. Objeto determinístico `events/{deviceId}/{intentId}.json`, criado somente com `ifGenerationMatch=0`; repetição aceita só objeto de mesmo digest. Schema allowlist: schemaVersion, eventId, kind=source_deleted/access_revoked/license_revoked, deviceId, sourceId opcional, revision/generation/epoch/recoveryCodeVersion/operationId/recoveryCodeHmac/hashKeyVersion, occurredAt, referenceId/digest. Sem nome de lista, URL, usuário/senha, token, chave, código de recuperação em claro ou DUID. recoveryCodeHmac é verificador não reversível por finalidade, jamais aceito como bearer; permite recuperar o índice corrente sem revalidar código consumido. A chave HMAC permanece na recuperação separada de chaves.

Aplicação tem create/read/list mínimos, não update/delete; lifecycle administrativo remove após 30 dias. Retenção bloqueada irreversível não é ativada no piloto. Journal recebe intenção autorizada antes de ACK de exclusão/revogação; Firestore reserva fence primeiro e finaliza depois. Jobs completam intenções após crash. Não há transação distribuída: protocolo write-ahead/idempotente é obrigatório, não uma promessa de atomicidade entre serviços. Perda/indisponibilidade do journal bloqueia confirmação desses eventos e reabertura pós-restore; a TV ainda exclui localmente e mantém outbox.

## IndexedDB na TV

Reler versão livre em dbSchema/registerLateCatalogSchemas antes de migrar. Usar acessores tipados, sem `db.channels` para catálogo.

| Tabela nova proposta | Contrato |
| --- | --- |
| portalDevice | Chave device: deviceId/token/key/epoch, nextSyncAt/lastSuccessfulSync/syncRetry (attempt/dueAt) e dados de vínculo. Chave bootstrap: nonce de cadastro, recoveryRequest (nonce/startedAt), pendingRecovery (claimId/deviceId/token/claimSecret/expiresAt), pendingRotation e pendingAck (operationId/authEpoch). Persistir antes de rede/QR; commit da emissão substitui provas pendentes por ACK. Não exportar credenciais nem DUID. |
| sourceRevisions | sourceId/revision/tombstone/deletedAt/importGenerationFloor; edição local/remota atualiza revisão no mesmo commit, reserva de import só avança floor sem alterar revisão. |
| portalOperations | operationId/sourceId/appliedRevision/result/digest; recibo idempotente, sem duplicação de segredo. |
| pendingImportOutbox | sourceId/configRevision/operationId/state/runId/owner/leaseUntil; runId ligado no commit da reserva de import, heartbeat distingue ativo/abandonado; conclusão/publicação são um commit. Dreno limitado/serial com lease e cancelamento após edição/delete. |
| pendingPortalDeletes | deletionId/sourceId/revision/createdAt/serverAckAt; mesmo commit da remoção local, sem credenciais. Nunca perder ao reiniciar. |
| licenseCache | JWS validado/deviceId/generation/timeHighWatermark/lastSuccessfulSync/nextDueAt; independente das listas. |

Fonte existente continua `provider_credentials`/`m3u_url`. Edição preserva sourceId e identidade lógica; recriar deliberadamente usa novo ID. Remoção não apaga licença ou outras listas. Segredos existentes só na TV não são enviados ao portal; snapshot allowlist é separado de SourceView.

## Estados

Entrega create/update: pending→received→awaiting_confirmation→applied; conflict/error/cancelled/expired terminais. ImportState independente queued/running/completed/error. `received` não é `applied`; erro de import não remove geração válida anterior.

Delete: local_deleted_remote_pending ou portal_deleted_device_pending → synchronized_deleted. Portal não afirma remoção local antes do ACK. Confirmação local recusada não restaura segredo já excluído no portal; mostrar remoção local aguardando ação e permitir usuário decidir, sem reenvio automático de configuração antiga.

Pedido: created/pending/approved/refused/cancelled/refunded/charged_back conforme consulta confiável; estado antigo não retrocede concessão. Entitlement tem geração monotônica, mas restore exige invalidar/reconciliar sessões e obter geração superior à observada, nunca voltar geração do cache da TV.

Código privado de recuperação é a exceção de exibição explícita da constitution 1.8.0. Não integra snapshot, exportação, diagnóstico ou leitura de configuração do portal. Chave HMAC por finalidade possui recuperação protegida separada do banco, conforme política das demais chaves.

## Implementação US1 — controle transacional (2026-10-11)

Device.pendingOperationCount (0..5) é reservado/liberado no CAS de criação/terminal/expiry/delete; Operation.countedPending impede dupla liberação. Configuration.activeOperationId impede presumir revisões futuras. Versão.referenceCount decrementa no terminal; corrente permanece cifrada. IdempotencyClaim por device/rota/operationId é imutável; replay precede merge, sem recriar após exclusão.

Snapshot: authEpoch/recoveryEpoch/capturedAt/receivedAt/snapshotRevision; arrays sources/revisions/imports com IDs únicos e subconjunto válido. SourceSnapshot literal5campos, sem URL/DNS/credencial. Timestamp monotônico por epoch; repetição idêntica idempotente e ausência não remove configuração. Metadados paginados99+device por CAS.

### Complemento de persistência local executado (US1/US2)

pendingImportOutbox.acknowledgedState opcional completed|error evita repetir ACK de importação já confirmado; falha mantém envio pendente. portalDevice/bootstrap.pendingAck.purpose opcional revoke|rotate|recovery distingue confirmação persistida de nova ação: ACK perdido retoma a mesma emissão. Ao converter pendingRecovery em pendingAck, purpose=recovery é conservado até ACK comparando operationId/authEpoch; provas/códigos nunca entram em snapshot.

## Sessão local de uso da lista — decisão 2026-10-11

Autorizar a entrada usando licença assinada/cache/relógio confiável vigentes. Não criar documento ou flag persistida de autorização da sessão. Navegação existente em memória identifica lista aberta; sair para o seletor ou fechar app encerra a continuidade, e escolha/RETURN revalidam. Vencimento não fecha a sessão já admitida; status/validade continuam refletindo o cache. Revogação confirmada mantém encerramento controlado.

> **Atualização (070, 2026-10-13):** a feature 070 alterou o descrito neste documento quanto a: ID exibido no formato MAC (imutável, ADR-015), chave do dispositivo numérica de 10 dígitos, sessão manual por ID + chave e rota de valores salvos para a própria TV (`values`). O contrato e a lógica vigentes estão em `sdd/specs/070-entrada-listas-gerenciador/` (`contracts/portal-api-070.md`, `logic/pareamento.md`, `data-model.md`) e nas invariantes I-1…I-10 do `plan.md`. Não reverter.