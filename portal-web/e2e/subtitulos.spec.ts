import { expect, test, type Page } from '@playwright/test'
// Feature 091/US1 (ADR-022): as chaves de legenda (OpenSubtitles e SubDL) saem do campo só no PUT; nada as devolve; o
// estado de cada fornecedor vem do serviço. Mesmo molde de `tmdb.spec.ts`.
const CSRF = 'c'.repeat(42) + 'A'
const KEY_SD = 'chave-subdl-ficticia-091-e2e'
const KEY_OS = 'chave-opensubtitles-ficticia-091-e2e'
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name, exact: true })
/** Força uma leitura do portal (a mesma que o intervalo de 10 s faz) sem esperar o relógio. */
const refresh = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

type Provider = 'opensubtitles' | 'subdl'
type Server = {
  pending: { action: 'set' | 'remove'; createdAt: string; retryReason?: string } | null
  last: { action: 'set' | 'remove'; result: 'applied' | 'rejected'; reason?: string; at: string } | null
  tvReported: 'none' | 'configured' | 'rejected' | 'rate_limited' | null
}
type Call = { method: string; path: string; id?: string; body: unknown; csrf?: string }
const empty = (): Server => ({ pending: null, last: null, tvReported: 'none' })

async function fixture(page: Page, options: { loseFirst?: boolean; initial?: Partial<Record<Provider, Partial<Server>>> } = {}) {
  const servers: Record<Provider, Server> = {
    opensubtitles: { ...empty(), ...options.initial?.opensubtitles },
    subdl: { ...empty(), ...options.initial?.subdl },
  }
  const calls: Call[] = []
  const session = { deviceId: 'tv-subtitles-fixture', csrfToken: CSRF, expiresAt: new Date(Date.now() + 3600000).toISOString() }
  await page.route('**/portal/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/portal/v1', '')
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, json: value })
    if (path === '/sessions/exchange') return json(session)
    if (path === '/configurations') return json({ configurations: [], nextAfter: null })
    if (path === '/operations') return json({ operations: [], nextAfter: null })
    if (path === '/snapshot') return json({ snapshot: null, stale: true })
    if (path === '/session/device') return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path.startsWith('/integrations/subtitles')) {
      const hasBody = request.method() !== 'GET'
      calls.push({ method: request.method(), path, id: request.headers()['idempotency-key'], csrf: request.headers()['x-csrf-token'],
        body: hasBody ? request.postDataJSON() : undefined })
      const mutations = calls.filter(call => call.method !== 'GET')
      if (request.method() === 'GET') return json(servers)
      if (options.loseFirst && mutations.length === 1) return route.abort('failed')
      const provider = path.split('/')[3] as Provider
      const action = request.method() === 'PUT' ? 'set' : 'remove'
      servers[provider].pending = { action, createdAt: new Date().toISOString() }
      return json({ operationId: request.headers()['idempotency-key'], provider, action, state: 'pending' }, 202)
    }
    return json({}, 404)
  })
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Chaves de legenda/ }).click()
  await expect(page.getByRole('heading', { name: 'Chaves de legenda', level: 1 })).toBeVisible()
  return { servers, calls }
}
const section = (page: Page, provider: Provider) => page.getByRole('region', { name: provider === 'subdl' ? 'SubDL' : 'OpenSubtitles', exact: true })
const field = (page: Page, provider: Provider) => page.getByLabel(provider === 'subdl' ? 'Chave do SubDL' : 'Chave do OpenSubtitles', { exact: true })
const mutations = (calls: Call[]) => calls.filter(call => call.method !== 'GET')

test('"Chaves de legenda" é o segundo item de Ajustes e cada fornecedor, sem chave, oferece só Adicionar', async ({ page }) => {
  const { calls } = await fixture(page)
  await page.getByRole('button', { name: /^Voltar/ }).click()
  const items = page.getByRole('list', { name: 'Ajustes' }).getByRole('button')
  await expect(items.nth(0)).toContainText('Chave TMDB')
  await expect(items.nth(1)).toContainText('Chaves de legenda')
  await page.getByRole('button', { name: /^Chaves de legenda/ }).click()
  for (const provider of ['opensubtitles', 'subdl'] as const) {
    await expect(section(page, provider).getByText('Não configurada', { exact: true })).toBeVisible()
    await expect(section(page, provider).getByRole('heading', { name: 'Adicionar chave' })).toBeVisible()
    await expect(section(page, provider).getByRole('button', { name: 'Remover chave' })).toHaveCount(0)
    await expect(section(page, provider).getByText('Não há chave pessoal para remover.', { exact: false })).toBeVisible()
    await expect(field(page, provider)).toHaveAttribute('type', 'password')
  }
  expect(mutations(calls)).toHaveLength(0)
})

test('SC-001: do menu Ajustes à chave enviada em no máximo 3 toques (abrir, campo, enviar)', async ({ page }) => {
  const { calls } = await fixture(page)
  await page.getByRole('button', { name: /^Voltar/ }).click()
  let taps = 0
  const tap = async (action: () => Promise<void>) => { taps += 1; await action() }
  await tap(() => page.getByRole('button', { name: /^Chaves de legenda/ }).click())
  await tap(() => field(page, 'subdl').click())
  await field(page, 'subdl').fill(KEY_SD) // colar não é toque
  await tap(() => section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click())
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  expect(taps).toBeLessThanOrEqual(3)
  expect(mutations(calls)).toHaveLength(1)
})

