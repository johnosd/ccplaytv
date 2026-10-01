// Cadastro de lista pela tela "Conecte sua lista IPTV" (feature 037, D-011).
//
// Todo script E2E que precisa de uma lista passa por aqui, em vez de repetir
// os rótulos do formulário: quando o cadastro mudar de novo, muda um arquivo só.
// Parte da tela de listas (ou do próprio cadastro já aberto), escolhe o tipo,
// preenche e envia — esperar a importação terminar é com quem chama.

async function abrirCadastro(page) {
  const title = page.locator('#add-source-title')
  if (!(await title.isVisible().catch(() => false))) {
    await page.locator('.add-card').click()
    await title.waitFor({ timeout: 8000 })
  }
}

async function escolherTipo(page, nome) {
  const tipo = page.getByRole('button', { name: new RegExp(`^${nome}`) })
  if ((await tipo.getAttribute('aria-pressed')) !== 'true') await tipo.click()
}

/** Cadastra uma lista M3U por URL: "Lista M3U" → "Nome da lista" + "URL M3U" → "Conectar e sincronizar". */
export async function cadastrarListaM3u(page, { nome, url }) {
  await abrirCadastro(page)
  await escolherTipo(page, 'Lista M3U')
  await page.getByLabel('Nome da lista', { exact: true }).fill(nome)
  await page.getByLabel('URL M3U', { exact: true }).fill(url)
  await page.getByRole('button', { name: 'Conectar e sincronizar' }).click()
}

/** Cadastra uma lista Xtream: "Xtream Codes" → Nome/Servidor/Usuário/Senha → "Conectar e sincronizar". */
export async function cadastrarListaXtream(page, { nome, servidor, usuario, senha }) {
  await abrirCadastro(page)
  await escolherTipo(page, 'Xtream Codes')
  await page.getByLabel('Nome da lista', { exact: true }).fill(nome)
  await page.getByLabel('Servidor', { exact: true }).fill(servidor)
  await page.getByLabel('Usuário', { exact: true }).fill(usuario)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Conectar e sincronizar' }).click()
}
