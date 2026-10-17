import { defineConfig } from '@playwright/test'
// Projeto padrão: os specs e os contratos (cada um define a própria largura). Os três projetos de largura só rodam o
// `layout.spec.ts` (feature 077, FR-016): celular 360, tablet 768 e PC 1280.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5174', locale: 'pt-BR' },
  projects: [
    { name: 'default', testIgnore: /layout\.spec/ },
    { name: 'mobile', testMatch: /layout\.spec/, use: { viewport: { width: 360, height: 740 }, hasTouch: true } },
    { name: 'tablet', testMatch: /layout\.spec/, use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop', testMatch: /layout\.spec/, use: { viewport: { width: 1280, height: 800 } } },
  ],
})
