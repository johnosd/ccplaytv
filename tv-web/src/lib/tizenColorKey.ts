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
 * qualquer evento dela chegue (`docs/guia-praticas-app-tv/03`, item do
 * backlog 44 — "não registrar indiscriminadamente todas as teclas").
 * Registra só a amarela, nunca as quatro.
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
