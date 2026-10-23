import { expect, test, type Page } from '@playwright/test'
// Feature 077 (FR-016, SC-006): auditoria de layout em 360 (mobile), 768 (tablet) e 1280 (desktop) — um projeto do Playwright
// por largura — e em 320 px, nos três idiomas. Sem depender de textos: só papéis, `data-focus-key` e classes estáveis.
const session = { deviceId: 'tv-layout', csrfToken: 'c'.repeat(42) + 'A', expiresAt: new Date(Date.now() + 3600000).toISOString() }

async function mock(page: Page) {
  const sources = [
    { id: 'a', type: 'm3u_url', displayName: 'Lista da Casa com um nome bem comprido para testar a quebra de linha no cartão' },
    { id: 'b', type: 'provider_credentials', displayName: 'IPTV Premium Brasil' },
    { id: 'c', type: 'm3u_url', displayName: 'Esportes' },
  ]
  const configurations = sources.map(s => ({ sourceId: s.id, type: s.type, displayName: s.displayName, configVersion: 'v',
    appliedRevision: s.id === 'a' ? 1 : null, expectedRevision: 0, operationId: s.id === 'b' ? 'op-b' : null }))
  const operations = [
    { operationId: 'op-b', sourceId: 'b', action: 'source.update', state: 'pending', expectedRevision: 0, importState: null, receipt: null, createdAt: new Date().toISOString() },
    { operationId: 'op-c', sourceId: 'c', action: 'source.update', state: 'expired', expectedRevision: 0, importState: null, receipt: null, createdAt: new Date().toISOString() },
  ]
  await page.route('**/portal/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/portal/v1', '')
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path === '/sessions/exchange' || path === '/sessions/manual') return json(session)
    if (path === '/configurations') return json({ configurations, nextAfter: null })
    if (path === '/configurations/a/values') return json({ type: 'm3u_url', displayName: sources[0].displayName, m3uUrl: 'https://provider.invalid/lista.m3u' })
    if (path === '/operations') return json({ operations, nextAfter: null })
    if (path === '/snapshot') return json({ snapshot: { capturedAt: new Date().toISOString(), sources: [sources[0]], revisions: [{ sourceId: 'a', revision: 1 }], imports: [], integrations: { tmdb: 'configured' } }, stale: false })
    if (path === '/session/device') return json({ deviceId: session.deviceId, displayId: 'A0:8C:FD:19:0A:8C',
      license: { state: 'trial', startsAt: Date.now(), expiresAt: Date.now() + 5 * 86400000, generation: 1, serverTime: Date.now() } })
    if (path === '/offer') return json({ priceMinor: 3500, currency: 'BRL', termMonths: 12, deviceCount: 1, renewal: 'manual', checkoutEnabled: true })
    if (path === '/backup') return json({ exists: true, createdAt: Date.UTC(2026, 9, 14), counts: { favorites: 3, history: 7, progress: 2 } })
    if (path === '/integrations/tmdb') return json({ pending: null, last: { action: 'set', result: 'applied', at: new Date().toISOString() }, tvReported: 'configured' })
    // 091: chaves de legenda — uma aplicada, a outra sem chave e a TV ainda sem informar ("Estado desconhecido").
    if (path === '/integrations/subtitles') return json({
      opensubtitles: { pending: null, last: { action: 'set', result: 'applied', at: new Date().toISOString() }, tvReported: 'configured' },
      subdl: { pending: null, last: null, tvReported: null },
    })
    return json({}, 404)
  })
}

/** Rolagem horizontal, alvos pequenos e controles sem nome acessível na tela atual. */
async function audit(page: Page, label: string, minTarget: number) {
  const issues = await page.evaluate(min => {
    const out: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth) out.push(`rolagem horizontal (${doc.scrollWidth} > ${doc.clientWidth})`)
    const selector = 'button, a.button, input:not([type=hidden]), select, textarea, summary, [role=button]'
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el)
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue
      const tag = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '')
      if (rect.height < min - 0.5) out.push(`alvo baixo (${Math.round(rect.height)} px): ${tag}`)
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') ||
        (el as HTMLInputElement).labels?.length || el.textContent?.trim()
      if (!labelled) out.push('sem nome acessível: ' + tag)
    }
    for (const el of document.querySelectorAll<HTMLElement>('h1, h2, h3, p, label, button, a, summary')) {
      const style = getComputedStyle(el)
      if (!el.textContent?.trim() || (style.overflowX !== 'hidden' && style.overflow !== 'hidden')) continue
      if (el.getBoundingClientRect().width > 1 && el.scrollWidth > el.clientWidth + 1) {
        out.push('texto cortado: ' + el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/).join('.'))
      }
    }
    return out
  }, minTarget)
  expect(issues, label).toEqual([])
}

const navButton = (page: Page, index: number) => page.getByRole('navigation').first().locator('button').nth(index)

