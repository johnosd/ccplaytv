import { expect, test, type Page } from '@playwright/test'
// Feature 077/US4 (ADR-020): a chave TMDB sai do campo só no PUT; nada a devolve; o estado vem do serviço.
const CSRF = 'c'.repeat(42) + 'A'
const KEY = '0123456789abcdef0123456789abcdef'
const OTHER = 'fedcba9876543210fedcba9876543210'
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name, exact: true })
/** Força uma leitura do portal (a mesma que o intervalo de 10 s faz) sem esperar o relógio. */
const refresh = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

type Server = {
  pending: { action: 'set' | 'remove'; createdAt: string; retryReason?: string } | null
  last: { action: 'set' | 'remove'; result: 'applied' | 'rejected'; reason?: string; at: string } | null
  tvReported: 'none' | 'configured' | null
}
async function fixture(page: Page, options: { loseFirst?: boolean; initial?: Partial<Server> } = {}) {
  const server: Server = { pending: null, last: null, tvReported: null, ...options.initial }
  const calls: { method: string; path: string; id?: string; body: unknown; csrf?: string }[] = []
  const session = { deviceId: 'tv-tmdb-fixture', csrfToken: CSRF, expiresAt: new Date(Date.now() + 3600000).toISOString() }
  await page.route('**/portal/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/portal/v1', '')
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, json: value })
    if (path === '/sessions/exchange') return json(session)
    if (path === '/configurations') return json({ configurations: [], nextAfter: null })
    if (path === '/operations') return json({ operations: [], nextAfter: null })
    if (path === '/snapshot') return json({ snapshot: null, stale: true })
    if (path === '/session/device') return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.startsWith('/integrations/tmdb')) {
      const hasBody = request.method() !== 'GET' && request.method() !== 'DELETE'
      calls.push({ method: request.method(), path, id: request.headers()['idempotency-key'], csrf: request.headers()['x-csrf-token'],
        body: hasBody ? request.postDataJSON() : undefined })
      const mutations = calls.filter(call => call.method !== 'GET')
      if (request.method() === 'GET') return json(server)
      if (options.loseFirst && mutations.length === 1) return route.abort('failed')
      if (request.method() === 'PUT') {
        server.pending = { action: 'set', createdAt: new Date().toISOString() }
        return json({ operationId: request.headers()['idempotency-key'], action: 'set', state: 'pending' }, 202)
      }
      if (request.method() === 'POST') {
        server.pending = { action: 'remove', createdAt: new Date().toISOString() }
        return json({ operationId: request.headers()['idempotency-key'], action: 'remove', state: 'pending' }, 202)
      }
      server.pending = null
      return route.fulfill({ status: 204 })
    }
    return json({}, 404)
  })
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Chave TMDB/ }).click()
  await expect(page.getByRole('heading', { name: 'Chave TMDB', level: 1 })).toBeVisible()
  return { server, calls }
}
const field = (page: Page) => page.getByLabel('Chave do TMDB', { exact: true })
const mutations = (calls: { method: string }[]) => calls.filter(call => call.method !== 'GET')

test('Chave TMDB é o primeiro item de Ajustes e, sem chave, oferece só Adicionar', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: /^Voltar/ }).click()
  const items = page.getByRole('list', { name: 'Ajustes' }).getByRole('button')
  await expect(items.first()).toContainText('Chave TMDB')
  await page.getByRole('button', { name: /^Chave TMDB/ }).click()
  await expect(page.getByText('Não configurada', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Adicionar chave' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remover chave' })).toHaveCount(0)
  await expect(field(page)).toHaveAttribute('type', 'password')
})

