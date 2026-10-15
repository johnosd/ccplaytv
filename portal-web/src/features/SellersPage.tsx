import { useT } from '../lib/i18n'

// Prévia "Em breve" do programa de revendedores: estrutura desabilitada, sem pacotes,
// preços ou contas fictícios. Nada aqui envia dados ou chama a API.
export function SellersPage() {
  const t = useT()
  return <section className="license-page sellers-page" aria-labelledby="sellers-title">
    <header className="license-hero">
      <p className="eyebrow">{t('title')} / {t('sellers')}</p>
      <h2 id="sellers-title">{t('sellersTitle')}</h2>
      <p>{t('sellersIntro')}</p>
      <span className="status-badge is-warning soon-badge">{t('comingSoon')}</span>
    </header>
    <div className="license-layout">
      <div className="sellers-steps">
        <section className="panel sellers-step" aria-labelledby="sellers-step-1">
          <p className="step-index" aria-hidden="true">1</p>
          <div><h3 id="sellers-step-1">{t('sellersStepPack')}</h3><p>{t('sellersStepPackHint')}</p></div>
        </section>
        <section className="panel sellers-step" aria-labelledby="sellers-step-2">
          <p className="step-index" aria-hidden="true">2</p>
          <div>
            <h3 id="sellers-step-2">{t('sellersStepAccount')}</h3>
            <fieldset disabled className="form-grid sellers-form">
              <label className="span-2">{t('email')}<input type="email" autoComplete="off" /></label>
              <label className="span-2">{t('sellersName')}<input autoComplete="off" /></label>
              <label>{t('passwordLabel')}<input type="password" autoComplete="off" /></label>
              <label>{t('confirmPassword')}<input type="password" autoComplete="off" /></label>
            </fieldset>
          </div>
        </section>
        <section className="panel sellers-step" aria-labelledby="sellers-step-3">
          <p className="step-index" aria-hidden="true">3</p>
          <div>
            <h3 id="sellers-step-3">{t('sellersStepPayment')}</h3>
            <p>{t('sellersStepPaymentHint')}</p>
            <div className="license-cta"><button className="primary large" disabled>{t('comingSoon')}</button></div>
          </div>
        </section>
      </div>
      <aside className="panel license-summary" aria-labelledby="sellers-how">
        <p className="eyebrow" id="sellers-how">{t('sellersHow')}</p>
        <ul className="info-list">
          <li>{t('sellersHowCredits')}</li>
          <li>{t('sellersHowActivate')}</li>
          <li>{t('sellersHowDashboard')}</li>
        </ul>
        <p className="eyebrow">{t('sellersPolicy')}</p>
        <p className="sellers-policy">{t('sellersPolicyText')}</p>
      </aside>
    </div>
  </section>
}