test('adicionar nos dois fornecedores: a chave vai só no PUT do fornecedor certo, o campo é limpo e o estado vira "Aguardando a TV"; depois "Aplicada na TV"', async ({ page }) => {
  const { servers, calls } = await fixture(page)
  await field(page, 'subdl').fill(KEY_SD)
  await section(page, 'subdl').getByRole('button', { name: 'Mostrar dados' }).click()
  await expect(field(page, 'subdl')).toHaveAttribute('type', 'text')
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Enviada — na TV, em Configurações → Integrações & BYOK, aperte Atualizar' })).toBeVisible()
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  // O outro fornecedor não foi tocado.
  await expect(section(page, 'opensubtitles').getByText('Não configurada', { exact: true })).toBeVisible()

  await field(page, 'opensubtitles').fill(KEY_OS)
  await section(page, 'opensubtitles').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'opensubtitles').getByText('Aguardando a TV', { exact: true })).toBeVisible()

  const sent = mutations(calls)
  expect(sent).toHaveLength(2)
  expect(sent[0]).toMatchObject({ method: 'PUT', path: '/integrations/subtitles/subdl', body: { key: KEY_SD }, csrf: CSRF })
  expect(sent[1]).toMatchObject({ method: 'PUT', path: '/integrations/subtitles/opensubtitles', body: { key: KEY_OS }, csrf: CSRF })
  expect(sent[0].id).toMatch(/^op-[0-9]{13}-[A-Za-z0-9_-]{43}$/)
  // As chaves não ficam em lugar nenhum depois do envio.
  for (const provider of ['opensubtitles', 'subdl'] as const) {
    await expect(field(page, provider)).toHaveValue('')
    await expect(field(page, provider)).toHaveAttribute('type', 'password')
  }
  const body = await page.locator('body').innerText()
  const html = await page.content()
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))
  for (const secret of [KEY_SD, KEY_OS]) {
    expect(body).not.toContain(secret)
    expect(html).not.toContain(secret)
    expect(page.url()).not.toContain(secret)
    expect(storage).not.toContain(secret)
  }
  expect(JSON.stringify(calls.filter(call => call.method === 'GET'))).not.toContain(KEY_SD)

  // A TV aplicou o SubDL: o portal mostra o estado real, sem a chave.
  servers.subdl.pending = null
  servers.subdl.last = { action: 'set', result: 'applied', at: new Date().toISOString() }
  servers.subdl.tvReported = 'configured'
  await refresh(page)
  await expect(section(page, 'subdl').getByText('Aplicada na TV', { exact: true })).toBeVisible()
  await expect(section(page, 'subdl').getByRole('heading', { name: 'Substituir chave' })).toBeVisible()
  await expect(section(page, 'subdl').getByRole('button', { name: 'Remover chave' })).toBeVisible()
  await expect(section(page, 'opensubtitles').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  // Sem "cancelar envio" nem "usar o padrão" pelo portal (ADR-022).
  await expect(page.getByRole('button', { name: 'Cancelar envio' })).toHaveCount(0)
})

test('estados que a TV informa: recusada, formato inválido, no limite, desconhecido e tentando de novo', async ({ page }) => {
  await fixture(page, { initial: {
    opensubtitles: { last: { action: 'set', result: 'rejected', reason: 'refused', at: new Date().toISOString() }, tvReported: 'none' },
    subdl: { tvReported: 'rate_limited' },
  } })
  await expect(section(page, 'opensubtitles').getByText('Recusada pelo fornecedor', { exact: true })).toBeVisible()
  await expect(section(page, 'opensubtitles').getByText('O fornecedor não aceitou esta chave. Confira e envie outra.')).toBeVisible()
  await expect(section(page, 'subdl').getByText('No limite — tentar depois', { exact: true })).toBeVisible()
  await expect(section(page, 'subdl').getByRole('button', { name: 'Remover chave' })).toBeVisible()
})

test('TV antiga ou que ainda não informou: "Estado desconhecido", nunca "Não configurada"', async ({ page }) => {
  await fixture(page, { initial: { opensubtitles: { tvReported: null }, subdl: { tvReported: null } } })
  for (const provider of ['opensubtitles', 'subdl'] as const) {
    await expect(section(page, provider).getByText('Estado desconhecido', { exact: true })).toBeVisible()
    await expect(section(page, provider).getByText('Não configurada', { exact: true })).toHaveCount(0)
  }
})

