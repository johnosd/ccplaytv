// Contrato da feature 077 (Listas: cartões com estado, ações só quando precisam, adicionar e excluir). Travado pelo sdd-plan.
// Exige o servidor já no ar (`npm run dev`, porta 5174), como o resto da suíte.
import { expect, test, type Page } from '@playwright/test'

async function fixture(page: Page) {
  const sources = [
    { id: 'lista-a', type: 'm3u_url', displayName: 'Lista A' },
    { id: 'lista-b', type: 'm3u_url', displayName: 'Lista B' },
    { id: 'lista-c', type: 'provider_credentials', displayName: 'Lista C' },
  ]
  const configurations: Record<string, unknown>[] = sources.map(source => ({ sourceId: source.id, type: source.type,
    displayName: source.displayName, configVersion: 'v-' + source.id, appliedRevision: source.id === 'lista-a' ? 1 : null,
    expectedRevision: 0, operationId: source.id === 'lista-b' ? 'op-b' : null }))
  const operations: Record<string, unknown>[] = [
    { operationId: 'op-b', sourceId: 'lista-b', action: 'source.create', state: 'pending', expectedRevision: 0, importState: null, receipt: null, createdAt: new Date().toISOString() },
    { operationId: 'op-c', sourceId: 'lista-c', action: 'source.update', state: 'expired', expectedRevision: 0, importState: null, receipt: null, createdAt: new Date().toISOString() },
  ]
  const posted: Record<string, any>[] = []
  const session = { deviceId: 'tv-fixture', csrfToken: 'c'.repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() }
  await page.route('**/portal/v1/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 5 * 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: [sources[0]],
      revisions: [{ sourceId: 'lista-a', revision: 1 }], imports: [] }, stale: false })
    if (path.endsWith('/configurations')) return json({ configurations, nextAfter: null })
    if (path.endsWith('/operations') && request.method() === 'GET') return json({ operations, nextAfter: null })
    if (path.endsWith('/operations') && request.method() === 'POST') {
      const body = request.postDataJSON()
      posted.push(body)
      const id = request.headers()['idempotency-key']
      operations.push({ operationId: id, sourceId: body.sourceId, action: body.action, state: 'pending', expectedRevision: body.expectedRevision,
        importState: null, receipt: null, createdAt: new Date().toISOString() })
      if (body.action === 'source.create') configurations.push({ sourceId: body.sourceId, type: body.input.type, displayName: body.input.displayName,
        configVersion: 'v-new', appliedRevision: null, expectedRevision: 0, operationId: id })
      return json({ operationId: id, sourceId: body.sourceId, state: 'pending', serviceState: 'pending', deviceState: 'pending' }, 202)
    }
    return json({ code: 'not_found' }, 404)
  })
  return posted
}

test('US2-AC1..AC6/FR-005/FR-006/FR-007/SC-001: cartões com estado, Reenviar/Cancelar só quando preciso, adicionar com o próximo passo na TV e excluir com confirmação', async ({ page }) => {
  const posted = await fixture(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('A0-8C-FD-19-0A-8C')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar' }).click()

  await expect(page.getByRole('button', { name: 'Adicionar lista' })).toBeVisible()
  const card = (name: string) => page.getByRole('article', { name })
  // Lista aplicada: "Na TV", só Editar e Excluir.
  await expect(card('Lista A')).toContainText('Na TV')
  await expect(card('Lista A').getByRole('button', { name: 'Editar' })).toBeVisible()
  await expect(card('Lista A').getByRole('button', { name: 'Excluir' })).toBeVisible()
  await expect(card('Lista A').getByRole('button', { name: /Reenviar|Cancelar envio/ })).toHaveCount(0)
  // Envio pendente: "Aguardando a TV" e só Cancelar envio.
  await expect(card('Lista B')).toContainText('Aguardando a TV')
  await expect(card('Lista B').getByRole('button', { name: 'Cancelar envio' })).toBeVisible()
  await expect(card('Lista B').getByRole('button', { name: 'Reenviar' })).toHaveCount(0)
  // Operação com problema: "Erro" e só Reenviar.
  await expect(card('Lista C')).toContainText('Erro')
  await expect(card('Lista C').getByRole('button', { name: 'Reenviar' })).toBeVisible()
  await expect(card('Lista C').getByRole('button', { name: 'Cancelar envio' })).toHaveCount(0)

  // Adicionar: formulário em uma coluna, envio e o próximo passo na TV.
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.getByLabel('Nome da lista').fill('Lista nova')
  await page.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await page.getByLabel('URL da lista M3U', { exact: true }).fill('https://provider.invalid/lista.m3u')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  expect(posted.at(-1)).toMatchObject({ action: 'source.create', input: { type: 'm3u_url', displayName: 'Lista nova' } })
  await expect(page.getByRole('status').filter({ hasText: 'na TV, aperte Atualizar' })).toBeVisible()
  await expect(card('Lista nova')).toContainText('Aguardando a TV')

  // Excluir: cancelar não muda nada; confirmar envia a exclusão e o cartão passa a aguardar a TV.
  await card('Lista A').getByRole('button', { name: 'Excluir' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(posted.filter(body => body.action === 'source.delete')).toHaveLength(0)
  await card('Lista A').getByRole('button', { name: 'Excluir' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sim, excluir' }).click()
  expect(posted.at(-1)).toMatchObject({ action: 'source.delete', sourceId: 'lista-a' })
  await expect(card('Lista A')).toContainText('Aguardando a TV')
})
