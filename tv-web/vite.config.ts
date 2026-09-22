import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
})
