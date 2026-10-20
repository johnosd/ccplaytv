import { expect, test, type Page } from '@playwright/test'
// Feature 077/US3: Licença é um cartão com preço, validade e um botão; o rótulo é "Comprar licença" no teste e "Renovar licença"
// com licença paga; o aceite é a frase com o ID da TV (sem caixa de seleção).
const CSRF = 'c'.repeat(42) + 'A'
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name, exact: true })
/** Força uma leitura do portal (a mesma que o intervalo de 10 s faz) sem esperar o relógio. */
const refresh = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
async function fixture(page: Page, options: { loseFirst?: boolean; enabled?: boolean; pendingPix?: boolean; pendingCheckout?: boolean; open?: boolean } = {}) {
  const { loseFirst = false, enabled = true, pendingPix = false, pendingCheckout = false, open = true } = options
  const requests: { id?: string; body: unknown }[] = []
  let status = 'pending'
  const pendingOrder = pendingPix ? { orderId: 'order-fixture', method: 'pix', expiresAt: new Date(Date.now() + 25 * 60000).toISOString() }
    : pendingCheckout ? { orderId: 'order-fixture', method: 'checkout', expiresAt: null } : null
  const session = { deviceId: 'tv-license-fixture', csrfToken: CSRF, expiresAt: new Date(Date.now() + 3600000).toISOString() }
  const order = () => ({ orderId: 'order-fixture', deviceId: session.deviceId, status, checkoutUrl: status === 'pending' ? 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture' : null })
  // Contexto (não só a aba): a volta do Mercado Pago pode abrir numa aba nova (081/T047).
  await page.context().route('**/portal/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, json: value })
    if (path.endsWith('/sessions/exchange')) return json(session)
    if (path.endsWith('/configurations')) return json({ configurations: [], nextAfter: null })
    if (path.endsWith('/operations')) return json({ operations: [], nextAfter: null })
    if (path.endsWith('/snapshot')) return json({ snapshot: null, stale: true })
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C', license: { state: status === 'approved' ? 'active' : 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() },
      pendingOrder: status === 'approved' ? null : pendingOrder })
    if (path.endsWith('/offer')) return json({ priceMinor: 3500, currency: 'BRL', termMonths: 12, deviceCount: 1, renewal: 'manual', checkoutEnabled: enabled })
    if (path.endsWith('/orders')) {
      requests.push({ id: request.headers()['idempotency-key'], body: request.postDataJSON() })
      if (loseFirst && requests.length === 1) return route.abort('failed')
      return json(order(), 202)
    }
    if (path.endsWith('/orders/order-fixture')) return json(order())
    return json({}, 404)
  })
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  if (open) {
    await nav(page, 'Licença').click()
    await expect(page.getByText('R$ 35,00', { exact: false })).toBeVisible()
  }
  return { requests, approve: () => { status = 'approved' } }
}
test('um botão e a frase com o ID da TV; retry mantém o pedido e pendente não permite recompra; retorno não concede', async ({ page }) => {
  const state = await fixture(page, { loseFirst: true })
  const buy = page.getByRole('button', { name: 'Comprar licença', exact: true })
  await expect(page.getByText('A licença será ativada na TV A0:8C:FD:19:0A:8C.', { exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(buy).toBeEnabled()
  await buy.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await buy.click()
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  expect(state.requests).toHaveLength(2)
  expect(state.requests[0].id).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(state.requests[0].id).toBe(state.requests[1].id)
  expect(state.requests[0].body).toEqual({})
  await expect(buy).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toHaveAttribute('href', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture')
  // O retorno do checkout só muda a URL; estado continua vindo do serviço.
  await page.evaluate(() => history.replaceState(null, '', '/?checkout=return'))
  await refresh(page)
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  state.approve()
  await refresh(page)
  await expect(page.getByText(/^Pagamento confirmado\. Na TV, aperte Atualizar/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Renovar licença', exact: true })).toBeVisible()
})
// 081/FR-009: antes de pagar aparecem quem vende, o contato e a regra de reembolso; o FAQ explica o pedido de reembolso.
test('Licença mostra vendedor, contato e reembolso de 7 dias e a Ajuda tem a pergunta de reembolso', async ({ page }) => {
  await fixture(page, { open: false })
  await nav(page, 'Licença').click()
  await expect(page.getByText(/Vendido por CCPlayTV · ccplaytv@gmail\.com\. Reembolso em até 7 dias/)).toBeVisible()
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Ajuda/ }).click()
  await page.getByRole('searchbox').fill('reembolso')
  await expect(page.getByText('Quem vende e como peço reembolso?')).toBeVisible()
})
// SC-003: de qualquer tela, comprar leva dois toques — Licença e o botão.
test('comprar leva dois toques: Licença e o botão', async ({ page }) => {
  const state = await fixture(page, { open: false })
  await nav(page, 'Licença').click()
  await page.getByRole('button', { name: 'Comprar licença', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toBeVisible()
  expect(state.requests).toHaveLength(1)
})
// O Checkout Pro devolve para /?checkout=return com a página recarregada; a sessão da aba é retomada e Licença abre com o
// pedido, sem pedir login de novo.
test('volta do Mercado Pago retoma a sessão em Licença e mostra o pagamento confirmado', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('button', { name: 'Comprar licença', exact: true }).click()
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  state.approve()
  await page.goto('/?checkout=return')
  await expect(page.getByText(/^Pagamento confirmado\. Na TV, aperte Atualizar/)).toBeVisible()
  await expect(nav(page, 'Licença')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Renovar licença', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toHaveCount(0)
  expect(new URL(page.url()).search).toBe('')
  expect(state.requests).toHaveLength(1)
})
// 081/T047: no celular o Mercado Pago abre no app/aba dele e a volta (paga ou cancelada) cai numa ABA NOVA — a sessão do
// navegador é retomada e Licença abre, sem pedir login de novo.
test('volta do Mercado Pago numa aba nova retoma a sessão e abre Licença', async ({ page, context }) => {
  await fixture(page)
  await page.getByRole('button', { name: 'Comprar licença', exact: true }).click()
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  const back = await context.newPage()
  await back.goto('/?checkout=return&collection_status=null&status=null')
  await expect(nav(back, 'Licença')).toHaveAttribute('aria-current', 'page')
  await expect(back.getByRole('heading', { name: 'Conectar à TV' })).toHaveCount(0)
  await expect(back.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  await expect(back.getByRole('link', { name: 'Continuar no Mercado Pago' })).toBeVisible()
  expect(new URL(back.url()).search).toBe('')
})
// 081/T047: compra iniciada em outro aparelho (ou cancelada) continua de qualquer celular, sem cobrança nova.
test('compra iniciada e não paga continua de outro aparelho pelo mesmo pedido', async ({ page }) => {
  const state = await fixture(page, { pendingCheckout: true })
  await expect(page.getByText(/compra desta TV iniciada no Mercado Pago e ainda não paga\. Toque no botão abaixo/)).toBeVisible()
  await page.getByRole('button', { name: 'Comprar licença', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toBeVisible()
  expect(state.requests).toHaveLength(1)
})
test('compra pendente sobrevive reload e nova sessão da mesma TV sem segundo POST', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('button', { name: 'Comprar licença', exact: true }).click()
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await nav(page, 'Licença').click()
  await expect(page.getByText('Aguardando pagamento', { exact: true })).toBeVisible()
  expect(state.requests).toHaveLength(1)
})
// 073/US2/AC1, AC3, FR-009, FR-010: Pix gerado pela TV aparece como aviso, sem cobrança nova; com licença paga o botão vira Renovar.
test('Pix pendente da TV vira aviso sem nova cobrança e o botão passa a Renovar licença com licença paga', async ({ page }) => {
  const state = await fixture(page, { pendingPix: true })
  await expect(page.getByRole('status').filter({ hasText: 'Há um Pix gerado pela TV aguardando pagamento até' })).toBeVisible()
  await expect(page.getByText('000201', { exact: false })).toHaveCount(0)
  expect(state.requests).toHaveLength(0)
  state.approve()
  await refresh(page)
  await expect(page.getByRole('button', { name: 'Renovar licença', exact: true })).toBeVisible()
  await expect(page.getByText('Há um Pix gerado pela TV', { exact: false })).toHaveCount(0)
})
test('venda desabilitada mantém a oferta, explica o motivo e bloqueia o checkout', async ({ page }) => {
  const state = await fixture(page, { enabled: false })
  await expect(page.getByText('Compras ainda não estão disponíveis.')).toBeVisible()
  const buy = page.getByRole('button', { name: 'Comprar licença', exact: true })
  await expect(buy).toHaveAttribute('aria-disabled', 'true')
  await buy.click({ force: true })
  expect(state.requests).toHaveLength(0)
})

// 073/US3, FR-011: código de recuperação só por ação explícita (POST + CSRF), com aviso; 409 orienta Atualizar na TV.
// Na 077 ele mora em Ajustes → Código de recuperação, não mais em Licença.
test('código de recuperação (em Ajustes) aparece só ao pedir, com aviso, some ao ocultar e orienta a TV quando ainda não foi enviado', async ({ page }) => {
  await fixture(page, { open: false })
  await expect(page.getByText('Código de recuperação', { exact: false })).toHaveCount(0)
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Código de recuperação/ }).click()
  const code = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV'
  let escrowed = false
  const calls: { method: string; csrf?: string; url: string }[] = []
  await page.route('**/portal/v1/session/recovery-code', route => {
    const request = route.request()
    calls.push({ method: request.method(), csrf: request.headers()['x-csrf-token'], url: request.url() })
    return escrowed ? route.fulfill({ json: { recoveryCode: code, recoveryCodeVersion: 2 }, headers: { 'Cache-Control': 'no-store' } })
      : route.fulfill({ status: 409, json: { code: 'not_escrowed', retryable: false } })
  })
  await expect(page.getByText(code)).toHaveCount(0)
  expect(calls).toHaveLength(0)
  const show = page.getByRole('button', { name: 'Mostrar código de recuperação' })
  await show.click()
  await expect(page.getByRole('alert').filter({ hasText: 'A TV ainda não enviou o código atual' })).toBeVisible()
  escrowed = true
  await show.click()
  await expect(page.getByText(code, { exact: true })).toBeVisible()
  await expect(page.getByText('É uma credencial privada', { exact: false })).toBeVisible()
  expect(calls.every(call => call.method === 'POST' && call.csrf === CSRF && !call.url.includes(code))).toBe(true)
  expect(page.url()).not.toContain(code)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(code)
  await page.getByRole('button', { name: 'Ocultar código' }).click()
  await expect(page.getByText(code)).toHaveCount(0)
})
