import { expect, test, type Page } from '@playwright/test'
async function fixture(page: Page, loseFirst = false, enabled = true) {
  const requests: { id?: string; body: unknown }[] = []
  let status = 'pending'
  const session = { deviceId: 'tv-license-fixture', csrfToken: 'csrf-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  const order = () => ({ orderId: 'order-fixture', deviceId: session.deviceId, status, checkoutUrl: status === 'pending' ? 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture' : null })
  await page.route('**/portal/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, json: value })
    if (path.endsWith('/sessions/exchange')) return json(session)
    if (path.endsWith('/configurations')) return json({ configurations: [], nextAfter: null })
    if (path.endsWith('/operations')) return json({ operations: [], nextAfter: null })
    if (path.endsWith('/snapshot')) return json({ snapshot: null, stale: true })
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, license: { state: status === 'approved' ? 'active' : 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
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
  await page.getByRole('button', { name: 'Licença anual', exact: true }).click()
  await expect(page.getByText('R$ 35 por 12 meses', { exact: false })).toBeVisible()
  return { requests, approve: () => { status = 'approved' } }
}
test('confirma TV, retry mantém pedido e pendente não permite recompra; retorno não concede', async ({ page }) => {
  const state = await fixture(page, true)
  const buy = page.getByRole('button', { name: 'Comprar ou renovar licença' })
  await expect(buy).toBeDisabled()
  await page.getByLabel('Conferi o ID da TV').check()
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
  await expect(page.getByText('Pagamento confirmado', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar no Mercado Pago' })).toHaveCount(0)
  await expect(buy).toBeVisible()
  await expect(buy).toBeDisabled()
})
test('compra pendente sobrevive reload e nova sessão da mesma TV sem segundo POST', async ({ page }) => {
  const state = await fixture(page)
  await page.getByLabel('Conferi o ID da TV').check()
  await page.getByRole('button', { name: 'Comprar ou renovar licença' }).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await page.getByRole('button', { name: 'Licença anual', exact: true }).click()
  await expect(page.getByText('Pagamento pendente', { exact: true })).toBeVisible()
  expect(state.requests).toHaveLength(1)
})
test('venda desabilitada mantém oferta e bloqueia checkout', async ({ page }) => {
  const state = await fixture(page, false, false)
  await page.getByLabel('Conferi o ID da TV').check()
  await expect(page.getByRole('button', { name: 'Comprar ou renovar licença' })).toBeDisabled()
  expect(state.requests).toHaveLength(0)
})
