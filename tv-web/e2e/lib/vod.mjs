// Atalhos para Filmes/Séries (features 052/053): a tela de topo é a VITRINE (lista lateral de categorias + hero + fileiras;
// sem topbar) e a grade é a TELA DE CATEGORIA, aberta por um item da lista lateral ou por "Ver tudo". Os roteiros E2E que
// antes escolhiam a categoria na sidebar (`.side-category-nav-item`) passam por aqui — quando a navegação mudar de novo,
// muda um arquivo só.

/** Do Início (qualquer foco restaurado), abre `movies`/`series`/`live` pela topbar (sobe, zera a posição, anda, OK). */
export async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series']
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

/** Rótulo da fileira que tem o foco de estado na vitrine, ou `null`. */
export async function focusedRowLabel(page) {
  return page.evaluate(() => {
    const focused = document.querySelector('.vod-showcase .tv-focus')
    return focused?.closest('section.vod-row')?.getAttribute('aria-label') ?? null
  })
}

/** Texto do cartão com o foco de estado na vitrine (fileira ou lista lateral), ou `null`. */
export async function focusedCardText(page) {
  return page.evaluate(() => {
    const focused = document.querySelector('.vod-showcase .tv-focus')
    return focused?.closest('.content-card, .side-category-nav-item, .vod-see-all-card')?.textContent?.trim() ?? null
  })
}

/** Abre a vitrine de `movies`/`series` pela topbar e espera a lista lateral de categorias reais. */
export async function openShowcase(page, section) {
  await openViaTopbar(page, section)
  await page.waitForSelector('.vod-showcase .side-category-nav-item', { timeout: 10000 })
}

/** Leva o foco da vitrine à lista lateral de categorias (← a partir de uma fileira; já nela, não faz nada). */
export async function focusSideList(page) {
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator('.vod-showcase .side-category-nav-item.tv-focus').count()) > 0) return
    await page.keyboard.press('ArrowLeft')
  }
  throw new Error('não cheguei na lista lateral de categorias')
}

/**
 * Abre a tela de categoria `name` ("Todos", "Favoritos", "Histórico" ou o nome da categoria, sem prefixo) a partir da
 * vitrine já aberta: vai à lista lateral, anda com ↓ até o item e dá OK. Espera a toolbar da categoria.
 */
export async function openVodCategory(page, name) {
  await focusSideList(page)
  // Sobe até a barra Pesquisar/Ordenar (↑ no 1º item) e volta com ↓: o foco fica no 1º item da lista.
  for (let i = 0; i < 80; i += 1) {
    if ((await page.locator('.vod-showcase-toolbar .tv-focus').count()) > 0) break
    await page.keyboard.press('ArrowUp')
  }
  await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 80; i += 1) {
    const text = (await focusedCardText(page)) ?? ''
    if (text.includes(name)) {
      await page.keyboard.press('Enter')
      await page.waitForSelector('.vod-toolbar, .vod-state-wrapper, .empty-state, .error-state', { timeout: 10000 })
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`não achei o item da lista lateral "${name}"`)
}

/** Atalho completo: Início → topbar → vitrine → categoria. */
export async function openSectionCategory(page, section, name) {
  await openShowcase(page, section)
  await openVodCategory(page, name)
}
/**
 * Garante o foco na lista lateral (feature 053): com histórico/favoritos/recentes o foco inicial cai numa fileira, não na
 * lista; e depois de abrir a tela pela topbar o foco pode estar nela (↓ entra no conteúdo). A lista só recolhe com o foco nos cards, por isso
 * `focusSideList` só pressiona ← enquanto o foco NÃO está nela.
 */
export async function ensureSideFocus(page) {
  if ((await page.locator('.vod-showcase .tv-focus').count()) === 0) await page.keyboard.press('ArrowDown')
  await focusSideList(page)
}
/**
 * Leva o foco da lista lateral da vitrine ao item cujo texto contém `name` (↓ até achar; se passou, ↑). Os roteiros
 * antigos esperavam o foco já na 1ª categoria real; hoje a lista começa em "★ Favoritos".
 */
export async function focusSideItem(page, name) {
  await page.waitForFunction(() => document.querySelectorAll('.vod-showcase .side-category-nav-item').length >= 4, null, { timeout: 8000 })
  await ensureSideFocus(page)
  const focusedText = async () => (await page.locator('.vod-showcase .side-category-nav-item.tv-focus').first().textContent({ timeout: 1500 }).catch(() => null)) ?? ''
  for (const key of ['ArrowDown', 'ArrowUp']) {
    for (let i = 0; i < 120; i += 1) {
      const text = await focusedText()
      if (text.includes(name)) return
      if (text === '' && key === 'ArrowUp') {
        await page.keyboard.press('ArrowDown') // saiu da lista pela barra: volta
        break
      }
      await page.keyboard.press(key)
    }
  }
  throw new Error(`não achei o item da lista lateral "${name}"`)
}

/** Foco no 1º item que NÃO é ★ Favoritos / ↺ Histórico / Todos (a "1ª categoria real"). */
export async function focusFirstRealCategory(page) {
  await page.waitForFunction(() => document.querySelectorAll('.vod-showcase .side-category-nav-item').length >= 4, null, { timeout: 8000 })
  await ensureSideFocus(page)
  for (let i = 0; i < 12; i += 1) {
    // Sob carga (rodada paralela) o foco pode demorar a aparecer na lista: espera por ele em vez de apertar às cegas.
    await page.waitForSelector('.vod-showcase .side-category-nav-item.tv-focus', { timeout: 4000 }).catch(() => {})
    const text = (await page.locator('.vod-showcase .side-category-nav-item.tv-focus').first().textContent({ timeout: 1500 }).catch(() => '')) ?? ''
    if (text && !/Favoritos|Histórico|Todos/.test(text)) return
    if (text) await page.keyboard.press('ArrowDown')
    else await ensureSideFocus(page) // o foco saiu da lista (dados que chegaram): volta a ela
  }
  throw new Error('não achei uma categoria real na lista lateral')
}

/** Move o foco da vitrine até a fileira `label` (a lista lateral → vai às fileiras com →; depois ↑/↓, no máximo 8 teclas). */
export async function gotoRow(page, label, categories = []) {
  // Ordem fixa sob o hero (feature 053); as fileiras de categoria vêm depois, na ordem da fonte (`categories`, se passadas).
  const ORDER = [
    'Continue assistindo',
    'Em alta esta semana',
    '★ Favoritos',
    'Adicionados recentemente',
    'Bem avaliados',
    'Dica de filme',
    'Dica de série',
    'Porque você assistiu',
    ...categories,
  ]
  if ((await focusedRowLabel(page)) === null) await enterRows(page)
  for (let i = 0; i < 16; i += 1) {
    const current = await focusedRowLabel(page)
    if (current === label) return
    const down = ORDER.indexOf(label) > ORDER.indexOf(current ?? 'Continue assistindo')
    await page.keyboard.press(down ? 'ArrowDown' : 'ArrowUp')
  }
  throw new Error(`não cheguei na fileira "${label}"`)
}

/**
 * Da lista lateral para os cards (feature 053): ← → paginam a lista e → na última entrada entra nos cards, então repete → até
 * o foco estar numa fileira. Já nos cards, não faz nada.
 */
export async function enterRows(page) {
  for (let i = 0; i < 120; i += 1) {
    if ((await focusedRowLabel(page)) !== null) return
    await page.keyboard.press('ArrowRight')
  }
  throw new Error('não consegui entrar nos cards a partir da lista lateral')
}
