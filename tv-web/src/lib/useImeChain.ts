import { useEffect, type RefObject } from 'react'
import { imeKeyOf } from './imeKeys'

/**
 * Encadeamento dos campos de um formulário pelas teclas do IME da TV (feature
 * 045, US2, D-004/D-005, `logic/ime-teclas-e-cobertura.md` §2).
 *
 * Um único listener `keydown` **no contêiner da tela** (borbulha antes de
 * `document`, onde `useRemoteNav`/`useTvKeyNav` escutam — por isso o
 * `stopPropagation`). Só age quando o alvo é um `input.text-field-input` do
 * contêiner e a tecla está na tabela de `imeKeys.ts`:
 *
 * - `done`/`next`: foca o próximo campo em ordem de documento; se não há
 *   próximo, foca a **ação principal** (`primaryRef`). **Nunca** envia nem
 *   `click()` (FR-014) — o envio é só por OK na ação.
 * - `cancel`: só consome a tecla; não é RETURN e não pode sair da tela.
 *
 * `Enter` nunca passa por aqui: na TV é o OK que abre/fecha o teclado do
 * sistema (`useRemoteNav.ts`, `EDITABLE_PASSTHROUGH_KEYS`).
 *
 * As teclas da tabela ainda não foram medidas na TV (R-001): trocar os códigos
 * é só editar `IME_KEYCODES`.
 */
export function useImeChain(
  containerRef: RefObject<HTMLElement | null>,
  primaryRef: RefObject<HTMLElement | null>,
): void {
  // Sem lista de dependências, de propósito (como `useTvKeyNav`): o contêiner pode montar
  // depois da chamada do hook, quando a tela tem um estado de carregamento antes do JSX.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || !target.classList.contains('text-field-input')) return
      const key = imeKeyOf(event)
      if (!key) return

      event.stopPropagation()
      if (key === 'cancel') return
      event.preventDefault()

      const fields = Array.from(container!.querySelectorAll<HTMLInputElement>('input.text-field-input:not(:disabled)'))
      const next = fields[fields.indexOf(target) + 1]
      if (next) {
        next.focus()
        return
      }
      const primary = primaryRef.current
      if (primary) {
        primary.focus()
        // O botão fica visível, mas sem a rolagem que a cobertura do campo faz para o campo.
        primary.scrollIntoView?.({ block: 'nearest' })
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  })
}
