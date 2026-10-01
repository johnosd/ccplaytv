import { createContext, useCallback, useContext } from 'react'

/**
 * Região de anúncio única do app (DS V14 §38.3, feature 021).
 *
 * O contexto carrega o elemento da região persistente montada por
 * `AnnouncerRegion`. `null` = nenhuma região acima na árvore (ex.: teste
 * que renderiza uma tela sozinha) — consumidores caem no comportamento
 * antigo em vez de falhar (D-004 do plan.md).
 */
export const AnnouncerContext = createContext<HTMLElement | null>(null)

/**
 * Anuncia uma mensagem curta, sem texto visível correspondente (para texto
 * que já aparece na tela, como um toast, use o próprio `Toast` dentro da
 * região). Nunca move o foco. No-op sem região.
 */
export function useAnnounce(): (message: string) => void {
  const region = useContext(AnnouncerContext)

  return useCallback(
    (message: string) => {
      const slot = region?.querySelector<HTMLElement>('.sr-only')
      if (!slot) return
      // Limpa antes de gravar: repetir a MESMA mensagem só é lida de novo
      // se o conteúdo mudar de fato entre as duas (leitor de tela reage a
      // mutação, não a "o texto já não era esse antes").
      slot.textContent = ''
      setTimeout(() => {
        slot.textContent = message
      }, 20)
    },
    [region],
  )
}