test('TV que tentou e não alcançou o fornecedor: continua aguardando e avisa que tenta de novo', async ({ page }) => {
  const { servers } = await fixture(page, { initial: { subdl: { pending: { action: 'set', createdAt: new Date().toISOString() } } } })
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  servers.subdl.pending!.retryReason = 'offline'
  await refresh(page)
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  await expect(section(page, 'subdl').getByText('A TV tentou e não conseguiu falar com o fornecedor')).toBeVisible()
  servers.subdl.pending = null
  servers.subdl.last = { action: 'set', result: 'applied', at: new Date().toISOString() }
  servers.subdl.tvReported = 'configured'
  await refresh(page)
  await expect(section(page, 'subdl').getByText('Aplicada na TV', { exact: true })).toBeVisible()
})

test('formato inválido é barrado antes de enviar, sem ecoar o que foi colado', async ({ page }) => {
  const { calls } = await fixture(page)
  await field(page, 'subdl').fill('isto não é uma chave')
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'subdl').getByRole('alert').filter({ hasText: 'Esta chave não parece válida' })).toBeVisible()
  await expect(field(page, 'subdl')).toBeFocused()
  expect(mutations(calls)).toHaveLength(0)
  await field(page, 'subdl').fill('  ' + KEY_SD + '\n')
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  expect(mutations(calls)[0].body).toEqual({ key: KEY_SD })
})

test('remover pede confirmação (cancelar não envia) e envia a remoção só daquele fornecedor', async ({ page }) => {
  const { servers, calls } = await fixture(page, { initial: {
    subdl: { last: { action: 'set', result: 'applied', at: new Date().toISOString() }, tvReported: 'configured' },
    opensubtitles: { tvReported: 'configured' },
  } })
  await section(page, 'subdl').getByRole('button', { name: 'Remover chave' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(mutations(calls)).toHaveLength(0)
  await section(page, 'subdl').getByRole('button', { name: 'Remover chave' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sim, remover' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Remoção enviada — na TV, em Configurações → Integrações & BYOK, aperte Atualizar' })).toBeVisible()
  expect(mutations(calls)).toHaveLength(1)
  expect(mutations(calls)[0]).toMatchObject({ method: 'POST', path: '/integrations/subtitles/subdl/remove', body: {} })
  await expect(section(page, 'subdl').getByText('Remoção pendente', { exact: true })).toBeVisible()
  await expect(section(page, 'opensubtitles').getByText('Configurada na TV', { exact: true })).toBeVisible()
  // Depois do ack da TV e do snapshot, a remoção vira estado final sem oferecer outro Remover.
  servers.subdl.pending = null
  servers.subdl.last = { action: 'remove', result: 'applied', at: new Date().toISOString() }
  servers.subdl.tvReported = 'none'
  await refresh(page)
  await expect(section(page, 'subdl').getByText('Não configurada', { exact: true })).toBeVisible()
  await expect(section(page, 'subdl').getByRole('button', { name: 'Remover chave' })).toHaveCount(0)
  expect(mutations(calls)).toHaveLength(1)
})

test('falha de rede no envio reaproveita o mesmo pedido e a mesma chave, e a chave ainda não aparece na página', async ({ page }) => {
  const { calls } = await fixture(page, { loseFirst: true })
  await field(page, 'subdl').fill(KEY_SD)
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'subdl').getByRole('alert')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(KEY_SD)
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  const sent = mutations(calls)
  expect(sent).toHaveLength(2)
  expect(sent[0].id).toBe(sent[1].id)
  expect(sent[1].body).toEqual({ key: KEY_SD })
})

test('substituir duas vezes enquanto pendente envia operações diferentes e conserva o outro fornecedor', async ({ page }) => {
  const { calls } = await fixture(page, { initial: { subdl: { tvReported: 'configured' }, opensubtitles: { tvReported: 'configured' } } })
  for (const key of [KEY_SD, KEY_SD + '-segunda']) {
    await expect(section(page, 'subdl').getByRole('heading', { name: 'Substituir chave' })).toBeVisible()
    await field(page, 'subdl').fill(key)
    await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
    await expect(field(page, 'subdl')).toHaveValue('')
    await expect(section(page, 'subdl').getByText('Aguardando a TV', { exact: true })).toBeVisible()
  }
  const sent = mutations(calls)
  expect(sent).toHaveLength(2)
  expect(sent[0].id).not.toBe(sent[1].id)
  expect(sent[1]).toMatchObject({ path: '/integrations/subtitles/subdl', body: { key: KEY_SD + '-segunda' } })
  await expect(section(page, 'opensubtitles').getByText('Configurada na TV', { exact: true })).toBeVisible()
})

test('alterar a chave após falha de rede cria outro operationId para a substituição', async ({ page }) => {
  const { calls } = await fixture(page, { loseFirst: true, initial: { subdl: { tvReported: 'configured' } } })
  await field(page, 'subdl').fill(KEY_SD)
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(section(page, 'subdl').getByRole('alert')).toBeVisible()
  await field(page, 'subdl').fill(KEY_SD + '-outra')
  await section(page, 'subdl').getByRole('button', { name: 'Enviar para a TV' }).click()
  await expect(field(page, 'subdl')).toHaveValue('')
  const sent = mutations(calls)
  expect(sent).toHaveLength(2)
  expect(sent[0].id).not.toBe(sent[1].id)
  expect(sent[1].body).toEqual({ key: KEY_SD + '-outra' })
})
