import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  plugins: [react()],
  build: { target: 'chrome108' },
  server: { proxy: { '/portal/v1': 'http://127.0.0.1:3001' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
