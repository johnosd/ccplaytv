// Paridade visual da feature 028 (Limpeza e QA do DS V14) — NÃO é um gate de
// asserção como os demais scripts de `e2e/`: prova, pixel a pixel, que
// eliminar `features/screens.css` e corrigir o `Icon` (D-003/D-007 do
// plan.md) não mudou nenhuma tela além do listado em INTENTIONAL (FR-022,
// SC-006). Três modos:
//
//   node e2e/paridade-limpeza.mjs antes      # ANTES de qualquer mudança de CSS/TSX da 028 (T002)
//   node e2e/paridade-limpeza.mjs depois     # DEPOIS de cada rodada de mudança (T034/T046/T054)
//   node e2e/paridade-limpeza.mjs comparar   # compara antes/ × depois/, sai 1 se achar diferença não listada
//
// Pré-requisito ("antes"/"depois"): `npm run dev` já rodando em outro
// terminal (http://localhost:5173) — mesma convenção dos demais scripts.
// "comparar" não precisa do dev server (só lê os PNGs já capturados).
//
// Dados: só fictícios (`fixtures/limpeza-qa.m3u`, servida por um HTTP
// server local criado por este próprio script) — nunca uma fonte real.
//
// Rede: interceptamos SÓ o host fictício da fixture
// (`limpeza-qa.e2e.test`), nunca `**/live/**`/`**/vod/**`/`**/series/**` —
// esses globs casam também com os módulos do próprio Vite dev server
// (`/src/features/live/*.tsx`) e derrubam o app inteiro (achado real da
// feature 027, T040, `logic/migracao-css.md` §5).
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'limpeza-qa.m3u')
const APP_URL = 'http://localhost:5173'
const OUT_ROOT = path.resolve(__dirname, '..', '..', 'sdd', 'specs', '028-limpeza-qa-ds-v14', 'evidencias', 'paridade')

/**
 * Diferenças visuais aceitas entre "antes" e "depois", uma por nome de
 * captura (sem a extensão). Cada entrada também vai para a seção
 * "Diferenças visuais intencionais" de `matriz-qa.md` (`logic/matriz-qa.md`
 * §5). Vazio no Setup (T001) — a US1 (Fase 3) e a correção do `Icon`
 * (Fase 5, T033) somam entradas aqui conforme fecham.
 */
const INTENTIONAL = {
  // Fase 3 (US1), T010: `.app-shell-content > .screen { padding: 0 }`
  // (shell.css) remove o padding duplicado que cortava ~192px de largura
  // útil em toda tela com topbar (Live/Filmes/Séries — mesmo `withShell`
  // da 024/025). Mais espaço pra trilha e grade, sem mudar nenhum dado.
  '11-live-categoria': 'T010 — largura útil maior (padding duplicado removido)',
  '12-live-favoritos-vazio': 'T010 — largura útil maior (padding duplicado removido)',
  '13-filmes-grade': 'T010 — largura útil maior; ver também nota de fixture abaixo',
  '14-filmes-busca-categoria': 'T010 — largura útil maior; ver também nota de fixture abaixo',
  '15-series-grade': 'T010 — largura útil maior (padding duplicado removido)',
  // Fase 3 (US1), T011: `.home-hero { flex: 1 0 420px }` (home.css) — o
  // hero cresce pra ocupar a altura livre do Início, sem rail/card novo.
  '04-inicio': 'T011 — hero cresce pra ocupar a altura livre (FR-004)',
  '05-inicio-modal-sair': 'T011 — mesmo Início por trás do modal, hero maior',
  // Achado da própria Fase 1 (T003): a fixture ganhou 9 categorias de
  // filmes de 1 item cada (`Filmes Grupo 01..09`) DEPOIS da baseline
  // "antes" já capturada, pra também testar a trilha de Filmes
  // transbordando (não só a grade) — sem isso, nenhuma mudança de CSS.
  // Muda a contagem de categorias mostrada em Fontes IPTV, no `import`
  // (mais entradas lidas/gravadas) e na cobertura da Busca ("de 3" vira
  // "de 12" categorias) — nunca o resultado em si.
  '03-importacao-concluida': 'fixture (T003) — 9 categorias de filmes a mais, muda a contagem lida/gravada',
  '06-busca-com-resultado': 'fixture (T003) — cobertura "de 3" -> "de 12" categorias, resultado igual',
  '07-busca-sem-resultado': 'fixture (T003) — cobertura "de 3" -> "de 12" categorias, e a dica de cobertura aparece',
}

