import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { AnnouncerContext } from '../lib/announcer'

export interface ToastProps {
  message: string | null
  /**
   * Muda a cada exibição, mesmo com texto repetido (`useToast().toastKey`),
   * pra remontar o nó dentro da região de anúncio e o leitor de tela
   * anunciar de novo (feature 021, FR-024). Opcional: sem ele, o `key` cai
   * no próprio texto — funciona igual, exceto pra dois toasts idênticos em
   * sequência.
   */
  messageKey?: number
}

/**
 * Sem `AnnouncerRegion` no contexto (`null`): comportamento de sempre,
 * inalterado — é o que mantém as telas que renderizam `Toast` sozinhas
 * (testes de tela) intactas. Com região: portado pra DENTRO dela, sem
 * `role` próprio — duas regiões vivas aninhadas seriam lidas de forma
 * imprevisível (`logic/regiao-de-anuncio.md`).
 */
export function Toast({ message, messageKey }: ToastProps) {
  const region = useContext(AnnouncerContext)

  if (!message) return null

  if (!region) {
    return (
      <div className="toast" role="status">
        {message}
      </div>
    )
  }

  return createPortal(
    <div className="toast" key={messageKey ?? message}>
      {message}
    </div>,
    region,
  )
}
