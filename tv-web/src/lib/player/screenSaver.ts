/**
 * Proteção de tela do sistema Tizen (feature 020, FR-001/FR-002) — desligada
 * enquanto o player está em reprodução ativa, religada em qualquer outra
 * transição (pausa, erro, conclusão, fechamento).
 *
 * Mesmo padrão de `avplayAdapter.ts`/`hasAvplay()`: feature-detect + try/catch
 * mudo. Em desktop/dev, sem `tizen.power`, os dois viram no-op — nunca lança
 * para dentro da camada de reprodução (perder o controle de screensaver é
 * degradação aceitável, nunca falha de player, mesmo espírito de D-010 da
 * feature 011).
 */

/**
 * Cast local, sem `declare global` — mesmo padrão de `tizenColorKey.ts`/
 * `tizenExit.ts`. Uma interface `Window.tizen` global tornaria `window.tizen`
 * uma propriedade conhecida em todo o projeto, invalidando os `@ts-expect-
 * error` que esses dois arquivos já têm sobre acessá-la sem cast (achado ao
 * rodar `tsc -b` nesta feature).
 */
interface TizenPowerGlobal {
  power?: {
    request(resource: string, state: string): void
    release(resource: string): void
  }
}

function tizenPower(): TizenPowerGlobal['power'] | undefined {
  return (window as unknown as { tizen?: TizenPowerGlobal }).tizen?.power
}

/** Chamado ao entrar em reprodução ativa (`playing`). */
export function disableScreenSaver(): void {
  const power = tizenPower()
  if (!power) return
  try {
    power.request('SCREEN', 'SCREEN_NORMAL')
  } catch {
    // Diagnóstico só — nunca interrompe a reprodução por causa disto.
  }
}

/** Chamado ao sair de reprodução ativa (pausa, erro, conclusão, fechamento). */
export function enableScreenSaver(): void {
  const power = tizenPower()
  if (!power) return
  try {
    power.release('SCREEN')
  } catch {
    // Idem.
  }
}
