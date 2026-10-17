/**
 * ID lembrado na entrada manual (feature 077, FR-003/D-010): só o último ID usado com sucesso, em `localStorage`.
 * O ID (formato MAC) não é segredo; a chave do dispositivo NUNCA passa por aqui. Nenhuma função lança: sem storage
 * (modo privado, bloqueado) o portal só não lembra.
 */
export type LastDeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEY = 'ccplay-portal-last-device'
const FORMAT = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/

/** ID no formato MAC (aceita `:`/`-`/`.`/minúsculas) → `XX:XX:XX:XX:XX:XX`; qualquer outra forma = `undefined`. */
function normalize(value: string): string | undefined {
  const compact = value.trim().replace(/[:.-]/g, '').toUpperCase()
  return /^[0-9A-F]{12}$/.test(compact) ? compact.match(/../g)!.join(':') : undefined
}

/** Grava o ID normalizado; ID inválido não grava nada (o último que funcionou continua valendo). */
export function rememberDevice(storage: LastDeviceStorage, displayId: string): void {
  const id = normalize(displayId)
  if (!id) return
  try { storage.setItem(KEY, id) } catch { /* Sem storage: só não lembra. */ }
}

/** Último ID lembrado ou `undefined` (vazio, valor corrompido ou storage indisponível). */
export function readRememberedDevice(storage: LastDeviceStorage): string | undefined {
  try {
    const value = storage.getItem(KEY)
    return value && FORMAT.test(value) ? value : undefined
  } catch { return undefined }
}

/** "Usar outra TV": esquece o ID. */
export function forgetDevice(storage: LastDeviceStorage): void {
  try { storage.removeItem(KEY) } catch { /* Sem storage: nada a esquecer. */ }
}
