import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// Testes `.ts` que precisam de DOM (ver o comentário em `test.projects`).
const TESTES_TS_COM_DOM = [
  'src/navigation/lastSource.test.ts',
  'src/features/shell/clock.test.ts',
  'src/lib/imeProbe.test.ts',
  'src/lib/motionPreference.fundacao-visual.contract.test.ts',
  'src/lib/motionPreference.test.ts',
  'src/lib/onlineStatus.test.ts',
  'src/lib/tizenColorKey.remove.test.ts',
  'src/lib/tizenColorKey.test.ts',
  'src/lib/tizenExit.test.ts',
  'src/lib/tizenMediaKeys.test.ts',
  'src/lib/catalog/sourceConnectionCheck.ime-formularios.contract.test.ts',
  'src/lib/catalog/sourceConnectionCheck.test.ts',
  'src/lib/focus/usePosterColumnWidth.test.ts',
  'src/lib/focus/useScrollFocusedIntoView.test.ts',
  'src/lib/focus/useVirtualFocusSync.test.ts',
  'src/lib/metadata/titleMetadata.oculto.test.ts',
  'src/lib/perf/entryTiming.test.ts',
  'src/lib/player/avplayAdapter.aspect.test.ts',
  'src/lib/player/avplayAdapter.quality.test.ts',
  'src/lib/player/avplayAdapter.test.ts',
  'src/lib/player/avplayAdapter.tracks.test.ts',
  'src/lib/player/htmlVideoAdapter.aspect.test.ts',
  'src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts',
  'src/lib/player/htmlVideoAdapter.streamInfo.test.ts',
  'src/lib/player/htmlVideoAdapter.test.ts',
]

// Versão exibida em Configurações › Sobre (feature 026, D-012) vem do mesmo
// pacote que é instalado na TV — nunca uma constante duplicada que poderia
// divergir dele. Falha explícita aqui é melhor que uma versão inventada.
const configXmlPath = fileURLToPath(new URL('../CCPlayTv/config.xml', import.meta.url))
const configXml = readFileSync(configXmlPath, 'utf-8')
const widgetVersionMatch = configXml.match(/<widget\b[^>]*\bversion="([^"]+)"/)
if (!widgetVersionMatch) {
  throw new Error(
    `vite.config.ts: não encontrei version="…" no elemento <widget> de ${configXmlPath} — build interrompido (D-012 da feature 026, nunca uma versão inventada).`,
  )
}
const appVersion = widgetVersionMatch[1]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // Feature 047: `mpegts.js` só é carregada por `import()` dinâmico no
  // adaptador de dev (`lib/player/devDemux.ts`). Sem pré-otimizá-la, o Vite a
  // descobre no meio da reprodução e RECARREGA a página. Só afeta `npm run
  // dev`; o build de produção não a inclui (verificado por
  // `scripts/check-no-demux-in-build.mjs`).
  optimizeDeps: {
    include: ['mpegts.js'],
  },
  // Caminhos relativos: o pacote Tizen (.wgt) não é servido a partir de uma
  // raiz de domínio convencional.
  base: './',
  build: {
    // Alvo do engine da TV, não do navegador do desenvolvedor (ADR-006 §2).
    // A TV de referência é a Samsung QN50Q60DAGXZD — Tizen 8.0 / Chromium 108.
    // O padrão do Vite 8 é 'baseline-widely-available', que equivale a
    // Chrome 111: três versões ACIMA do alvo, ou seja, o build poderia emitir
    // sintaxe que a TV não executa. Isso aparece como tela preta, que é
    // indistinguível de uma falha do AVPlay — por isso o alvo é explícito
    // aqui (spec 003, risco R-004).
    //
    // Transpilar sintaxe não adiciona APIs ausentes: qualquer API de runtime
    // que o Chromium 108 não tenha continua exigindo verificação no aparelho.
    target: 'chrome108',
    // CSS tem alvo próprio porque a limitação de CSS de uma TV não acompanha
    // necessariamente a de JS (ex.: notação de cor mais nova).
    cssTarget: 'chrome108',
    // Empacotamento Tizen (.wgt) não usa CDN/cache-busting — a versão é o
    // config.xml do pacote. Nomes fixos evitam ter que reescrever a lista
    // "files:" de tizen_web_project.yaml a cada build (ver scripts/sync-tizen.mjs).
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  // O Worker de importação é emitido como arquivo próprio, e o pacote Tizen
  // lista arquivos explicitamente (R-002). Nome com hash obrigaria a
  // reescrever `tizen_web_project.yaml` a cada build — e um arquivo fora da
  // lista falha **só na TV**, nunca no navegador nem nos testes.
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
      },
    },
  },
  server: {
    fs: {
      // O teste de paridade (SC-013) lê a MESMA fixture que a suíte do
      // backend usa, em vez de manter uma cópia que divergiria em silêncio.
      // Isso exige liberar um caminho fora da raiz deste projeto.
      //
      // A liberação é **só da pasta de fixtures**, nunca de `..`: a raiz do
      // repositório contém `docs/m3u/dados.md`, com credenciais reais de
      // provedor, e o servidor de desenvolvimento escuta na rede local.
      // Liberar o diretório pai serviria esse arquivo por HTTP para quem
      // estivesse na mesma rede. Não amplie esta lista.
      allow: ['.', '../api/tests/fixtures'],
    },
  },
  test: {
    // Dois projetos porque subir o jsdom custa ~5 s por arquivo (medido em
    // 2026-10: carregar o módulo ~2,6 s + setup; ambiente node ~1,2 s). Telas e
    // componentes (.tsx) precisam de DOM; lógica pura (.ts) não.
    //
    // `*.test.ts` roda em `node` por padrão. Os que usam `window`/`document`/
    // `localStorage`/`HTMLMediaElement` ficam listados aqui em vez de levarem
    // um `// @vitest-environment jsdom` no arquivo, porque vários são contratos
    // travados por SHA256 (editar o arquivo quebraria a trava). Um teste `.ts`
    // novo que falhe com "window/document is not defined" entra nesta lista
    // (ou ganha o docblock, se não for contrato travado).
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/setupTests.ts'],
          include: ['src/**/*.test.tsx', ...TESTES_TS_COM_DOM],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['./src/setupTests.node.ts'],
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
          exclude: [...configDefaults.exclude, ...TESTES_TS_COM_DOM],
        },
      },
    ],
  },
})
