import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { readStorageEstimate, type StorageEstimate } from '../../lib/catalog/storageRelief'

/** "1,2 GB" / "850 MB" no idioma da tela; só leitura (bug armazenamento-app-cheio-na-tv-impede). */
function formatBytes(value: number, locale: string) {
  const gb = value / 1024 ** 3
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return gb >= 1 ? number.format(gb) + ' GB' : number.format(value / 1024 ** 2) + ' MB'
}

export interface AboutPanelProps {
  focused: boolean
}

/**
 * Sobre & créditos (feature 026, US2 — FR-030): nome e versão reais do
 * app (`__APP_VERSION__`, D-012 do plan.md) e as licenças das fontes
 * embarcadas. Sem atribuição de serviço que o app não usa (nunca TMDB
 * enquanto o app não consumir a API de verdade).
 */
export function AboutPanel({ focused }: AboutPanelProps): ReactNode {
  const t = useT()
  // Uso do armazenamento do app (IndexedDB etc.), lido uma vez ao abrir: ajuda a entender o aviso de espaço cheio.
  const [storage, setStorage] = useState<StorageEstimate | null>()
  useEffect(() => {
    let alive = true
    void readStorageEstimate().then((value) => { if (alive) setStorage(value ?? null) })
    return () => { alive = false }
  }, [])
  const locale = useLanguage()
  return (
    <div className="about-panel">
      <div className={`about-panel-version no-scale${focused ? ' tv-focus' : ''}`}>
        <span className="about-panel-name">CCPlayTV</span>
        <span className="about-panel-value">{t('settings.about.version', { version: __APP_VERSION__ })}</span>
      </div>
      {storage !== undefined && <p className="about-panel-storage">{storage
        ? t('settings.about.storage', { used: formatBytes(storage.usage, locale), quota: formatBytes(storage.quota, locale) })
        : t('settings.about.storageUnknown')}</p>}
      <div className="about-panel-licenses">
        <p className="about-panel-licenses-title">{t('settings.about.fontLicenses')}</p>
        <p>Poppins — SIL Open Font License 1.1</p>
        <p>Inter — SIL Open Font License 1.1</p>
      </div>
    </div>
  )
}