/**
 * Abaixo deste número de pixels diferentes, a tela conta como "idêntica"
 * mesmo sem entrada em INTENTIONAL — ruído de rasterização de fonte do
 * Chromium entre dois processos/loads separados (a mesma tela, no MESMO
 * processo, nunca varia; entre "antes" e "depois", que relançam o
 * navegador, uma dúzia de pixels de antialiasing em bordas de texto muda
 * mesmo com DOM/CSS idênticos — achado ao rodar este script: até 72px em
 * telas sem nenhuma mudança de código). Uma diferença de CSS/layout real
 * move uma área muito maior que isso — uma barra de rolagem sozinha já
 * são milhares de pixels.
 */
const NOISE_PIXEL_THRESHOLD = 150

const MODE = process.argv[2]
if (!['antes', 'depois', 'comparar'].includes(MODE)) {
  console.error('Uso: node e2e/paridade-limpeza.mjs antes|depois|comparar')
  process.exit(1)
}

let shots = 0
let diffs = 0

function startFixtureServer() {
  const body = readFileSync(FIXTURE_PATH)
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/** Mesmo binário fixo dos demais scripts quando existe; senão, resolução normal do Playwright. */
async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

/** Reprodução fictícia: dispara o evento sintético do <video> ATUAL (o adaptador de dev não decodifica conteúdo fictício). */
async function fireVideoEvent(page, type) {
  await page.waitForSelector('.player-video', { timeout: 8000 })
  await page.evaluate((eventType) => {
    const video = document.querySelector('.player-video')
    if (video) video.dispatchEvent(new Event(eventType))
  }, type)
}

async function openViaTopbar(page, destination) {
  const ORDER = ['home', 'live', 'movies', 'series', 'profile', 'search', 'settings']
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < ORDER.indexOf(destination); i += 1) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
}

async function waitForRealCategory(page) {
  await page.locator('.side-category-nav-item.tv-focus:not(:has-text("Favoritos")):not(:has-text("Todos"))').waitFor({
    timeout: 8000,
  })
}

/** Determinismo entre capturas: fontes prontas e um respiro fixo (mesmo padrão da 021). */
async function settle(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {})
  await page.waitForTimeout(300)
}

/**
 * Conteúdo que muda sozinho entre "antes" e "depois" (edge case da spec):
 * o relógio da topbar (`.topbar-clock`, `HH:MM`) e o timestamp de
 * sincronização em Fontes IPTV (`.sources-panel-status`, "Sincronizada em
 * DD/MM/AAAA, HH:MM:SS") — achado ao rodar este script, não é diferença de
 * CSS. Mascarado (retângulo opaco), nunca comparado.
 */
const MASK_SELECTORS = ['.topbar-clock', '.sources-panel-status']

async function capture(page, dir, name) {
  await settle(page)
  mkdirSync(dir, { recursive: true })
  const mask = MASK_SELECTORS.map((selector) => page.locator(selector))
  await page.screenshot({ path: path.join(dir, `${name}.png`), mask, maskColor: '#000000' })
  shots += 1
  console.log(`  📸 ${name}`)
}

