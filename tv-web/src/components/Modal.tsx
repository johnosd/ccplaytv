import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRemoteNav } from '../lib/useRemoteNav'
import type { RemoteDirection } from '../lib/useRemoteNav'

export interface ModalProps {
  onDirection?: (direction: RemoteDirection) => void
  onSelect?: () => void
  /** Fecha o modal — RETURN sempre chama isto (obrigatório: é o único jeito de sair). */
  onBack: () => void
  /** Nome acessível do diálogo (`aria-label`). */
  ariaLabel: string
  children: ReactNode
}

/** No máximo um `Modal` intercepta o teclado por vez (D-010, FR-009). */
let activeModalId: symbol | null = null

/**
 * Casca genérica de modal (feature 022, D-010 do plan.md): abre já
 * interceptando o teclado (`useRemoteNav({modal:true})`, mesmo mecanismo
 * de `ConfirmDialog`), e no máximo um `Modal` fica visível/ativo por vez —
 * o segundo montado enquanto o primeiro está ativo não renderiza
 * `children` nem registra `useRemoteNav`.
 */
export function Modal({ onDirection, onSelect, onBack, ariaLabel, children }: ModalProps): ReactNode {
  const idRef = useRef<symbol>(Symbol('modal'))
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const id = idRef.current
    if (activeModalId === null) {
      activeModalId = id
      setIsActive(true)
    }
    return () => {
      if (activeModalId === id) {
        activeModalId = null
      }
    }
  }, [])

  // Chamado incondicionalmente (regra dos hooks): quando inativo, nenhum
  // handler é repassado e `modal` fica `false` — o hook ainda registra um
  // listener inerte (sem `stopImmediatePropagation`), mas como o Modal
  // ativo já intercepta na fase de captura, esse listener nunca chega a
  // rodar em resposta a uma tecla real.
  useRemoteNav(
    {
      onDirection: isActive ? onDirection : undefined,
      onSelect: isActive ? onSelect : undefined,
      onBack: isActive ? onBack : undefined,
    },
    { modal: isActive },
  )

  if (!isActive) return null

  return (
    <div className="modal-overlay">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  )
}
