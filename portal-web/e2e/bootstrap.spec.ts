import { expect, test, type Page } from '@playwright/test'

const displayId = 'A0:8C:FD:19:0A:8C'

async function fixture(page: Page) {
  const session = { deviceId: 'tv-fixture', csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() }
  await page.route('**/portal/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path === '/portal/v1/session' && route.request().method() === 'DELETE') return route.fulfill({ status: 204 })
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId,
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/snapshot')) return json({ snapshot: null, stale: true })
    if (path.endsWith('/configurations')) return json({ configurations: [], nextAfter: null })
    if (path.endsWith('/operations')) return json({ operations: [], nextAfter: null })
    return route.fulfill({ status: 404, json: { code: 'not_found' } })
  })
}

test('bootstrap acessível mantém o login enxuto e sem ações autenticadas; o foco já começa no ID', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.portal-header').getByText('CCPlayTV', { exact: true })).toBeVisible()
  await expect(page.locator('input')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Conectar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recuperar acesso à TV', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Usar outra TV' })).toHaveCount(0)
  // Sem ID lembrado, o foco já está no ID; Tab leva à chave.
  await expect(page.getByLabel('Endereço MAC da TV', { exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Chave do dispositivo', { exact: true })).toBeFocused()
})

test('US1-AC3: entrar pelo QR (ID e chave no fragmento) também lembra o ID; a chave nunca fica guardada', async ({ page }) => {
  await fixture(page)
  await page.goto('/#id=' + displayId + '&key=0123456789')
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Principal' }).getByText('Ajustes').click()
  await page.getByRole('list', { name: 'Ajustes' }).getByRole('button', { name: /^Sair/ }).click()
  await expect(page.getByLabel('Endereço MAC da TV', { exact: true })).toHaveValue('A0-8C-FD-19-0A-8C')
  await expect(page.getByLabel('Chave do dispositivo', { exact: true })).toBeFocused()
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
  expect(stored).not.toContain('0123456789')
})
