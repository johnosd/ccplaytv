/** ID da TV (formato MAC) na entrada manual. Normaliza para `AA:BB:CC:DD:EE:FF` antes de enviar. */
export function normalizeDisplayId(value: string) {
  const compact = value.trim().replace(/[:.-]/g, '').toUpperCase()
  return /^[0-9A-F]{12}$/.test(compact) ? compact.match(/../g)!.join(':') : value.trim()
}

/** Exibição `AA-BB-CC-…` ao preencher e ao sair do campo; o par incompleto do fim fica como está. */
export function formatDisplayIdInput(value: string) {
  const compact = value.replace(/[^0-9A-F]/gi, '').slice(0, 12).toUpperCase()
  return compact.match(/.{1,2}/g)?.join('-') ?? ''
}

/**
 * 081/T046: durante a digitação o texto NÃO é reescrito (maiúsculas, hífens). Teclados de celular digitam em modo de
 * composição, e trocar o valor no meio dela apagava o que a pessoa digitava. Só descarta o que nunca vale num MAC.
 */
export function typedDisplayId(value: string) {
  return value.replace(/[^0-9A-Fa-f:.\- ]/g, '').slice(0, 17)
}
