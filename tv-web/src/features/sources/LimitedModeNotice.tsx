import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'

/**
 * Explicação do Modo limitado (feature 014, US2, FR-021) — compartilhada
 * entre o hub e Configurações › Fontes IPTV (feature 026, D-007; movida de
 * `features/list-home/`).
 *
 * O selo "Modo limitado" (feature 004) já dizia QUE a fonte estava assim;
 * esta explicação diz POR QUÊ, o que a fonte perde em relação ao protocolo
 * completo e o que a pessoa pode fazer — sem isso, a pessoa não tinha como
 * entender nem agir.
 *
 * Informação, não erro (D-008 da feature 004): mesmo tom do selo, nunca a
 * cor/estilo de `.form-error`. E nunca o endereço do painel, o usuário ou
 * a senha (FR-022/FR-024) — o componente nem recebe esses dados como prop.
 */

const REASON_KEY: Record<string, MessageKey> = {
  protocol_unavailable: 'limited.reason.protocol_unavailable',
  panel_unreachable: 'limited.reason.panel_unreachable',
}

export interface LimitedModeNoticeProps {
  /** Categoria fixa (FR-020) — nunca texto de erro cru. */
  reason: string
  /** Entradas descartadas por não serem identificadas (FR-021). `0` omite a linha. */
  discardedCount: number
}

export function LimitedModeNotice({ reason, discardedCount }: LimitedModeNoticeProps) {
  const t = useT()
  const reasonText = t(REASON_KEY[reason] ?? 'limited.reason.generic')

  return (
    <div className="limited-mode-notice" role="note" aria-label={t('limited.aria')}>
      <p className="limited-mode-notice-title">{t('limited.title')}</p>
      <p>{reasonText}</p>
      <p>{t('limited.stillAvailable')}</p>
      <p className="limited-mode-notice-subhead">{t('limited.leftOut')}</p>
      <ul className="limited-mode-notice-list">
        <li>{t('limited.item1')}</li>
        <li>{t('limited.item2')}</li>
        <li>{t('limited.item3')}</li>
        <li>{t('limited.item4')}</li>
      </ul>
      {discardedCount > 0 && <p>{t.plural('limited.discarded', discardedCount)}</p>}
      <p>{t('limited.resync')}</p>
    </div>
  )
}
