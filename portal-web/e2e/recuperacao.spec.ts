import { expect, test } from '@playwright/test'
test('recuperação usa sessão isolada, confirma destino e retoma mesmo pedido após resposta perdida', async ({ page }) => {
  let exchanges = 0
  const requests: { id: string | undefined; body: unknown }[] = []
  await page.route('**/portal/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/recoveries/exchange')) {
      exchanges++
      expect(await page.evaluate(() => location.hash)).toBe('')
      return route.fulfill({ json: { claimId: 'claim-fixture', deviceId: 'tv-fixture', csrfToken: 'recovery-csrf', expiresAt: new Date(Date.now() + 299000).toISOString() } })
    }
    expect(path).toBe('/portal/v1/recoveries/confirm')
    expect(route.request().headers()['x-csrf-token']).toBe('recovery-csrf')
    requests.push({ id: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() })
    if (requests.length === 1) return route.abort('failed')
    return route.fulfill({ json: { operationId: requests[0].id, state: 'ready' } })
  })
  await page.goto('/#recovery=' + 'a'.repeat(43))
  await expect(page.getByText('tv-fixture', { exact: true })).toBeVisible()
  expect(exchanges).toBe(1)
  expect(new URL(page.url()).hash).toBe('')
  const code = page.getByLabel('Código privado da licença', { exact: true })
  await code.fill('0000-0000-0000-0000-0000-0000-0000')
  await page.getByRole('button', { name: 'Confirmar recuperação', exact: true }).click()
  expect(requests).toHaveLength(0)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar recuperação', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(code).toHaveValue('')
  await expect(code).toBeDisabled()
  expect(await page.locator('body').innerText()).not.toContain('0000-0000')
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.getByText('Recuperação autorizada.', { exact: false })).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect(requests[0].id).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(requests[0].body).toEqual({ code: '0000-0000-0000-0000-0000-0000-0000', confirmedDeviceId: 'tv-fixture' })
  await expect(page.getByRole('heading', { name: 'Suas listas' })).not.toBeVisible()
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toBeVisible()
})
test('código inválido pode ser corrigido; sessão expirada não envia confirmação', async ({ page }) => {
  let calls = 0
  await page.route('**/portal/v1/**', route => {
    if (route.request().url().endsWith('/recoveries/exchange')) return route.fulfill({ json: { claimId: 'claim-fixture', deviceId: 'tv-fixture', csrfToken: 'csrf', expiresAt: new Date(Date.now() + 299000).toISOString() } })
    calls++
    return route.fulfill({ status: 422, json: { code: 'invalid_input' } })
  })
  await page.goto('/#recovery=' + 'a'.repeat(43))
  await page.getByLabel('Código privado da licença', { exact: true }).fill('invalid-fixture')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar recuperação', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Revise os campos')
  await expect(page.getByLabel('Código privado da licença', { exact: true })).toBeEnabled()
  expect(calls).toBe(1)
  await page.clock.install()
  await page.clock.fastForward(300000)
  await expect(page.getByText('Este acesso expirou.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar recuperação', exact: true })).not.toBeVisible()
  expect(calls).toBe(1)
})
