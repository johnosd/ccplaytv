/**
 * Teclas do IME da TV (feature 045, `logic/ime-teclas-e-cobertura.md` §1).
 *
 * **Tabela única, e provisória**: o que o IME real da Samsung entrega à página
 * não foi medido (R-001). `done`/`cancel` vêm da documentação Samsung de que
 * me lembro, sem confirmação na TV; `next` fica **vazio de propósito** — nada
 * de inventar um código. A passada na TV (sonda `VITE_CCPLAY_IME_PROBE=1`,
 * T002) preenche isto com fato; nenhum outro arquivo deve repetir estes números.
 *
 * `Enter` nunca entra aqui: na TV, OK num campo focado é o que abre/fecha o
 * teclado do sistema (`useRemoteNav.ts`, `EDITABLE_PASSTHROUGH_KEYS`).
 */
export const IME_KEYCODES = {
  done: [65376] as readonly number[],
  cancel: [65385] as readonly number[],
  next: [] as readonly number[],
}

export type ImeKey = keyof typeof IME_KEYCODES

/** Só pelo `keyCode`: nessas teclas `event.key` costuma vir `Unidentified`. */
export function imeKeyOf(event: { keyCode?: number }): ImeKey | null {
  const code = event.keyCode
  if (typeof code !== 'number') return null
  for (const key of Object.keys(IME_KEYCODES) as ImeKey[]) {
    if (IME_KEYCODES[key].includes(code)) return key
  }
  return null
}
