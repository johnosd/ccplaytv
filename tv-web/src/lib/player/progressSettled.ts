/**
 * Aviso de que a gravação de progresso de uma sessão de reprodução terminou (bug
 * `filmes-no-salvam-progresso-reproduo-nem`). Dois motivos para existir fora da tela:
 *  - quem lê o estado do usuário (detalhe de filme/série, Continuar assistindo) precisa reler **depois** da escrita, e não
 *    antes — a camada de reprodução fecha antes de a escrita comitar;
 *  - se a escrita falhou, a pessoa precisa saber, com um código curto (nunca mensagem, URL ou dado do banco).
 * Só memória, sem React: o `ProgressSaveNotice` (raiz do app) assina e reage.
 */

type Listener = (failureCode: string | null) => void

const listeners = new Set<Listener>()

/** `failureCode` = código curto da falha ainda não avisada, ou `null` se tudo foi gravado. */
export function notifyProgressSettled(failureCode: string | null): void {
  for (const listener of listeners) listener(failureCode)
}

export function subscribeProgressSettled(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
