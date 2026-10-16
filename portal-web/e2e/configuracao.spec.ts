import { expect, test, type Page } from '@playwright/test'

async function fixture(page: Page, options: { stale?: boolean; loseFirst?: boolean; snapshotAbsent?: boolean } = {}) {
  const source = { id: 'source-existing', type: 'provider_credentials', displayName: 'Lista existente', connectionState: 'synced', updatedAt: 1 }
  const configurations: Record<string, unknown>[] = [{ sourceId: source.id, type: source.type, displayName: source.displayName,
    configVersion: 'version-existing', appliedRevision: 1, expectedRevision: 0, operationId: null }]
  const operations: Record<string, unknown>[] = []
  const requests: { body: Record<string, any>; id: string | undefined }[] = []
  let exchanges = 0
  const session = { deviceId: 'tv-fixture', csrfToken: 'csrf-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  const displayId = 'A0:8C:FD:19:0A:8C'
  await page.route('**/portal/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON()
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/sessions/exchange')) {
      exchanges++
      expect(await page.evaluate(() => location.hash)).toBe('')
      return json(session)
    }
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path.endsWith('/session')) return route.fulfill({ status: 204 })
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId,
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: options.snapshotAbsent ? [] : [source], revisions: options.snapshotAbsent ? [] : [{ sourceId: source.id, revision: 1 }], imports: [] }, stale: !!options.stale })
    if (path.endsWith('/configurations/source-existing/values')) return json({ type: source.type, displayName: source.displayName,
      providerDns: 'https://provider.invalid', providerUsername: 'fake-user', providerPassword: 'fake-private-password' })
    if (path.endsWith('/configurations')) return json({ configurations, nextAfter: null })
    if (path.endsWith('/operations') && request.method() === 'GET') return json({ operations, nextAfter: null })
    if (path.endsWith('/resend')) {
      requests.push({ body, id: request.headers()['idempotency-key'] })
      if (options.loseFirst && requests.length === 1) return route.abort('failed')
      return json({ operationId: request.headers()['idempotency-key'], sourceId: source.id, state: 'pending' }, 202)
    }
    if (path.endsWith('/operations') && request.method() === 'POST') {
      const id = request.headers()['idempotency-key']
      requests.push({ body, id })
      if (options.loseFirst && requests.length === 1) return route.abort('failed')
      if (body.action === 'source.delete') {
        configurations.splice(configurations.findIndex(item => item.sourceId === body.sourceId), 1)
        operations.push({ operationId: id, sourceId: body.sourceId, action: body.action, state: 'pending',
          expectedRevision: body.expectedRevision, importState: null, receipt: null, createdAt: new Date().toISOString() })
        return json({ operationId: id, sourceId: body.sourceId, state: 'pending_device', serviceState: 'deleted', deviceState: 'pending' }, 202)
      }
      const operation = { operationId: id, sourceId: body.sourceId, action: body.action, state: 'pending',
        expectedRevision: body.expectedRevision, importState: null, receipt: null, createdAt: new Date().toISOString() }
      operations.push(operation)
      if (body.action === 'source.create') configurations.push({ sourceId: body.sourceId, type: body.input.type,
        displayName: body.input.displayName, configVersion: 'version-new', appliedRevision: null, expectedRevision: 0, operationId: id })
      return json(operation, 202)
    }
    return json({ code: 'not_found' }, 404)
  })
  return { requests, exchanges: () => exchanges }
}
async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Suas listas' })).toBeVisible()
}

test('QR remove fragmento antes da rede e exchange ocorre uma vez em StrictMode', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/#invite=' + 'a'.repeat(43))
  await expect(page.getByRole('heading', { name: 'Suas listas' })).toBeVisible()
  expect(state.exchanges()).toBe(1)
  expect(new URL(page.url()).hash).toBe('')
  const stored = () => page.evaluate(() => sessionStorage.getItem('ccplay-portal-session'))
  expect(Object.keys(JSON.parse((await stored())!)).sort()).toEqual(['csrfToken', 'deviceId', 'expiresAt'])
  await page.getByRole('button', { name: 'Sair do portal' }).click()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Suas listas' })).not.toBeVisible()
  // T036: sair apaga a sessão guardada na aba; recarregar não volta ao painel.
  expect(await stored()).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toBeVisible()
})

