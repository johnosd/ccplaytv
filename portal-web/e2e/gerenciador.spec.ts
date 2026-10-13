import { expect, test } from '@playwright/test'

test('entra por ID e chave, mostra o cabeçalho e oferece gestão e pagamento', async ({ page }) => {
  const session = { deviceId: 'tv-fixture', csrfToken: 'csrf-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  const source = { id: 'source-existing', type: 'provider_credentials', displayName: 'Lista existente' }
  await page.route('**/portal/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/configurations/source-existing/values')) return json({ type: source.type, displayName: source.displayName,
      providerDns: 'https://provider.invalid', providerUsername: 'fixture-user', providerPassword: 'fixture-password' })
    if (path.endsWith('/configurations')) return json({ configurations: [{ sourceId: source.id, type: source.type,
      displayName: source.displayName, configVersion: 'version', appliedRevision: 1, expectedRevision: 1, operationId: null }], nextAfter: null })
    if (path.endsWith('/operations') && route.request().method() === 'GET') return json({ operations: [], nextAfter: null })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: [source], revisions: [{ sourceId: source.id, revision: 1 }], imports: [] }, stale: false })
    if (path.endsWith('/offer')) return json({ priceMinor: 3500, currency: 'BRL', termMonths: 12, deviceCount: 1, renewal: 'manual', checkoutEnabled: false })
    return json({ code: 'not_found' }, 404)
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recuperar acesso à TV', exact: true })).toHaveCount(0)
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Dispositivo e licença' })).toBeVisible()
  await expect(page.getByText('A0:8C:FD:19:0A:8C', { exact: true })).toBeVisible()
  await expect(page.getByText('Período de teste', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recuperar acesso à TV', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ativar por pagamento' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remover lista', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ativar por pagamento' }).click()
  await expect(page.getByRole('heading', { name: 'Ative sua TV por 12 meses' })).toBeVisible()
})
