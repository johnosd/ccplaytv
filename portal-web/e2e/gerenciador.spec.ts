import { expect, test, type Page } from '@playwright/test'
import { trackPortalTraffic } from './portalQuiet'

const session = { deviceId: 'tv-fixture', csrfToken: 'csrf-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() }
const source = { id: 'source-existing', type: 'provider_credentials', displayName: 'Lista existente' }
// 072: o painel só recebe data e contagens do backup.
const backupState = { value: { exists: true, createdAt: Date.UTC(2026, 9, 14), counts: { favorites: 3, history: 7, progress: 2 } } as Record<string, unknown> }

/** Portal fictício: devolve o corpo recebido em `/sessions/manual` para o teste conferir o que a página enviou. */
async function mockPortal(page: Page, manualBodies: unknown[] = []) {
  await page.route('**/portal/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/sessions/manual')) { manualBodies.push(route.request().postDataJSON()); return json(session) }
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/configurations/source-existing/values')) return json({ type: source.type, displayName: source.displayName,
      providerDns: 'https://provider.invalid', providerUsername: 'fixture-user', providerPassword: 'fixture-password' })
    if (path.endsWith('/configurations')) return json({ configurations: [{ sourceId: source.id, type: source.type,
      displayName: source.displayName, configVersion: 'version', appliedRevision: 1, expectedRevision: 1, operationId: null }], nextAfter: null })
    if (path.endsWith('/operations') && route.request().method() === 'GET') return json({ operations: [], nextAfter: null })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: [source], revisions: [{ sourceId: source.id, revision: 1 }], imports: [] }, stale: false })
    if (path.endsWith('/backup') && route.request().method() === 'GET') return json(backupState.value)
    if (path.endsWith('/backup') && route.request().method() === 'DELETE') { backupState.value = { exists: false }; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/offer')) return json({ priceMinor: 3500, currency: 'BRL', termMonths: 12, deviceCount: 1, renewal: 'manual', checkoutEnabled: false })
    return json({ code: 'not_found' }, 404)
  })
}
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name })

