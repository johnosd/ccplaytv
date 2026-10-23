import { expect, test, type Page } from '@playwright/test'
// Feature 077/US5 (+091): Ajustes reúne Chave TMDB, Chaves de legenda, Backup, Código de recuperação, Recuperar acesso, Ajuda e Sair, nessa ordem, cada
// um com uma linha que diz para que serve; Backup se exclui em poucos toques e sem apagar nada na TV.
const session = { deviceId: 'tv-settings-fixture', csrfToken: 'c'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 3600000).toISOString() }
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name, exact: true })

async function fixture(page: Page, backup: Record<string, unknown>) {
  const state = { backup, deletes: 0 }
  await page.route('**/portal/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/portal/v1', '')
    const json = (value: unknown, code = 200) => route.fulfill({ status: code, json: value })
    if (path === '/sessions/exchange' || path === '/sessions/manual') return json(session)
    if (path === '/session') return route.fulfill({ status: 204 })
    if (path === '/configurations') return json({ configurations: [], nextAfter: null })
    if (path === '/operations') return json({ operations: [], nextAfter: null })
    if (path === '/snapshot') return json({ snapshot: null, stale: true })
    if (path === '/session/device') return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 86400000, generation: 1, serverTime: Date.now() } })
    if (path === '/backup' && request.method() === 'GET') return json(state.backup)
    if (path === '/backup' && request.method() === 'DELETE') { state.deletes++; state.backup = { exists: false }; return route.fulfill({ status: 204 }) }
    if (path === '/integrations/tmdb') return json({ pending: null, last: null, tvReported: null })
    return json({}, 404)
  })
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await expect(page.getByRole('heading', { name: 'Listas', level: 1 })).toBeVisible()
  return state
}
const withBackup = { exists: true, createdAt: Date.UTC(2026, 9, 14), counts: { favorites: 3, history: 7, progress: 2 } }

test('Ajustes lista os itens na ordem do FR-014, cada um com a linha de descrição', async ({ page }) => {
  await fixture(page, withBackup)
  await nav(page, 'Ajustes').click()
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  const items = page.getByRole('list', { name: 'Ajustes' }).getByRole('button')
  await expect(items).toHaveCount(7)
  const expected = [
    ['Chave TMDB', 'Capas, elenco e detalhes dos filmes e séries.'],
    ['Chaves de legenda', 'OpenSubtitles e SubDL: use a sua própria chave.'],
    ['Backup', 'Veja e apague o backup dos seus favoritos e histórico.'],
    ['Código de recuperação', 'Sua senha de reserva para recuperar esta TV.'],
    ['Recuperar acesso', 'Use o código se a TV foi formatada ou o app reinstalado.'],
    ['Ajuda', 'Perguntas frequentes.'],
    ['Sair', 'Encerra a sessão neste navegador.'],
  ]
  for (const [index, [title, description]] of expected.entries()) {
    await expect(items.nth(index)).toContainText(title)
    await expect(items.nth(index)).toContainText(description)
  }
})

test('backup existente: só data e contagens; Excluir pede confirmação, cancelar não apaga e confirmar deixa "Nenhum backup guardado"', async ({ page }) => {
  const state = await fixture(page, withBackup)
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Backup/ }).click()
  const card = page.getByRole('region', { name: 'Backup dos dados de uso' })
  await expect(card).toContainText('3 favoritos, 7 no histórico, 2 em andamento')
  await card.getByRole('button', { name: 'Excluir backup' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Nada na TV é apagado')
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(state.deletes).toBe(0)
  await card.getByRole('button', { name: 'Excluir backup' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sim, excluir' }).click()
  await expect(card).toContainText('Nenhum backup guardado.')
  await expect(card.getByRole('status').filter({ hasText: 'Backup apagado.' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Excluir backup' })).toHaveCount(0)
  expect(state.deletes).toBe(1)
})

test('sem backup não há botão de excluir; Voltar devolve o foco ao item de origem', async ({ page }) => {
  await fixture(page, { exists: false })
  await nav(page, 'Ajustes').click()
  const item = page.getByRole('button', { name: /^Backup/ })
  await item.click()
  const card = page.getByRole('region', { name: 'Backup dos dados de uso' })
  await expect(card).toContainText('Nenhum backup guardado.')
  await expect(card.getByRole('button', { name: 'Excluir backup' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Voltar/ }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible()
  await expect(item).toBeFocused()
})

test('Ajuda abre dentro de Ajustes, sem Revendedores, e os atalhos levam às telas novas', async ({ page }) => {
  await fixture(page, { exists: false })
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Ajuda/ }).click()
  await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Perguntas frequentes' })).toBeVisible()
  // O FAQ não cita mais Revendedores nem o "Atualizar estado" do cartão antigo (o botão do resumo da TV é outra coisa).
  expect(await page.locator('.faq-page').innerText()).not.toMatch(/Revendedor|Atualizar estado/i)
  expect(await page.locator('body').innerText()).not.toMatch(/Revendedor/i)
  await expect(page.getByRole('button', { name: /^Chave TMDB/ })).toHaveCount(0)
  await page.getByRole('searchbox').fill('chave tmdb')
  await expect(page.getByText('Como coloco minha chave do TMDB?')).toBeVisible()
  await page.getByRole('button', { name: /^Ir para Licença/ }).first().click()
  await expect(nav(page, 'Licença')).toHaveAttribute('aria-current', 'page')
})

test('Sair encerra a sessão e a próxima entrada já vem com o ID da TV lembrado', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ccplay-portal-last-device', 'A0:8C:FD:19:0A:8C'))
  await fixture(page, { exists: false })
  await nav(page, 'Ajustes').click()
  await page.getByRole('button', { name: /^Sair/ }).click()
  await expect(page.getByRole('heading', { name: 'Conectar à TV' })).toBeVisible()
  await expect(page.getByLabel('Endereço MAC da TV', { exact: true })).toHaveValue('A0-8C-FD-19-0A-8C')
  await expect(page.getByLabel('Chave do dispositivo', { exact: true })).toBeFocused()
})
