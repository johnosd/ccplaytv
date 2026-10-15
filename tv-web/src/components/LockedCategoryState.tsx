import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { ParentalPinPrompt } from './ParentalPinPrompt'
import { unlockWithPin } from '../lib/catalog/categoryAccess'
import { useT } from '../lib/i18n/I18nProvider'

export interface LockedCategoryStateProps {
  /** Nome da categoria como a lista declara (nunca traduzido). */
  name: string
  /** O botão "Desbloquear" tem o foco (quando o PIN não está aberto). */
  focused: boolean
  /** O pedido de PIN está aberto — quem usa controla, porque o OK passa pelo teclado da tela. */
  pinOpen: boolean
  onOpenPin: () => void
  onClosePin: () => void
  /** A lista ativa: o PIN dela desbloqueia a sessão (`unlockWithPin`, feature 067) e o "Esqueci o PIN" confere os dados dela. */
  sourceId: string
}

/**
 * Conteúdo de uma categoria bloqueada (feature 066, FR-013/FR-014; D-008): nada dela é lido nem pedido à rede até o
 * PIN certo. Um botão focável "Desbloquear" (constitution: foco), e o pedido de PIN (com "Esqueci o PIN") por cima quando aberto. RETURN no PIN
 * fecha só o PIN; o RETURN da tela continua com a tela.
 */
export function LockedCategoryState({ name, focused, pinOpen, onOpenPin, onClosePin, sourceId }: LockedCategoryStateProps): ReactNode {
  const t = useT()
  return (
    <div className="locked-category-state">
      <Icon name="lock" className="locked-category-state-icon" />
      <p className="empty-state-title">{t('parental.locked.title')}</p>
      <p className="empty-state-description">{name}</p>
      <p className="empty-state-description">{t('parental.locked.text')}</p>
      <button type="button" className={`button-secondary${focused && !pinOpen ? ' tv-focus' : ''}`} onClick={onOpenPin}>
        {t('parental.locked.unlock')}
      </button>
      {pinOpen && <ParentalPinPrompt sourceId={sourceId} title={t('parental.pin.enter')} onSubmit={(pin) => unlockWithPin(sourceId, pin)} onCancel={onClosePin} />}
    </div>
  )
}
