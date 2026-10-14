import { useId, useState } from 'react'
import { useT } from '../lib/i18n'
import { faqContent, type FaqAction, type FaqCategory } from '../lib/i18n/faq'

// Ignora maiúsculas e acentos: "licenca" encontra "Licença".
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function FaqPage({ onAction }: { onAction: (action: FaqAction) => void }) {
  const t = useT()
  const faq = faqContent()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FaqCategory | 'all'>('all')
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const items = faq.items.filter(item => (category === 'all' || item.category === category) &&
    terms.every(term => normalize(item.question + ' ' + item.answer.join(' ')).includes(term)))
  const categories = Object.keys(faq.categories) as FaqCategory[]
  return <section className="license-page faq-page" aria-labelledby="faq-title">
    <header className="license-hero faq-hero">
      <p className="eyebrow">{t('title')} / FAQ</p>
      <h2 id="faq-title">{faq.title}</h2>
      <p>{faq.intro}</p>
      <div className="faq-search" role="search">
        <label htmlFor={searchId} className="visually-hidden">{faq.search}</label>
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
        <input id={searchId} type="search" value={query} placeholder={faq.search} autoComplete="off" onChange={event => setQuery(event.target.value)} />
      </div>
    </header>
    <div className="faq-filters" role="group" aria-label={faq.search}>
      {(['all', ...categories] as const).map(value => <button key={value} className="small" aria-pressed={category === value} onClick={() => setCategory(value)}>
        {value === 'all' ? faq.all : faq.categories[value]}
        <span className="faq-filter-count" aria-hidden="true">{faq.items.filter(item => value === 'all' || item.category === value).length}</span>
      </button>)}
    </div>
    <p className="library-meta" role="status">{faq.results(items.length)}</p>
    {items.length === 0 ? <div className="source-list-empty faq-empty">
      <p>{faq.empty}</p>
      <button className="primary" onClick={() => { setQuery(''); setCategory('all') }}>{faq.clear}</button>
    </div> : <div className="faq-groups">
      {categories.filter(value => items.some(item => item.category === value)).map(value => <section key={value} className="faq-group" aria-labelledby={'faq-group-' + value}>
        <h3 id={'faq-group-' + value} className="eyebrow">{faq.categories[value]}</h3>
        <div className="faq-list">
          {items.filter(item => item.category === value).map(item => <details key={item.id} className="faq-item" open={terms.length > 0 || undefined}>
            <summary>{item.question}</summary>
            <div className="faq-answer">
              {item.answer.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {item.action && <button className="small faq-action" onClick={() => onAction(item.action!)}>{faq.actions[item.action]}<span aria-hidden="true">→</span></button>}
            </div>
          </details>)}
        </div>
      </section>)}
    </div>}
    <aside className="panel faq-stuck" aria-labelledby="faq-stuck-title">
      <div><h3 id="faq-stuck-title">{faq.stuckTitle}</h3><p>{faq.stuckHint}</p></div>
      <div className="actions">
        {(['lists', 'activate', 'recover'] as const).map(action => <button key={action} className={'small' + (action === 'activate' ? ' primary' : '')} onClick={() => onAction(action)}>{faq.actions[action]}</button>)}
      </div>
    </aside>
  </section>
}