/** Sequência completa, em 1920×1080, com o app inteiro numa fonte só. */
async function runWalkthrough(page, m3uUrl, outDir) {
  // ---------- Perfis / Adicionar lista / Importação ----------
  await page.goto(APP_URL)
  await page.waitForSelector('.add-card', { timeout: 10000 })
  await capture(page, outDir, '01-perfis-sem-lista')

  await page.keyboard.press('Enter')
  await page.waitForSelector('#add-source-title', { timeout: 8000 })
  await capture(page, outDir, '02-adicionar-lista')

  await page.getByLabel('Nome de exibição').fill('Fonte E2E Limpeza')
  await page.getByLabel('URL da lista M3U').fill(m3uUrl)
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  await page.waitForSelector('text=/Concluída/', { timeout: 20000 })
  await capture(page, outDir, '03-importacao-concluida')

  await page.getByRole('button', { name: 'Abrir lista' }).click()
  await page.waitForSelector('.home-content', { timeout: 8000 })

  // A partir daqui as URLs de vídeo/live não respondem de verdade — interceptamos só o host fictício.
  await page.route('**/limpeza-qa.e2e.test/**', () => {})

  // ---------- Início ----------
  await capture(page, outDir, '04-inicio')

  await page.keyboard.press('Escape') // "Sair?"
  await page.waitForSelector('[role="dialog"]', { timeout: 4000 })
  await capture(page, outDir, '05-inicio-modal-sair')
  await page.keyboard.press('Escape') // fecha o modal (Cancelar já focado)

  // ---------- Configurações ----------
  await openViaTopbar(page, 'settings')
  await page.waitForSelector('.settings-screen', { timeout: 8000 })
  await capture(page, outDir, '08-configuracoes-fontes')

  // Zona inicial é 'tabs' (entrada pela topbar); TABS = [integrations,
  // sources, player, accessibility, parental, about] — "sources" (Fontes,
  // já capturado) é o índice 1, então 2× ArrowDown chega em "accessibility".
  await page.keyboard.press('ArrowDown') // tabs: sources -> player (só move o foco, painel continua "sources")
  await page.keyboard.press('ArrowDown') // tabs: player -> accessibility
  await page.keyboard.press('ArrowRight') // entra no painel (enterPanel)
  await page.waitForSelector('.accessibility-panel-toggle', { timeout: 4000 })
  await capture(page, outDir, '09-configuracoes-acessibilidade')

  await page.keyboard.press('ArrowLeft') // panel -> tabs (exitToTabs, foco continua em "accessibility", índice 3)
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp') // accessibility(3) -> player(2) -> sources(1) -> integrations(0)
  await page.keyboard.press('ArrowRight') // entra no painel "Integrações & BYOK" (mock "Em breve")
  await page.waitForSelector('text=/Em breve/', { timeout: 4000 })
  await capture(page, outDir, '10-configuracoes-em-breve')

  // zona 'tabs' só trata up/down/right — 'left' não sai dela (achado ao
  // rodar este script). Sair pra Início é: exitToTabs (left), depois UP
  // até estourar TABS[0] (vai pra topbar), depois LEFT até "Início" (clamp
  // nas pontas, sobra é inofensiva) e Enter.
  await page.keyboard.press('ArrowLeft') // panel -> tabs
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp') // tabs -> topbar (sobra clampada)
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft') // topbar: settings -> ... -> home (clamp)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.home-content', { timeout: 8000 })

  // ---------- Live TV ----------
  await openViaTopbar(page, 'live')
  await page.waitForSelector('.live-column-groups', { timeout: 8000 })
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight') // trilha -> entra na 1ª categoria real (canais numerosos)
  await page.waitForSelector('.live-item-name, .live-channel-row', { timeout: 8000 })
  await capture(page, outDir, '11-live-categoria')

  await page.keyboard.press('ArrowLeft') // canal -> trilha (foco continua na 1ª categoria real, índice 2)
  // EXATAMENTE 2× — no topo real da trilha (índice 0), ArrowUp não clampa:
  // troca de zona pra topbar (achado ao rodar este script). Um 3º ArrowUp
  // aqui sairia da trilha, e o ArrowRight seguinte iria pro topbar, não
  // pra "★ Favoritos".
  await page.keyboard.press('ArrowUp') // categoria real (2) -> "Todos" (1)
  await page.keyboard.press('ArrowUp') // "Todos" (1) -> "★ Favoritos" (0)
  await page.keyboard.press('ArrowRight') // entra em "★ Favoritos" (vazio — nenhum canal favoritado)
  await page.waitForSelector('text=/Nenhum favorito ainda/', { timeout: 8000 })
  await capture(page, outDir, '12-live-favoritos-vazio')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Escape') // trilha -> Início
  await page.waitForSelector('.home-content', { timeout: 8000 })

  // ---------- Filmes ----------
  await openViaTopbar(page, 'movies')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight') // trilha -> entra em "Filmes"
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
  await capture(page, outDir, '13-filmes-grade')

  // Ícone de busca da categoria (feature 018): topo da coluna de conteúdo.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter') // abre o campo
  await page.waitForFunction(() => document.activeElement?.classList.contains('search-field'), null, { timeout: 4000 })
  await page.keyboard.type('filme 0')
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
  await capture(page, outDir, '14-filmes-busca-categoria')
  await page.keyboard.press('Escape') // fecha o campo
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter') // abre o detalhe do 1º filme
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await capture(page, outDir, '16-detalhe-filme')

  await page.keyboard.press('Enter') // ação primária -> player
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await fireVideoEvent(page, 'playing')
  await capture(page, outDir, '18-player-vod')

  await fireVideoEvent(page, 'error')
  await page.waitForSelector('.player-message', { timeout: 8000 })
  await capture(page, outDir, '20-player-erro')

  await page.keyboard.press('Escape') // fecha o player
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await page.keyboard.press('Escape') // detalhe -> grade
  await page.waitForSelector('.vod-grid', { timeout: 8000 })
  await page.keyboard.press('Escape') // grade -> trilha
  await page.keyboard.press('Escape') // trilha -> Início
  await page.waitForSelector('.home-content', { timeout: 8000 })

  // ---------- Séries ----------
  await openViaTopbar(page, 'series')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight') // trilha -> entra em "Series"
  await page.waitForSelector('.content-card-title', { timeout: 8000 })
  await capture(page, outDir, '15-series-grade')

  await page.keyboard.press('Enter') // abre o detalhe
  await page.waitForSelector('.vod-detail', { timeout: 8000 })
  await capture(page, outDir, '17-detalhe-serie')

  // actions -> tabs -> season -> episodes (3× ArrowDown, `logic/detalhe-vod.md`
  // §6 da 025 — mesma sequência de `filmes-series-ds-v14.mjs`), depois 1×
  // ArrowUp de volta pra "season" antes de abrir o modal.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.waitForSelector('.vod-episode-row', { timeout: 8000 })
  await page.keyboard.press('ArrowUp') // episódios -> temporada
  await page.waitForTimeout(100)
  await page.keyboard.press('Enter') // abre o modal de temporada
  await page.waitForSelector('[role="dialog"][aria-label="Selecionar temporada"]', { timeout: 4000 })
  await capture(page, outDir, '19-detalhe-serie-modal-temporada')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 4000 })

  // ---------- Live com chrome de faixa ----------
  await page.keyboard.press('Escape') // detalhe -> grade
  await page.waitForSelector('.vod-grid', { timeout: 8000 })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.home-content', { timeout: 8000 })

  await openViaTopbar(page, 'live')
  await waitForRealCategory(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForSelector('.live-item-name, .live-channel-row', { timeout: 8000 })
  await page.keyboard.press('Enter') // toca o 1º canal
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
  await fireVideoEvent(page, 'playing')
  await capture(page, outDir, '21-player-live-faixa')
  await page.keyboard.press('Escape') // fecha o player
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8000 })
  await page.keyboard.press('ArrowLeft') // canal -> trilha
  await page.keyboard.press('Escape') // trilha -> Início
  await page.waitForSelector('.home-content', { timeout: 8000 })

  // ---------- Busca (depois de Live/Filmes/Séries: a busca global só cobre categoria já carregada) ----------
  await openViaTopbar(page, 'search')
  await page.waitForSelector('.search-screen', { timeout: 8000 })
  const searchField = page.locator('input#search-field')
  await searchField.waitFor({ timeout: 8000 })
  await page.keyboard.press('Enter') // abre o teclado
  await page.waitForFunction(() => document.activeElement === document.querySelector('#search-field'), null, {
    timeout: 4000,
  })
  await searchField.fill('filme 01')
  await page.waitForSelector('.search-row', { timeout: 8000 })
  await capture(page, outDir, '06-busca-com-resultado')

  await searchField.fill('zzz-sem-resultado')
  await page.waitForSelector('text=/Nada encontrado/', { timeout: 8000 })
  await capture(page, outDir, '07-busca-sem-resultado')
  await page.keyboard.press('Escape') // fecha o teclado
  await page.keyboard.press('Escape') // sai da Busca
  await page.waitForSelector('.home-content', { timeout: 8000 })
}

