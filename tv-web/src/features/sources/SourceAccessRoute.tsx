import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { decideSourceAccess } from '../../lib/catalog/sourceAccount'
import type { SourceOut } from '../import/importApi'
import { SourceAccessGate } from './SourceAccessGate'

export interface SourceAccessRouteProps {
  /** A versão mais nova da lista (`['sources']`) — depois de "Editar lista" já traz a conta nova. */
  source: SourceOut
  onOpen: (source: SourceOut) => void
  onEdit: (source: SourceOut) => void
  onBack: () => void
}

/**
 * Rota da tela de acesso (feature 034, `logic/conta-da-fonte.md` §5): refaz a
 * decisão a cada montagem a partir da fonte mais nova. Voltar da edição
 * REMONTA esta rota, e uma lista que passou a ter conta válida (ou nunca foi
 * verificada) segue direto para o Início, sem mostrar a tela de bloqueio de
 * novo. Só monta a tela quando a decisão não é `open`.
 */
export function SourceAccessRoute({ source, onOpen, onEdit, onBack }: SourceAccessRouteProps): ReactNode {
  // Uma vez por montagem: a decisão não muda sob os pés de quem está na tela.
  const [decision] = useState(() => decideSourceAccess(source, Date.now()))
  const opened = useRef(false)

  useEffect(() => {
    if (decision.action !== 'open' || opened.current) return
    opened.current = true
    onOpen(source)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por montagem
  }, [])

  if (decision.action === 'open') return null
  return <SourceAccessGate source={source} decision={decision} onOpen={onOpen} onEdit={onEdit} onBack={onBack} />
}
