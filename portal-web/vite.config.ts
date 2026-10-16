import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Só no servidor de desenvolvimento: o serviço aceita apenas a origem oficial do site (`http://127.0.0.1:<porta>`), e abrir
 * `localhost:<porta>` faz o login falhar com 403 `invalid_origin` ("Acesso inválido"). Redireciona para o endereço certo.
 */
function loopbackRedirect(): Plugin {
  return {
    name: 'portal-loopback-redirect',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const host = request.headers.host ?? ''
        if (!/^localhost(:\d+)?$/i.test(host)) return next()
        response.statusCode = 302
        response.setHeader('Location', 'http://' + host.replace(/^localhost/i, '127.0.0.1') + (request.url ?? '/'))
        response.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), loopbackRedirect()],
  build: { target: 'chrome108' },
  server: { proxy: { '/portal/v1': process.env.PORTAL_API_ORIGIN ?? 'http://127.0.0.1:3001' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