async function run() {
  const server = await startFixtureServer()
  const { port } = server.address()
  // O host fictício `limpeza-qa.e2e.test` só existe DENTRO do conteúdo do M3U
  // (URLs de playback, nunca resolvidas de verdade — page.route() as
  // intercepta antes de qualquer DNS). A busca do M3U em si usa o servidor
  // HTTP local de verdade, abaixo.
  const m3uUrl = `http://127.0.0.1:${port}/limpeza-qa.m3u`
  const outDir = path.join(OUT_ROOT, MODE)

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  // Determinismo (`logic/migracao-css.md` §5): reduzir movimento ligado
  // ANTES do primeiro load — sem isso, uma captura pega um modal/painel no
  // meio da transição de 180ms (`ccp-toast`) e a outra não, um punhado de
  // pixels de antialiasing por vez (achado ao rodar este script: 10px no
  // modal de temporada, mesmo com o `settle()` de 300ms).
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('ccplaytv:reduce-motion', 'true')
    } catch {
      // Sem localStorage (raro fora da TV) — a captura fica sujeita à
      // mesma janela de animação; não é motivo pra travar o script.
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('  [pageerror]', error))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text())
  })

  try {
    console.log(`=== Capturando telas (1920×1080) — modo "${MODE}" ===`)
    await runWalkthrough(page, m3uUrl, outDir)
  } catch (error) {
    console.error('  ✗ ERRO NÃO TRATADO:', error)
    process.exitCode = 1
  } finally {
    await context.close()
    await browser.close()
    server.close()
  }

  console.log('')
  console.log(`${shots} captura(s) salvas em ${outDir}`)
  if (process.exitCode !== 1) {
    console.log(
      MODE === 'antes'
        ? 'Baseline "antes" pronta. Rode de novo com "depois" após cada rodada de mudança, e "comparar" para checar.'
        : 'Capturas "depois" prontas — rode "comparar" para checar contra evidencias/paridade/antes/.',
    )
  }
}

