import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PortalDeviceRecord } from '../../lib/portal/portalTables'
import type { AdvancedActionId } from './portalActions'
import type { useCodeReveal } from './useCodeReveal'

/** Máscara fixa: nunca derivada do comprimento do código (feature 075, D-004). */
const MASK = '•••• •••• ••••'

/**
 * Avançado (feature 076, US2): subtela da aba — não é `Modal` — com os quatro itens raros. Cada um mostra, sempre
 * visível e antes de qualquer ação, para que serve e quando usar (FR-006). O código de recuperação só aparece aqui,
 * oculto por padrão, e só por SELECT no olho (ADR-019). Estrutura de DOM fixada em `logic/avancado-foco.md` §4.
 */
export function PortalAdvanced({ device, available, reveal, focusedId, onSelect }: {
  device?: PortalDeviceRecord
  /** Itens que dependem de conexão/vínculo; indisponível fica soft-disabled com o motivo visível (FR-013). */
  available: { rotate: boolean; recover: boolean; unlink: boolean }
  reveal: ReturnType<typeof useCodeReveal>
  /** `undefined` com uma confirmação aberta ou sem o foco no painel. */
  focusedId?: AdvancedActionId
  onSelect: (id: AdvancedActionId) => void
}): ReactNode {
  const t = useT()
  const actions = [
    { id: 'rotate', title: t('portal.rotateAll'), text: t('portal.advanced.rotateText'), ready: available.rotate, variant: 'accent' },
    { id: 'recover', title: t('portal.recover'), text: t('portal.advanced.recoverText'), ready: available.recover, variant: 'secondary' },
    { id: 'unlink', title: t('portal.unlink'), text: t('portal.advanced.unlinkText'), ready: available.unlink, variant: 'secondary' },
  ] as const
  return <section className="portal-advanced" aria-label={t('portal.advanced')}>
    <h2>{t('portal.advanced')}</h2>
    <p className="portal-advanced-text">{t('portal.advanced.intro')}</p>
    <section className="portal-advanced-item">
      <h3>{t('portal.codeLabel')}</h3>
      <p className="portal-advanced-text">{t('portal.advanced.codeText')}</p>
      <p className="portal-field-value">{reveal.revealed && device ? device.recoveryCode : MASK}</p>
      {!device && <p className="portal-advanced-reason">{t('portal.advanced.needsPairing')}</p>}
      <div className="portal-card-actions">
        <Button variant="secondary" icon={reveal.revealed ? 'eyeOff' : 'eye'} focused={focusedId === 'eye'} softDisabled={!device}
          onSelect={() => onSelect('eye')}>{t(reveal.revealed ? 'portal.hideCode' : 'portal.showCode')}</Button>
      </div>
    </section>
    {actions.map(action => <section key={action.id} className="portal-advanced-item">
      <h3>{action.title}</h3>
      <p className="portal-advanced-text">{action.text}</p>
      {!action.ready && <p className="portal-advanced-reason">{t('portal.advanced.needsPairing')}</p>}
      <div className="portal-card-actions">
        <Button variant={action.variant} focused={focusedId === action.id} softDisabled={!action.ready}
          onSelect={() => onSelect(action.id)}>{action.title}</Button>
      </div>
    </section>)}
  </section>
}
