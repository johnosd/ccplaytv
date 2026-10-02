/**
 * Verificação real de rede (feature 042, D-005, `logic/rede-e-lifecycle.md` §2).
 * `navigator.onLine` é só o sinal inicial; aqui o resultado de uma requisição
 * prevalece.
 */

export const VERIFY_NETWORK_TIMEOUT_MS = 5_000

export interface VerifyNetworkDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Injetável em teste; padrão `navigator.onLine`. */
  isOnline?: () => boolean
}

/**
 * `true` = o aparelho consegue alcançar a rede agora. `origin` (opcional) é só
 * a origem (esquema + host) do provedor da lista ativa — nunca caminho, usuário
 * ou senha. Limitada por `Promise.race` + timer (um `fetch` pode ignorar o
 * `AbortSignal`, como na feature 034). Nunca lança e nunca registra a origem.
 */
export async function verifyNetwork(origin?: string, deps: VerifyNetworkDeps = {}): Promise<boolean> {
  const online = deps.isOnline ? deps.isOnline() : navigator.onLine
  if (!online) return false
  if (!origin) return true

  const timeoutMs = deps.timeoutMs ?? VERIFY_NETWORK_TIMEOUT_MS
  const fetchImpl = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const probe = fetchImpl(origin, { mode: 'no-cors', cache: 'no-store', signal: controller.signal }).then(() => true)
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(false)
      }, timeoutMs)
    })
    return await Promise.race([probe, timeout])
  } catch {
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
