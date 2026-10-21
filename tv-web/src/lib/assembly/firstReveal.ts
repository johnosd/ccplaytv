/**
 * Sinal de "a primeira tela da sessão já apareceu" (feature 086, T073 / `logic/documento-de-tela.md` P3).
 *
 * Por que existe: na TV, a 1ª abertura do Início caiu em cima da carga da lista e esperou ~1,7–2,2 s por uma leitura de
 * dezenas de linhas. A sonda (T070) mostrou que **fatiar a carga não resolve** de forma confiável (p95 19,2 ms numa
 * rodada e 104,9 ms na outra) e que o custo é a thread ocupada — então o que vale é a carga **não competir** com o
 * primeiro desenho, como fazem os apps de streaming na TV.
 *
 * Tem um teto de propósito: se nenhuma das três telas montar (a pessoa ficou na seleção de lista, ou está adicionando
 * uma lista nova e a carga é justamente o que ela espera), a espera solta sozinha pouco depois do app subir.
 */

/** Teto da espera, contado do carregamento do módulo — logo, do início da sessão. */
export const FIRST_REVEAL_WAIT_MS = 2_500

const startedAt = Date.now()
let revealed = false
let waiting: (() => void)[] = []

/** Chamado pela montagem quando uma tela revela. Idempotente: só a primeira revelação conta. */
export function noteFirstReveal(): void {
  if (revealed) return
  revealed = true
  const pending = waiting
  waiting = []
  for (const resolve of pending) resolve()
}

export function isFirstRevealDone(): boolean {
  return revealed || Date.now() - startedAt >= FIRST_REVEAL_WAIT_MS
}

/**
 * Espera a primeira revelação da sessão, ou o teto — o que vier primeiro. Resolve na hora quando já aconteceu, então
 * chamar isto fora da 1ª abertura não custa nada.
 */
export function waitForFirstReveal(signal?: AbortSignal): Promise<void> {
  if (isFirstRevealDone() || signal?.aborted === true) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      const index = waiting.indexOf(finish)
      if (index >= 0) waiting.splice(index, 1)
      resolve()
    }
    const timer = setTimeout(finish, Math.max(0, FIRST_REVEAL_WAIT_MS - (Date.now() - startedAt)))
    // Cancelar a carga cancela a espera: sem isto, o temporizador sobrevive a quem o pediu (e, nos testes, ao próprio
    // ambiente — foi assim que a suíte completa acusou uma rejeição do React depois do fim do teste).
    signal?.addEventListener('abort', finish, { once: true })
    waiting.push(finish)
  })
}

/** Só para teste: devolve o módulo ao estado inicial. */
export function resetFirstRevealForTests(): void {
  revealed = false
  waiting = []
}
