import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n'
import type { Destination } from './navigation'

// Ícones de traço simples, como o `EyeIcon`: SVG inline, `aria-hidden`, sem biblioteca (D-013).
const icons: Record<Destination, ReactNode> = {
  lists: <><path d="M4 6h16M4 12h10M4 18h7" /><path d="M18 15v6M15 18h6" /></>,
  license: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
}
const items: { destination: Destination; label: 'navLists' | 'navLicense' | 'navSettings' }[] = [
  { destination: 'lists', label: 'navLists' }, { destination: 'license', label: 'navLicense' }, { destination: 'settings', label: 'navSettings' },
]

/**
 * Navegação principal (feature 077, D-001): UM `<nav aria-label="Principal">`; abaixo de 960 px é a barra inferior e a
 * partir daí o menu lateral — só o CSS (`styles/shell.css`) muda. O destino atual leva `aria-current="page"`.
 */
export function NavBar({ current, onSelect }: { current: Destination; onSelect: (destination: Destination) => void }) {
  const t = useT()
  return <nav className="portal-nav" aria-label={t('navMain')}>
    <div className="portal-nav-brand brand" aria-hidden="true"><span className="brand-mark"><span /></span><span className="brand-wordmark">CCPlayTV</span></div>
    <ul className="portal-nav-list">
      {items.map(item => <li key={item.destination}>
        <button type="button" className="portal-nav-item" aria-current={current === item.destination ? 'page' : undefined} onClick={() => onSelect(item.destination)}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="portal-nav-icon">{icons[item.destination]}</svg>
          <span>{t(item.label)}</span>
        </button>
      </li>)}
    </ul>
  </nav>
}
