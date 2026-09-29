import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

// Regressão: o diálogo aparecia no DOM antes de o listener em captura estar
// registrado, então uma tecla logo após a montagem vazava pra tela de baixo.
// Renderiza FORA de `act()` (que mascararia a janela) e dispara a tecla no
// primeiro microtask após o DOM do diálogo existir.
describe('Modal — teclas logo após a montagem', () => {
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const previous = g.IS_REACT_ACT_ENVIRONMENT

  afterEach(() => {
    g.IS_REACT_ACT_ENVIRONMENT = previous
    document.body.innerHTML = ''
  })

  it('entrega a tecla ao modal e não à tela de baixo', async () => {
    g.IS_REACT_ACT_ENVIRONMENT = false
    const below = vi.fn()
    document.addEventListener('keydown', below)
    const onDirection = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const pressed = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[role="dialog"]')) return
        observer.disconnect()
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
        resolve()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })

    root.render(
      <Modal onDirection={onDirection} onBack={() => {}} ariaLabel="Teste">
        <button>ok</button>
      </Modal>,
    )
    await pressed

    expect(onDirection).toHaveBeenCalledWith('right')
    expect(below).not.toHaveBeenCalled()

    document.removeEventListener('keydown', below)
    root.unmount()
  })
})
