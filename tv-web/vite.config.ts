import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: o pacote Tizen (.wgt) não é servido a partir de uma
  // raiz de domínio convencional.
  base: './',
  build: {
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
})
