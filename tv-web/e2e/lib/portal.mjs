// Feature 070: o canto "Adicionar pelo site" saiu dos perfis (D-009). O painel de licença/chave/código continua em
// Configurações → "Portal & licença"; este helper chega lá só pelo controle (setas + OK), a partir da tela de listas.

const focusText = page => page.evaluate(() => (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').trim())

/** Perfis → cartão "Adicionar lista" → ↓ "Configurações" → OK → aba "Portal & licença" → OK (foco na 1ª ação). */
export async function abrirPortalLicenca(page) {
  await page.locator('.add-card').waitFor({ timeout: 20000 })
  for (let i = 0; i < 12 && !(await focusText(page)).startsWith('Adicionar lista'); i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  const corner = await focusText(page)
  if (corner !== 'Configurações') throw new Error('foco não chegou a "Configurações": ' + corner)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Portal & licença' }).waitFor({ timeout: 15000 })
  for (let i = 0; i < 12 && (await focusText(page)) !== 'Portal & licença'; i++) await page.keyboard.press('ArrowDown')
  if ((await focusText(page)) !== 'Portal & licença') throw new Error('aba "Portal & licença" não recebeu foco')
  await page.keyboard.press('Enter')
  await page.locator('.portal-license-panel').waitFor({ timeout: 15000 })
}
