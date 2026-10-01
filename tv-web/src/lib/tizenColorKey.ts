/**
 * Tecla de cor do controle como atalho complementar para favoritar
 * (feature 013, pedido do usuário em 2026-09-24 ao testar na TV física com
 * um controle substituto: segurar OK não se comportava como no navegador —
 * o controle real não entregava o mesmo padrão de `keydown`/`keyup`).
 *
 * A constitution exige "Toda Ação Essencial Tem Caminho Completo por
 * Controle Remoto" via setas + SELECT + RETURN — e os guias de boas
 * práticas já catalogados (`docs/guia-praticas-app-tv/03`) são explícitos:
 * "pressão longa, teclas coloridas... podem servir como atalhos, mas não
 * como único acesso". Por isso a tecla amarela é um SEGUNDO caminho — o
 * segurar OK continua existindo do jeito que estava, ver `useRemoteNav.ts`.
 *
 * Setas, Enter e RETURN chegam sem registro algum (Tizen entrega como
 * evento de teclado padrão). Teclas de cor são diferentes: por padrão a
 * plataforma não as entrega ao app — é preciso declarar o privilégio
 * `http://tizen.org/privilege/tvinputdevice` (`CCPlayTv/config.xml`) e
 * registrar a tecla via `tizen.tvinputdevice.registerKey()` antes que
 * qualquer evento dela chegue (`docs/guia-praticas-app-tv/03` — "não
 * registrar indiscriminadamente todas as teclas"). Registra só a amarela
 * (favoritar) e a vermelha (remover do "↺ Histórico", feature 036), nunca as
 * quatro.
 */

/** Nome da tecla na Web API do Tizen (`tizen.tvinputdevice`) — o mesmo valor chega em `KeyboardEvent.key`. */
export const FAVORITE_COLOR_KEY = 'ColorF2Yellow'

interface TVInputDeviceGlobal {
  tvinputdevice?: {
    getSupportedKeys?: () => Array<{ name: string; code: number }>
    registerKey?: (keyName: string) => void
  }
}

/**
 * Registra a tecla amarela como atalho de favoritar. Fora da TV —
 * navegador de desenvolvimento, `window.tizen` não existe — vira um no-op
 * silencioso, mesmo padrão de `tizenExit.ts`.
 *
 * **Verificação pendente na TV física** (mesmo gate de R-001): o nome
 * exato da tecla (`ColorF2Yellow`) e se `getSupportedKeys()` a lista nesta
 * TV específica não foram confirmados contra hardware real nesta sessão —
 * só contra a documentação da API. Se o registro falhar ou a tecla não
 * estiver na lista suportada, o atalho simplesmente não desperta (o
 * segurar OK continua sendo o caminho principal), sem quebrar o app.
 */
export function registerFavoriteColorKey(): void {
  const tizen = (window as unknown as { tizen?: TVInputDeviceGlobal }).tizen
  const inputDevice = tizen?.tvinputdevice
  if (!inputDevice?.registerKey) return

  try {
    const supported = inputDevice.getSupportedKeys?.() ?? []
    const isSupported = supported.length === 0 || supported.some((key) => key.name === FAVORITE_COLOR_KEY)
    if (!isSupported) return
    inputDevice.registerKey(FAVORITE_COLOR_KEY)
  } catch {
    // Registro pode falhar por motivo de plataforma (privilégio ausente,
    // TV mais antiga) — o atalho apenas não fica disponível; segurar OK
    // continua funcionando normalmente.
  }
}

/** Tecla vermelha: atalho de "Remover do histórico" na grade do "↺ Histórico" (feature 036, §7). */
export const REMOVE_COLOR_KEY = 'ColorF0Red'

/** `keyCode` da vermelha — fallback quando `event.key` não traz o nome. A conferir na TV física (R-002 da 036). */
export const REMOVE_COLOR_KEYCODE = 403

let removeColorKeyRegistered = false

/**
 * Registra a tecla vermelha no modo **estrito** (D-007 da 036, mesmo padrão de
 * `registerMediaKeys`, diferente da amarela acima): sem `getSupportedKeys()`,
 * com lista vazia, sem a vermelha na lista ou se algo lançar, não registra e
 * devolve `false`. A dica "● Remover do histórico" só aparece com registro
 * confirmado — prometer uma tecla que a plataforma não entrega seria uma dica
 * falsa. O detalhe do título é o caminho completo por setas + OK.
 */
export function registerRemoveColorKey(): boolean {
  removeColorKeyRegistered = false
  const tizen = (window as unknown as { tizen?: TVInputDeviceGlobal }).tizen
  const inputDevice = tizen?.tvinputdevice
  if (!inputDevice?.registerKey) return false

  try {
    const supported = inputDevice.getSupportedKeys?.() ?? []
    if (!supported.some((key) => key.name === REMOVE_COLOR_KEY)) return false
    inputDevice.registerKey(REMOVE_COLOR_KEY)
    removeColorKeyRegistered = true
  } catch {
    removeColorKeyRegistered = false
  }
  return removeColorKeyRegistered
}

/** A vermelha foi registrada com sucesso nesta sessão (decide a dica, FR-003). */
export function isRemoveColorKeyRegistered(): boolean {
  return removeColorKeyRegistered
}