// ---------- Modo "comparar": diff pixel a pixel via <canvas>, sem dependência nova ----------

/**
 * Tudo — carregar os dois PNGs, desenhar em <canvas> e comparar pixel a
 * pixel — roda DENTRO do navegador, num único `page.evaluate`: só o
 * resultado (contagem + retângulo) atravessa a fronteira Node↔browser.
 * Transferir os ~8M pixels de um frame 1920×1080 via JSON (a 1ª versão
 * deste script fazia isso com `Array.from(data)`) trava o processo por
 * minutos — achado rodando este script pela 1ª vez.
 */
async function diffPair(page, antesPath, depoisPath) {
  const [antesB64, depoisB64] = [readFileSync(antesPath).toString('base64'), readFileSync(depoisPath).toString('base64')]
  return page.evaluate(async ({ antesDataUrl, depoisDataUrl }) => {
    async function toImageData(dataUrl) {
      const img = new Image()
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      img.src = dataUrl
      await loaded
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    const [a, b] = await Promise.all([toImageData(antesDataUrl), toImageData(depoisDataUrl)])
    if (a.width !== b.width || a.height !== b.height) {
      return { sizeMismatch: true, aSize: [a.width, a.height], bSize: [b.width, b.height] }
    }

    let minX = a.width
    let minY = a.height
    let maxX = -1
    let maxY = -1
    let count = 0
    for (let y = 0; y < a.height; y += 1) {
      for (let x = 0; x < a.width; x += 1) {
        const i = (y * a.width + x) * 4
        if (
          a.data[i] !== b.data[i] ||
          a.data[i + 1] !== b.data[i + 1] ||
          a.data[i + 2] !== b.data[i + 2] ||
          a.data[i + 3] !== b.data[i + 3]
        ) {
          count += 1
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    return count === 0 ? { count: 0 } : { count, box: `(${minX},${minY})–(${maxX},${maxY})` }
  }, { antesDataUrl: `data:image/png;base64,${antesB64}`, depoisDataUrl: `data:image/png;base64,${depoisB64}` })
}

async function compare() {
  const antesDir = path.join(OUT_ROOT, 'antes')
  const depoisDir = path.join(OUT_ROOT, 'depois')
  if (!existsSync(antesDir) || !existsSync(depoisDir)) {
    console.error(`Faltam capturas: rode "antes" e "depois" primeiro (${antesDir} / ${depoisDir}).`)
    process.exit(1)
  }

  const names = readdirSync(antesDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.replace(/\.png$/, ''))
    .sort()

  const browser = await launchBrowser()
  const page = await browser.newPage()

  for (const name of names) {
    const antesPath = path.join(antesDir, `${name}.png`)
    const depoisPath = path.join(depoisDir, `${name}.png`)
    if (!existsSync(depoisPath)) {
      console.error(`  ✗ ${name}: sem captura "depois" correspondente`)
      diffs += 1
      continue
    }
    const diff = await diffPair(page, antesPath, depoisPath)
    if (diff.sizeMismatch) {
      console.error(`  ✗ ${name}: dimensão mudou (${diff.aSize.join('×')} -> ${diff.bSize.join('×')})`)
      diffs += 1
      continue
    }
    if (diff.count === 0) {
      console.log(`  ✓ ${name}: idêntico`)
      continue
    }
    if (diff.count < NOISE_PIXEL_THRESHOLD) {
      console.log(`  ✓ ${name}: ${diff.count} px diferentes em ${diff.box} — ruído de fonte (abaixo do limiar)`)
      continue
    }
    if (name in INTENTIONAL) {
      console.log(`  ~ ${name}: ${diff.count} px diferentes em ${diff.box} — intencional (${INTENTIONAL[name]})`)
      continue
    }
    console.error(`  ✗ ${name}: ${diff.count} px diferentes em ${diff.box} — NÃO listada em INTENTIONAL`)
    diffs += 1
  }

  await browser.close()

  console.log('')
  if (diffs > 0) {
    console.error(`${diffs} tela(s) com diferença não explicada.`)
    process.exitCode = 1
  } else {
    console.log('Paridade confirmada: nenhuma diferença fora de INTENTIONAL.')
  }
}

if (MODE === 'comparar') {
  await compare()
} else {
  await run()
}
