/**
 * Formata milissegundos como texto de tempo pra tela.
 *
 * Nunca inventa horas pra um filme curto: `12:05`, não `0:12:05`. Acima de
 * uma hora, mostra horas e minutos sem segundos (`1h23`) — precisão
 * suficiente pro rótulo de retomada e pro tempo decorrido/total da barra;
 * segundos deixariam de caber com folga na largura do controle.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (hours > 0) return `${hours}h${pad(minutes)}`
  return `${minutes}:${pad(seconds)}`
}
