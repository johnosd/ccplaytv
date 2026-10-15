/**
 * Aviso de "a pessoa criou/editou/excluiu uma lista agora" (feature 071, FR-008/D-010). O agente montado no App
 * registra a escuta; sem portal configurado não há escuta e nada acontece. Nunca lança: a ação local não depende daqui.
 */
export type LocalSourceChange = 'saved' | 'deleted'

let listener: ((change: LocalSourceChange) => void) | undefined

export function onLocalSourceChanged(handler: (change: LocalSourceChange) => void) {
  listener = handler
  return () => { if (listener === handler) listener = undefined }
}

export function notifyLocalSourceChanged(change: LocalSourceChange = 'saved') {
  try { listener?.(change) } catch { /* o envio é tentado de novo no próximo Atualizar */ }
}