test('adicionar: o campo é oculto por padrão, a chave vai só no PUT, o campo é limpo e o estado vira "Aguardando a TV"; depois "Aplicada na TV"', async ({ page }) => {
  const { server, calls } = await fixture(page)
  await field(page).fill(KEY)
  await page.getByRole('button', { name: 'Mostrar dados' }).click()
  await expect(field(page)).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Enviada — na TV, em Configurações → Integrações & BYOK, aperte Atualizar' })).toBeVisible()
  await expect(page.getByText('Aguardando a TV', { exact: true })).toBeVisible()
  const sent = mutations(calls)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ method: 'PUT', path: '/integrations/tmdb', body: { key: KEY }, csrf: CSRF })
  expect(sent[0].id).toMatch(/^op-[0-9]{13}-[A-Za-z0-9_-]{43}$/)
  // A chave não fica em lugar nenhum depois do envio.
  await expect(field(page)).toHaveValue('')
  await expect(field(page)).toHaveAttribute('type', 'password')
  expect(await page.locator('body').innerText()).not.toContain(KEY)
  expect(await page.content()).not.toContain(KEY)
  expect(page.url()).not.toContain(KEY)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(KEY)
  expect(JSON.stringify(calls.filter(call => call.method === 'GET'))).not.toContain(KEY)
  // A TV aplicou: o portal mostra o estado real, sem a chave.
  server.pending = null
  server.last = { action: 'set', result: 'applied', at: new Date().toISOString() }
  server.tvReported = 'configured'
  await refresh(page)
  await expect(page.getByText('Aplicada na TV', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Substituir chave' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remover chave' })).toBeVisible()
})

test('recusada pelo TMDB mostra o motivo e permite enviar outra; formato inválido é barrado antes de enviar', async ({ page }) => {
  const { calls } = await fixture(page, { initial: { last: { action: 'set', result: 'rejected', reason: 'refused', at: new Date().toISOString() }, tvReported: 'none' } })
  await expect(page.getByText('Recusada pelo TMDB', { exact: true })).toBeVisible()
  await expect(page.getByText('O TMDB não aceitou esta chave. Confira e envie outra.')).toBeVisible()
  await field(page).fill('isto-nao-e-uma-chave')
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'não tem o formato do TMDB' })).toBeVisible()
  await expect(field(page)).toBeFocused()
  expect(mutations(calls)).toHaveLength(0)
  await field(page).fill('  ' + OTHER + '\n')
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByText('Aguardando a TV', { exact: true })).toBeVisible()
  expect(mutations(calls)[0].body).toEqual({ key: OTHER })
})

test('remover pede confirmação (cancelar não envia) e envia a remoção; cancelar o envio pendente limpa a espera', async ({ page }) => {
  const { calls } = await fixture(page, { initial: { last: { action: 'set', result: 'applied', at: new Date().toISOString() }, tvReported: 'configured' } })
  await page.getByRole('button', { name: 'Remover chave' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(mutations(calls)).toHaveLength(0)
  await page.getByRole('button', { name: 'Remover chave' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sim, remover' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Remoção enviada — na TV, em Configurações → Integrações & BYOK, aperte Atualizar' })).toBeVisible()
  expect(mutations(calls)[0]).toMatchObject({ method: 'POST', path: '/integrations/tmdb/remove', body: {} })
  await expect(page.getByText('Aguardando a TV', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar envio' }).click()
  await expect(page.getByText('Aguardando a TV', { exact: true })).toHaveCount(0)
  expect(mutations(calls).at(-1)).toMatchObject({ method: 'DELETE', path: '/integrations/tmdb/pending' })
})

test('falha de rede no envio reaproveita o mesmo pedido e a mesma chave, e a chave ainda não aparece na página', async ({ page }) => {
  const { calls } = await fixture(page, { loseFirst: true })
  await field(page).fill(KEY)
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(KEY)
  await page.getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByText('Aguardando a TV', { exact: true })).toBeVisible()
  const sent = mutations(calls)
  expect(sent).toHaveLength(2)
  expect(sent[0].id).toBe(sent[1].id)
  expect(sent[1].body).toEqual({ key: KEY })
})

test('TV que tentou e não alcançou o TMDB: continua aguardando e avisa que tenta de novo', async ({ page }) => {
  await fixture(page, { initial: { pending: { action: 'set', createdAt: new Date().toISOString(), retryReason: 'offline' } } })
  await expect(page.getByText('Aguardando a TV', { exact: true })).toBeVisible()
  await expect(page.getByText('A TV tentou e não conseguiu falar com o TMDB')).toBeVisible()
})
