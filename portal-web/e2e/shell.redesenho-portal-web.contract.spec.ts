// Contrato da feature 077 (casca mobile-first: navegação, resumo da TV e ID lembrado). Travado pelo sdd-plan.
// Exige o servidor já no ar (`npm run dev`, porta 5174), como o resto da suíte.
import { expect, test, type Page } from '@playwright/test'

const displayId = 'A0:8C:FD:19:0A:8C'

async function fixture(page: Page) {
  const session = { deviceId: 'tv-fixture', csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() }
  await page.route('**/portal/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path === '/portal/v1/session' && method === 'DELETE') return route.fulfill({ status: 204 })
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId,
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 5 * 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: [], revisions: [], imports: [] }, stale: false })
    if (path.endsWith('/configurations')) return json({ configurations: [], nextAfter: null })
    if (path.endsWith('/operations')) return json({ operations: [], nextAfter: null })
    if (path.endsWith('/offer')) return json({ priceMinor: 3500, currency: 'BRL', termMonths: 12, deviceCount: 1, renewal: 'manual', checkoutEnabled: true })
    if (path.endsWith('/backup')) return json({ exists: false })
    return route.fulfill({ status: 404, json: { code: 'not_found' } })
  })
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('US1-AC1..AC5/FR-001/FR-002/FR-003/FR-015/FR-016/SC-006/SC-007: três destinos (barra inferior no celular, lateral no PC), resumo da TV, sem Revendedores/Recarregar e ID lembrado na volta', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar' }).click()

  // Três destinos, nessa ordem, Listas primeiro e atual.
  const nav = page.getByRole('navigation', { name: 'Principal' })
  const items = nav.locator('a, button')
  await expect(items).toHaveText(['Listas', 'Licença', 'Ajustes'])
  await expect(items.first()).toHaveAttribute('aria-current', 'page')
  // Resumo fixo da TV: ID e licença à vista, com texto (não só cor).
  const summary = page.getByRole('region', { name: 'Resumo da TV' })
  await expect(summary).toContainText(displayId)
  await expect(summary).toContainText('Período de teste')
  // O que não é prioridade saiu da navegação.
  await expect(page.getByText('Revendedores')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recarregar' })).toHaveCount(0)

  // Celular (360 px): barra inferior colada ao rodapé, alvos de 44 px, sem rolagem horizontal.
  const bar = (await nav.boundingBox())!
  expect(Math.abs(bar.y + bar.height - 740)).toBeLessThanOrEqual(2)
  expect(bar.width).toBeGreaterThanOrEqual(358)
  for (const box of await items.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44)
  expect(await noHorizontalScroll(page)).toBe(true)

  // PC (1280 px): menu lateral à esquerda, alto, e ainda sem rolagem horizontal.
  await page.setViewportSize({ width: 1280, height: 800 })
  const side = (await nav.boundingBox())!
  expect(side.x).toBeLessThanOrEqual(1)
  expect(side.width).toBeLessThan(320)
  expect(side.height).toBeGreaterThanOrEqual(400)
  await expect(summary).toBeVisible()
  expect(await noHorizontalScroll(page)).toBe(true)

  // Ajustes: a ordem das ações já existentes (a chave TMDB, quando existir, vem antes de Backup).
  await nav.getByText('Ajustes').click()
  const titles = ['Backup', 'Código de recuperação', 'Recuperar acesso', 'Ajuda', 'Sair']
  const rows = await page.getByRole('list', { name: 'Ajustes' }).getByRole('listitem').allTextContents()
  expect(rows.map(row => titles.find(title => row.trim().startsWith(title))).filter(Boolean)).toEqual(titles)

  // Sair e voltar sem QR: o último ID vem preenchido (formato do campo) e a chave nunca.
  await page.getByRole('list', { name: 'Ajustes' }).getByRole('button', { name: /^Sair/ }).click()
  const id = page.getByLabel('Endereço MAC da TV', { exact: true })
  await expect(id).toHaveValue('A0-8C-FD-19-0A-8C')
  const key = page.getByLabel('Chave do dispositivo', { exact: true })
  await expect(key).toHaveValue('')
  await expect(key).toBeFocused()
  await page.getByRole('button', { name: 'Usar outra TV' }).click()
  await expect(id).toHaveValue('')
})
