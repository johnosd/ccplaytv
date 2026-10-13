import { useEffect, useState } from 'react'
import { readSourceFormFields, type StoredSourceFields } from '../../lib/catalog/sourceFormFields'

/**
 * Valores salvos da lista em edição (feature 070, FR-011), lidos do IndexedDB do próprio aparelho.
 * `null` enquanto carrega, sem lista (cadastro) ou se a leitura falhar — quem usa trata os três como
 * "campo em branco mantém o valor atual", o comportamento de antes. Nunca registra o resultado.
 */
export function useStoredSourceFields(sourceId: string | undefined): StoredSourceFields | null {
  const [stored, setStored] = useState<StoredSourceFields | null>(null)

  useEffect(() => {
    if (!sourceId) return
    let cancelled = false
    readSourceFormFields(sourceId).then(
      (fields) => {
        if (!cancelled && fields) setStored(fields)
      },
      () => {
        // Leitura local falhou: o formulário segue como antes (em branco = manter), sem expor o motivo.
      },
    )
    return () => {
      cancelled = true
    }
  }, [sourceId])

  return stored
}