for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
  test.describe(locale, () => {
    test.use({ locale })

    test('todas as telas cabem na largura, têm alvos ≥ mínimo e nomes acessíveis; navegação e resumo no lugar certo', async ({ page }, info) => {
      const touch = info.project.name !== 'desktop'
      const minTarget = touch ? 44 : 36
      const width = page.viewportSize()!.width
      await mock(page)
      // Entrada: foco inicial no campo do ID (sem ID lembrado).
      await page.goto('/')
      await expect(page.locator('input[name=displayId]')).toBeFocused()
      await audit(page, 'entrada', minTarget)

      await page.goto('about:blank')
      await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
      await expect(page.locator('.list-card').first()).toBeVisible()
      // Resumo da TV sempre visível no topo; navegação embaixo (< 960) ou lateral (≥ 960).
      const summary = page.locator('.tv-summary')
      await expect(summary).toBeVisible()
      const nav = page.getByRole('navigation').first()
      const navBox = (await nav.boundingBox())!
      if (width < 960) {
        expect(Math.round(navBox.y + navBox.height)).toBe(page.viewportSize()!.height)
        expect(navBox.width).toBeGreaterThanOrEqual(width - 1)
        await expect(page.locator('.portal-nav-brand')).toBeHidden()
      } else {
        expect(navBox.x).toBeLessThanOrEqual(1)
        expect(navBox.width).toBeLessThan(width / 2)
        await expect(page.locator('.portal-nav-brand')).toBeVisible()
      }
      // Um único elemento de navegação principal.
      await expect(page.getByRole('navigation')).toHaveCount(1)
      await audit(page, 'listas', minTarget)

      // Esc fecha a confirmação de exclusão sem enviar nada.
      await page.locator('.list-card-actions .danger').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await audit(page, 'confirmação de exclusão', minTarget)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await page.locator('[data-focus-key^="edit-"]').first().click()
      await expect(page.locator('#list-editor-form')).toBeVisible()
      await expect(page.locator('input[name=displayName]')).toBeVisible()
      await audit(page, 'editor de lista', minTarget)
      await page.goBack()

      for (const [index, label] of [[1, 'licença'], [2, 'ajustes']] as const) {
        await navButton(page, index).click()
        await expect(navButton(page, index)).toHaveAttribute('aria-current', 'page')
        await expect(summary).toBeVisible()
        await page.waitForTimeout(250)
        await audit(page, label, minTarget)
      }
      for (const key of ['tmdb', 'subtitles', 'backup', 'code', 'recover', 'help']) {
        await page.locator(`[data-focus-key="${key}"]`).click()
        await page.waitForTimeout(250)
        await audit(page, 'ajustes › ' + key, minTarget)
        await page.locator('.subpage-header button, .subpage-header .ghost').first().click().catch(() => page.goBack())
        await expect(page.locator('.settings-list')).toBeVisible()
      }
    })
  })
}

test('320 px (reflow de 400% sobre 1280): sem rolagem horizontal em nenhuma tela', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'basta uma vez, no projeto de celular')
  await page.setViewportSize({ width: 320, height: 640 })
  await mock(page)
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await expect(page.locator('.list-card').first()).toBeVisible()
  await audit(page, 'listas 320', 44)
  for (const index of [1, 2]) {
    await navButton(page, index).click()
    await page.waitForTimeout(250)
    await audit(page, 'tela ' + index + ' em 320', 44)
  }
  for (const key of ['tmdb', 'subtitles', 'help']) {
    await page.locator(`[data-focus-key="${key}"]`).click()
    await page.waitForTimeout(250)
    await audit(page, key + ' em 320', 44)
    await page.goBack()
  }
})

test('360 px com viewport reduzido: o teclado mantém os campos acima da barra de ações', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'o cenário representa o teclado virtual no projeto de celular')
  await page.setViewportSize({ width: 360, height: 360 })
  await mock(page)
  await page.goto('/#invite=' + 'a'.repeat(42) + 'A')
  await page.locator('[data-focus-key^="edit-"]').first().click()
  await expect(page.locator('#list-editor-form')).toBeVisible()

  const editorOffsets = await page.evaluate(() => {
    const actionHeight = document.querySelector<HTMLElement>('.editor-actions')!.getBoundingClientRect().height
    const rootPadding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)
    const fieldMargins = [...document.querySelectorAll<HTMLElement>('.list-editor input, .list-editor select')]
      .map(field => Number.parseFloat(getComputedStyle(field).scrollMarginBottom))
    return { actionHeight, rootPadding, fieldMargins }
  })
  expect(editorOffsets.rootPadding).toBeGreaterThanOrEqual(editorOffsets.actionHeight)
  expect(editorOffsets.fieldMargins.every(margin => margin >= editorOffsets.actionHeight)).toBe(true)

  await page.goBack()
  await navButton(page, 2).click()
  await page.locator('[data-focus-key="tmdb"]').click()
  const tmdbOffset = await page.locator('input[name="tmdb-token"]').evaluate(field => Number.parseFloat(getComputedStyle(field).scrollMarginBottom))
  expect(tmdbOffset).toBeGreaterThanOrEqual(editorOffsets.actionHeight)

  await page.goBack()
  await page.locator('[data-focus-key="subtitles"]').click()
  for (const name of ['opensubtitles-token', 'subdl-token']) {
    const offset = await page.locator(`input[name="${name}"]`).evaluate(field => Number.parseFloat(getComputedStyle(field).scrollMarginBottom))
    expect(offset, name).toBeGreaterThanOrEqual(editorOffsets.actionHeight)
  }
})