test('manual/Xtream mantém segredo fora dos cards e aplicação separada de recebimento', async ({ page }) => {
  const state = await fixture(page, { stale: true })
  await login(page)
  await expect(page.getByText('Estado da TV desatualizado.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await page.getByLabel('Nome da lista').fill('Lista nova')
  await page.getByLabel('Servidor Xtream').fill('https://provider.invalid')
  await page.getByLabel('Usuário Xtream').fill('fake-user')
  await page.getByLabel('Senha Xtream').fill('fake-private-password')
  await page.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lista nova', exact: true })).toBeVisible()
  expect(state.requests[0].body.input.providerPassword).toBe('fake-private-password')
  expect(state.requests[0].id).toMatch(/^op-[0-9]{13}-[A-Za-z0-9_-]{43}$/)
  await expect(page.getByText('Aguardando TV', { exact: true })).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain('fake-private-password')
  expect(await page.locator('body').innerText()).not.toContain('https://provider.invalid')
  expect(await page.locator('body').innerText()).not.toContain('fake-device-key')
})

test('editar mostra valores salvos, olho os oculta e Escape restaura foco após confirmação de remover', async ({ page }) => {
  const state = await fixture(page)
  await login(page)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByLabel('Senha Xtream')).toHaveValue('fake-private-password')
  await expect(page.getByLabel('Senha Xtream')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Ocultar dados', exact: true }).click()
  await expect(page.getByLabel('Senha Xtream')).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Mostrar dados', exact: true }).click()
  await page.getByLabel('Nome da lista').fill('Nome alterado')
  await page.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Editar', exact: true })).not.toBeVisible()
  expect(state.requests[0].body.input.providerPassword).toBe('fake-private-password')
  expect(state.requests[0].body.input.providerDns).toBe('https://provider.invalid')
  expect(state.requests[0].body.expectedRevision).toBe(1)
  const remove = page.getByRole('button', { name: 'Remover lista', exact: true })
  await remove.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(remove).toBeFocused()
  await remove.click()
  await page.getByRole('button', { name: 'Confirmar remoção' }).click()
  await expect(page.getByText('Configuração removida do portal; aguardando a TV')).toBeVisible()
  expect(state.requests.at(-1)?.body.action).toBe('source.delete')
})

test('M3U somente URL e falha de resposta reutiliza o mesmo pedido', async ({ page }) => {
  const state = await fixture(page, { loseFirst: true })
  await login(page)
  await page.getByRole('button', { name: 'Adicionar lista', exact: true }).click()
  await page.getByLabel('Nome da lista').fill('URL nova')
  await page.getByRole('group', { name: 'Tipo de lista' }).getByRole('radio', { name: 'M3U por URL' }).check()
  await page.getByLabel('URL da lista M3U', { exact: true }).fill('https://provider.invalid/list?key=fake-secret')
  await page.getByRole('button', { name: 'Enviar para a TV', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('mesmo pedido')
  await expect(page.getByLabel('Nome da lista')).toBeDisabled()
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'URL nova', exact: true })).toBeVisible()
  expect(state.requests[0]).toEqual(state.requests[1])
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain('fake-secret')
})

test('reenvio explícito usa revisão recente sem revelar salvo e repete ID após falha', async ({ page }) => {
  const state = await fixture(page, { loseFirst: true })
  await login(page)
  await page.getByRole('button', { name: 'Reenviar configuração guardada', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.getByRole('alert')).not.toBeVisible()
  expect(state.requests).toHaveLength(2)
  expect(state.requests[0]).toEqual(state.requests[1])
  expect(state.requests[0].body).toEqual({ expectedRevision: 1 })
  await expect(page.locator('input[type=password]')).toHaveCount(0)
})
test('snapshot desatualizado bloqueia reenvio', async ({ page }) => {
  await fixture(page, { stale: true })
  await login(page)
  await expect(page.getByRole('button', { name: 'Reenviar configuração guardada', exact: true })).toBeDisabled()
})

test('exclusão pendente continua visível sem configuração ou fonte no snapshot', async ({ page }) => {
  await fixture(page, { snapshotAbsent: true })
  await login(page)
  await page.getByRole('button', { name: 'Remover lista', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar remoção' }).click()
  await expect(page.getByText('Aguardando TV', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Atualizar estado', exact: true }).click()
  await expect(page.getByText('Aguardando TV', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reenviar configuração guardada', exact: true })).toHaveCount(0)
})
