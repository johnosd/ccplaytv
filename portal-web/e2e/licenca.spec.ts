import { expect, test, type Page } from '@playwright/test'
// 073/D-007: a aba de compra é "Comprar licença" no teste e "Renovar licença" com licença paga.
const CSRF = 'c'.repeat(42) + 'A'
const purchaseTab = (page: Page, name = 'Comprar licença') => page.getByRole('navigation').getByRole('button', { name, exact: true })
async function fixture(page: Page, loseFirst = false, enabled = true, pendingPix = false) {
  const requests: { id?: string; body: unknown }[] = []
  let status = 'pending'
  const pendingOrder = pendingPix ? { orderId: 'order-fixture', method: 'pix', expiresAt: new Date(Date.now() + 25 * 60000).toISOString() } : null
  const session = { deviceId: 'tv-license-fixture', csrfToken: CSRF, expiresAt: new Date(Date.now() + 3600000).toISOString() }
  const order = () => ({ orderId: 'order-fixture', deviceId: session.deviceId, status, checkoutUrl: status === 'pending' ? 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture' : null })
  await page.route('**/portal/v1/**', async route => {
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
  await expect(page.getByRole('heading', { name: 'Suas listas' })).toBeVisible()
  await purchaseTab(page).click()
  await expect(page.getByText('R$ 35 por 12 meses', { exact: false })).toBeVisible()
  return { requests, approve: () => { status = 'approved' } }
}
test('confirma TV, retry mantém pedido e pendente não permite recompra; retorno não concede', async ({ page }) => {
  const state = await fixture(page, true)
  const buy = page.getByRole('button', { name: 'Comprar ou renovar licença' })
  await expect(buy).toBeDisabled()
  await page.getByLabel('Conferi o endereço MAC da TV').check()
  await buy.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await buy.click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  expect(state.requests).toHaveLength(2)
  expect(state.requests[0].id).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(state.requests[0].id).toBe(state.requests[1].id)
  expect(state.requests[0].body).toEqual({})
  await expect(buy).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toHaveAttribute('href', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture')
  // O retorno do checkout só muda a URL; estado continua vindo do serviço.
  await page.evaluate(() => history.replaceState(null, '', '/?checkout=return'))
  await page.getByRole('button', { name: 'Atualizar estado' }).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  state.approve()
  await page.getByRole('button', { name: 'Atualizar estado' }).click()
  await expect(page.getByText(/^Pagamento confirmado\. Na TV, aperte Atualizar/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toHaveCount(0)
  await expect(buy).toBeVisible()
  await expect(buy).toBeDisabled()
})
// T034: o Checkout Pro devolve para /?checkout=return com a página recarregada; a sessão da aba é retomada e a aba de
// compra abre com o pedido, sem pedir login de novo.
test('volta do Mercado Pago retoma a sessão na aba de compra e mostra o pagamento confirmado', async ({ page }) => {
  const state = await fixture(page)
  await page.getByLabel('Conferi o endereço MAC da TV').check()
  await page.getByRole('button', { name: 'Comprar ou renovar licença' }).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  state.approve()
  await page.goto('/?checkout=return')
  await expect(page.getByText(/^Pagamento confirmado\. Na TV, aperte Atualizar/)).toBeVisible()
  await expect(purchaseTab(page, 'Renovar licença')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toHaveCount(0)
  expect(new URL(page.url()).search).toBe('')
  expect(state.requests).toHaveLength(1)
})
test('compra pendente sobrevive reload e nova sessão da mesma TV sem segundo POST', async ({ page }) => {
  const state = await fixture(page)
  await page.getByLabel('Conferi o endereço MAC da TV').check()
  await page.getByRole('button', { name: 'Comprar ou renovar licença' }).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await purchaseTab(page).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  expect(state.requests).toHaveLength(1)
})
// 073/US2/AC1, AC3, FR-009, FR-010: Pix gerado pela TV aparece como aviso, sem cobrança nova; com licença paga a aba vira Renovar.
test('Pix pendente da TV vira aviso sem nova cobrança e a aba passa a Renovar licença com licença paga', async ({ page }) => {
  const state = await fixture(page, false, true, true)
  await expect(page.getByRole('status').filter({ hasText: 'Há um Pix gerado pela TV aguardando pagamento até' })).toBeVisible()
  await expect(page.getByText('000201', { exact: false })).toHaveCount(0)
  expect(state.requests).toHaveLength(0)
  state.approve()
  await page.getByRole('button', { name: 'Atualizar estado' }).click()
  await expect(purchaseTab(page, 'Renovar licença')).toBeVisible()
  await expect(page.getByText('Há um Pix gerado pela TV', { exact: false })).toHaveCount(0)
})
test('venda desabilitada mantém oferta e bloqueia checkout', async ({ page }) => {
  const state = await fixture(page, false, false)
  await page.getByLabel('Conferi o endereço MAC da TV').check()
  await expect(page.getByRole('button', { name: 'Comprar ou renovar licença' })).toBeDisabled()
  expect(state.requests).toHaveLength(0)
})

// 073/US3, FR-011: código de recuperação só por ação explícita (POST + CSRF), com aviso; 409 orienta Atualizar na TV.
test('código de recuperação aparece só ao pedir, com aviso, some ao ocultar e orienta a TV quando ainda não foi enviado', async ({ page }) => {
  await fixture(page)
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
  await expect(page.getByRole('button', { name: 'Recuperar após formatar' })).toBeVisible()
})
