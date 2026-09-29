import type { ReactElement } from 'react'
import type { TrailerCandidate } from '../lib/trailer/trailerCandidates'

/**
 * Camada de tela cheia que toca um trailer pelo player oficial do YouTube,
 * carregado através da página-ponte (feature 033, ADR-012,
 * `logic/sessao-de-trailer.md` e `logic/pagina-ponte.md`). Dona do teclado
 * enquanto aberta (`useRemoteNav` modal); nunca conhece o catálogo nem o
 * estado do usuário.
 *
 * STUB do sdd-plan — o sdd-execute implementa (contrato
 * `TrailerLayer.trailers.contract.test.tsx`).
 */
export interface TrailerLayerProps {
  /** Só para a tela (título/anúncio) — NUNCA vai para a página-ponte (FR-010). */
  title: string
  /** Já na ordem de preferência; só os dois primeiros são usados (FR-017). */
  candidates: readonly TrailerCandidate[]
  /** Chamado uma vez ao fechar (RETURN, fim, "Voltar", app oculto). */
  onClose: () => void
}

export function TrailerLayer(props: TrailerLayerProps): ReactElement {
  void props
  throw new Error('not implemented')
}
