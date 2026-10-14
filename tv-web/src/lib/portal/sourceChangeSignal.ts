/**
 * Aviso de "a pessoa criou/editou uma lista agora" (feature 071, FR-008/D-010). O agente montado no App registra
 * a escuta; sem portal configurado não há escuta e nada acontece. Nunca lança: o cadastro local não depende daqui.
 */
let listener: (() => void) | undefined

export function onLocalSourceChanged(handler: () => void) {
  listener = handler
  return () => { if (listener === handler) listener = undefined }
}

export function notifyLocalSourceChanged() {
  try { listener?.() } catch { /* o envio é tentado de novo no próximo Atualizar */ }
}