test('entra por ID e chave, mostra o resumo da TV e as ações de lista; o atalho de compra abre Licença', async ({ page }) => {
  await mockPortal(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Recuperar acesso à TV', exact: true })).toHaveCount(0)
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  const summary = page.getByRole('region', { name: 'Resumo da TV' })
  await expect(summary.getByText('A0:8C:FD:19:0A:8C', { exact: true })).toBeVisible()
  await expect(summary.getByText('Período de teste', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recarregar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excluir', exact: true })).toBeVisible()
  await nav(page, 'Licença').click()
  await expect(nav(page, 'Licença')).toHaveAttribute('aria-current', 'page')
})

// Atualização manual: o botão do resumo da TV relê o painel na hora, sem esperar os 10 s da leitura automática.
test('Atualizar estado no resumo relê o painel na hora', async ({ page }) => {
  await mockPortal(page)
  let snapshots = 0
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/snapshot')) snapshots++ })
  await page.goto('/#id=a0-8c-fd-19-0a-8c&key=0123456789')
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  await expect.poll(() => snapshots).toBeGreaterThan(0)
  const before = snapshots
  const refresh = page.getByRole('region', { name: 'Resumo da TV' }).getByRole('button', { name: 'Atualizar estado' })
  await refresh.click()
  await expect.poll(() => snapshots).toBeGreaterThan(before)
  await expect(refresh).toBeVisible()
})

// A confirmação precisa vir da leitura seguinte da TV, não do envio ao portal: uma lista pendente só vira "Aplicado"
// quando o painel atualizado passa a reportá-la como aplicada.
test('lista aguardando avisa quando a atualização da TV a aplica', async ({ page }) => {
  let applied = false
  await page.route('**/portal/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path.endsWith('/sessions/manual')) return json(session)
    if (path.endsWith('/session/device')) return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.endsWith('/configurations')) return json({ configurations: [{ sourceId: source.id, type: source.type,
      displayName: source.displayName, configVersion: 'version', appliedRevision: applied ? 1 : null, expectedRevision: 0, operationId: 'op-pending' }], nextAfter: null })
    if (path.endsWith('/operations')) return json({ operations: [{ operationId: 'op-pending', sourceId: source.id, action: 'source.update',
      state: applied ? 'applied' : 'pending', expectedRevision: 0, importState: null, receipt: null, createdAt: new Date().toISOString() }], nextAfter: null })
    if (path.endsWith('/snapshot')) return json({ snapshot: { capturedAt: new Date().toISOString(), sources: applied ? [source] : [],
      revisions: applied ? [{ sourceId: source.id, revision: 1 }] : [], imports: [] }, stale: false })
    return json({ code: 'not_found' }, 404)
  })
  await page.goto('/#id=a0-8c-fd-19-0a-8c&key=0123456789')
  const card = page.getByRole('article', { name: 'Lista existente' })
  await expect(card).toContainText('Aguardando a TV')
  await expect(page.getByRole('status').filter({ hasText: 'Aplicado na TV' })).toHaveCount(0)

  applied = true
  await page.getByRole('region', { name: 'Resumo da TV' }).getByRole('button', { name: 'Atualizar estado' }).click()
  await expect(card).toContainText('Na TV')
  await expect(page.getByRole('status').filter({ hasText: 'Aplicado na TV' })).toBeVisible()
})

// Sessão vencida ou chave trocada na TV durante o uso: volta à entrada, com o ID lembrado e um aviso claro.
test('sessão encerrada no meio do uso volta à entrada com o ID lembrado e o aviso', async ({ page }) => {
  await mockPortal(page)
  // Leituras iniciais ainda em voo quando a rota vira 401 derrubariam a sessão ANTES do clique (corrida só vista em paralelo): ver `portalQuiet.ts`.
  const traffic = trackPortalTraffic(page)
  await page.goto('/')
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill('0123456789')
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
  await traffic.quiet()
  // A partir daqui o serviço recusa a sessão (a rota registrada por último vence).
  await page.route('**/portal/v1/**', route => route.fulfill({ status: 401, json: { code: 'unauthorized', retryable: false } }))
  await page.getByRole('region', { name: 'Resumo da TV' }).getByRole('button', { name: 'Atualizar estado' }).click()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Sua sessão terminou' })).toBeVisible()
  await expect(page.getByLabel('Endereço MAC da TV', { exact: true })).toHaveValue('A0-8C-FD-19-0A-8C')
  const key = page.getByLabel('Chave do dispositivo', { exact: true })
  await expect(key).toHaveValue('')
  await expect(key).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('ccplay-portal-session'))).toBeNull()
})

// A TV mostra a chave em grupos ("012 345 6789"): colar do jeito que aparece tem de funcionar.
test('chave colada com espaços ou hífens é entendida e enviada sem eles', async ({ page }) => {
  const bodies: unknown[] = []
  await mockPortal(page, bodies)
  await page.goto('/')
  await page.getByLabel('Endereço MAC da TV', { exact: true }).fill('a0-8c-fd-19-0a-8c')
  await page.getByLabel('Chave do dispositivo', { exact: true }).fill(' 012 345 6789 ')
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  expect(bodies).toEqual([{ displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' }])
})

// Feature 071 (US5/AC2, AC4): o QR fixo da TV abre o painel já autenticado, sem digitar, e o fragmento sai do endereço.
test('QR fixo da TV entra direto, normaliza o ID e não deixa a chave no endereço', async ({ page }) => {
  const bodies: unknown[] = []
  await mockPortal(page, bodies)
  await page.goto('/#id=a0-8c-fd-19-0a-8c&key=0123456789')

  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  expect(bodies).toEqual([{ displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' }])
  expect(page.url()).not.toContain('#')
  expect(page.url()).not.toContain('0123456789')
  expect(await page.evaluate(() => window.location.href + document.referrer)).not.toContain('0123456789')
})

// O backup (072) agora é exercitado em `ajustes.spec.ts`: Ajustes → Backup → Excluir backup com confirmação.
