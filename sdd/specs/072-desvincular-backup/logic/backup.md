# Lógica — Backup e restauração

## 1. Estado local (`portalDevice/backup`)

`unknown` (ausente, recém-pareada, desvinculada) → `offered` (serviço tem backup e a pessoa ainda não decidiu) →
`settled` (pode subir). Transições:

| De | Evento | Para |
| --- | --- | --- |
| unknown | resumo: não existe | settled (e sobe) |
| unknown | resumo: existe | offered (mostra a oferta) |
| offered | Restaurar concluído | settled |
| offered | "Substituir pelo desta TV" confirmado | settled (e sobe) |
| offered | "Agora não" | offered (oferta não reaparece sozinha; Portal & licença mostra Restaurar) |
| settled | Apagar backup | settled (lastBackupAt limpo) |
| qualquer | Desvincular / novas credenciais de cadastro | unknown |

## 2. Passo `backup` do Atualizar (após `snapshot`) e do botão

```
nextBackupAction({ state, remote }):        # contrato backupDecision
  state == 'settled'  → 'upload'
  state == 'offered'  → 'skip'
  state == 'unknown':
    remote == 'unavailable' → 'skip'
    remote.exists          → 'offer'
    else                   → 'upload'

step():
  state = read()
  remote = state == 'unknown' ? GET summary (erro → 'unavailable') : undefined
  action = nextBackupAction({ state, remote })
  upload → payload = buildUsageBackup(db, { now, settings: readAllowlistedSettings() }); PUT; state = settled, lastBackupAt
  offer  → state = offered, offer = { createdAt, counts }   # a UI mostra RestoreOffer
  skip   → nada
```

Falha do PUT não reagenda nada (ADR-016); o Atualizar mostra o código de erro como os outros passos.
"Fazer backup agora" com `state == offered` pede confirmação ("Substitui o backup de <data>") antes de forçar `settled`.

## 3. Restauração

```
restore():
  payload = GET /device/backup
  plan = planRestore({ backup: payload.usage, local: read locais, existingSourceIds: sources ids, now })   # contrato usageMerge
  transação: bulkPut(plan.apply.*); pendingRestore.bulkPut(plan.pending)
  settings: localStorage.setItem(k, v) para k na allowlist (inclui a dica de PIN da 067)
  tmdb: se integrations/tmdb ausente → put({ id: 'tmdb', key, format, state: 'connected', lastTestedAt: payload.createdAt })
  state = settled

planRestore:
  para cada registro do backup:
    se a lista (sourceId) não existe → acumula em pending[sourceId] (expiresAt = now + 5 dias)
    senão, se não há local com a mesma chave ou o do backup é mais novo → apply
  (registros só locais nunca são tocados — união)

applyPendingRestores(db, now):              # chamado no fim do Atualizar e ao abrir Portal & licença
  apaga pendentes com expiresAt <= now
  para cada pendente cuja lista existe: aplica com a mesma regra de mescla e apaga a linha
```

## 4. Conteúdo (`buildUsageBackup`, contrato usageBackup)

- `usage.userStates`: todos os registros (inclui ocultos do histórico, para não ressuscitá-los).
- `usage.categoryPreferences`, `usage.listPins` (salt + hash), `usage.settings` (allowlist).
- `secrets.tmdb`: `{ key, format }` se existir; fora de `usage`.
- `counts`: favoritos (`isFavorite`), histórico (`lastWatched` e não oculto), progresso (`progressSeconds > 0` e sem
  `completedAt`), preferências, PINs.
- Corte de tamanho: research §3.
