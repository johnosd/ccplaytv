// Feature 070/075: o canto "Adicionar pelo site" saiu dos perfis (D-009). Portal & licença e Backup são abas de
// Configurações; este helper chega a elas só pelo controle (setas + OK), a partir da tela de listas.
// Em Portal & licença o foco entra na ação principal da licença (Comprar / Atualizar) ou no olho (build não comercial).

const focusText = page => page.evaluate(() => (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').trim())

/** Perfis → cartão "Adicionar lista" → ↓ "Configurações" → OK → aba `nome` → OK (foco na ação inicial da aba). */
async function abrirAba(page, nome, painel) {
  await page.locator('.add-card').waitFor({ timeout: 20000 })
  for (let i = 0; i < 12 && !(await focusText(page)).startsWith('Adicionar lista'); i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  const corner = await focusText(page)
  if (corner !== 'Configurações') throw new Error('foco não chegou a "Configurações": ' + corner)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: nome, exact: true }).waitFor({ timeout: 15000 })
  for (let i = 0; i < 12 && (await focusText(page)) !== nome; i++) await page.keyboard.press('ArrowDown')
  if ((await focusText(page)) !== nome) throw new Error(`aba "${nome}" não recebeu foco`)
  await page.keyboard.press('Enter')
  await page.locator(painel).waitFor({ timeout: 15000 })
}

export const abrirPortalLicenca = page => abrirAba(page, 'Portal & licença', '.portal-license-panel')
export const abrirBackup = page => abrirAba(page, 'Backup', '.portal-backup')

/** Desce com ↓ até o botão `texto` ficar em foco (a ordem das ações é a da tela). */
export async function irParaFoco(page, texto) {
  for (let i = 0; i < 8 && !(await focusText(page)).startsWith(texto); i++) await page.keyboard.press('ArrowDown')
  const atual = await focusText(page)
  if (!atual.startsWith(texto)) throw new Error(`foco não chegou a "${texto}": ${atual}`)
}

/** Portal & licença → Avançado → OK: abre a subtela (região "Avançado") com os quatro itens; o foco entra no olho. */
export async function abrirAvancado(page) {
  await irParaFoco(page, 'Avançado')
  await page.keyboard.press('Enter')
  await page.getByRole('region', { name: 'Avançado' }).waitFor({ timeout: 5000 })
}

/** Avançado → Gerar nova chave e código → confirmar (clique direto: o fluxo por teclado está em `portal-avancado.mjs`). */
export async function gerarNovaChave(page) {
  await page.getByRole('button', { name: 'Avançado', exact: true }).click()
  await page.getByRole('region', { name: 'Avançado' }).getByRole('button', { name: 'Gerar nova chave e código', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Gerar nova chave e código', exact: true }).click()
}