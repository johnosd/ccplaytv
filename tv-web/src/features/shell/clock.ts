import { useEffect, useState } from 'react'

/** `HH:MM`, 24 h, com zero à esquerda (feature 023, FR-019). */
export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Milissegundos até a próxima virada de minuto — sempre em (0, 60000]. */
export function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
}

/**
 * Hora local para a topbar (feature 023, FR-019). Já nasce com a hora
 * certa (nunca um "00:00" provisório) e só se atualiza na virada do minuto:
 * um `setTimeout` encadeado até o próximo `:00`, não um `setInterval` de 1 s
 * (redesenhar todo segundo é trabalho à toa numa TV).
 *
 * Se o timer disparar uns milissegundos antes da virada, o texto continua o
 * mesmo e o reagendamento seguinte cai logo depois — a hora se corrige
 * sozinha, sem depender de o timer ser exato.
 */
export function useClock(): string {
  const [text, setText] = useState(() => formatClock(new Date()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function tick() {
      const now = new Date()
      setText(formatClock(now))
      timer = setTimeout(tick, msUntilNextMinute(now))
    }

    timer = setTimeout(tick, msUntilNextMinute(new Date()))
    return () => clearTimeout(timer)
  }, [])

  return text
}
