# Lógica — Desvincular e reassociar

## 1. Desvincular (Portal & licença)

```
onConfirm():
  if online:
    result = refresh('backup-only')        # mesmo passo do Atualizar (logic/backup.md §2), só o backup
    warn = result.ok ? null : 'backup_not_done'
  else warn = 'backup_not_done'
  await unlinkPortal(db, now)               # transação única
  agent.reset()                             # esquece pausa de 10 s e envios em curso (aborta)
  show(warn ? 'Desvinculada; o backup não foi feito' : 'Desvinculada')

unlinkPortal(db, now):                      # tudo numa transação rw
  device = portalDevice.get('device')
  if device: portalDevice.put({ id: 'relink', deviceId, displayId, recoveryCode, recoveryCodeVersion, savedAt: now })
  portalDevice.delete('device'); portalDevice.delete('bootstrap')
  licenseCache.delete('entitlement'); sourceUploads.clear()
  portalDevice.put({ id: 'backup', state: 'unknown' })
  # NÃO toca: sources, catálogo, userStates, integrations, categoryPreferences, parentalPins,
  #           localTrial, pendingPortalDeletes, sourceRevisions, portalOperations, pendingImportOutbox
```

- Sem `device` (nunca pareada): o botão fica soft-disabled; `unlinkPortal` sem device não cria lembrete.
- Um Atualizar em curso é abortado antes da transação (o agente expõe `reset()`); nada fica pela metade porque cada
  fila já é durável e idempotente.

## 2. Reassociar (dentro de `PortalConnection.prepare()`)

```
if !device:
  try enroll(...)                           # como hoje
  catch PortalRequestError('recovery_required'):
    hint = readRelinkHint(db)
    if !hint: throw                         # reinstalação: fluxo do site da 069
    nonce = enrollmentNonce(db, ...)        # reaproveita o nonce durável (idempotência)
    issued = POST /devices/recovery/self { platformIdentity, nonce, recoveryCode: hint.recoveryCode, ...mac }
    persistCredentialIssuance(db, issued, issued.operationId, now)   # cria pendingAck
    delete relink hint                      # consumido; o código antigo deixou de valer no serviço
    reconcileTrial(issued)
  → segue o fluxo de ACK existente
```

- `invalid_credentials` na rota nova: apaga o lembrete (código inútil) e propaga o erro; Portal & licença mostra
  "Recuperar acesso pelo site" (069).
- O código nunca entra em URL, mensagem de erro ou log (inclusive em `PortalRequestError`).

## 3. Serviço — `self_relink.py`

```
relink(identity, nonce, code, ip, now, mac?):
  rate limits (identidade, IP, global)
  claim = identityClaims[hmac(identity)] → device_id ; device = devices[device_id]
  require device.recovery_code_hmac == codes.digest(code) e versão ativa      # senão invalid_credentials uniforme
  emissão como a rotação 'revoke' (access_rotation): auth_epoch+1, bearer/chave/código novos, display_id mantido
  grava IssuanceDocument(purpose='self-relink', nonce) para idempotência e ACK
```
