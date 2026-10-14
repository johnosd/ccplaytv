const reasons = new Map([
  ['QuotaExceededError', 'QUOTA'], ['NotFoundError', 'TABLE'], ['SchemaError', 'SCHEMA'],
  ['VersionError', 'VERSION'], ['InvalidStateError', 'STATE'], ['TransactionInactiveError', 'TRANSACTION'],
  ['AbortError', 'ABORT'], ['DatabaseClosedError', 'CLOSED'], ['OpenFailedError', 'OPEN'],
  ['DataCloneError', 'CLONE'], ['SecurityError', 'SECURITY'], ['TypeError', 'TYPE'],
] as const)

type Reason = typeof reasons extends Map<string, infer Value> ? Value : never
export type SpeedTestStorageCode = `NET-${'R' | 'W' | 'D'}-${Reason | 'UNKNOWN'}`

/** Falha ao gravar o progresso de reprodução: mesmo critério seguro, prefixo próprio (`PRG-W-QUOTA`…). */
export function progressFailureCode(error: unknown): string {
  return storageFailureCode('W', error).replace('NET-', 'PRG-')
}

/** Só nomes reconhecidos viram códigos do app; nunca mensagem, stack ou dados da exceção. */
export function storageFailureCode(operation: 'R' | 'W' | 'D', error: unknown): SpeedTestStorageCode {
  let reason: Reason | 'UNKNOWN' = 'UNKNOWN'
  try {
    for (let depth = 0; depth < 3 && error && typeof error === 'object'; depth += 1) {
      const value = error as { name?: unknown; inner?: unknown }
      if (typeof value.name === 'string') {
        const known = reasons.get(value.name as Parameters<typeof reasons.get>[0])
        if (known) reason = known
      }
      error = value.inner
    }
  } catch { /* Objetos de erro não confiáveis também podem ter getters que lançam. */ }
  return `NET-${operation}-${reason}`
}
