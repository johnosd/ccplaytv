import { expect, type Page } from '@playwright/test'

/**
 * Espera o painel do portal ficar quieto (nenhuma requisição `/portal/v1/` em voo e nenhuma nova entre duas leituras).
 *
 * Por quê: a leitura compartilhada do portal (`useTvData`) é serializada — um gatilho disparado com uma leitura em voo é descartado —
 * e um 401/estado trocado no meio dela cai na leitura antiga. Em paralelo (vários workers num só dev server) isso abre uma corrida
 * entre o teste e o app. Chamar `quiet()` antes de mudar o que o serviço fictício responde fecha a janela, sem `waitForTimeout`.
 * Registre o auxiliar ANTES de `page.goto`.
 */
export function trackPortalTraffic(page: Page) {
  let inFlight = 0
  let total = 0
  const isPortal = (request: { url(): string }) => new URL(request.url()).pathname.startsWith('/portal/v1/')
  page.on('request', request => { if (isPortal(request)) { inFlight++; total++ } })
  page.on('requestfinished', request => { if (isPortal(request)) inFlight-- })
  page.on('requestfailed', request => { if (isPortal(request)) inFlight-- })
  return {
    async quiet() {
      let seen = -1
      await expect.poll(() => { const stable = inFlight === 0 && total === seen; seen = total; return stable }, { intervals: [250], timeout: 10000 }).toBe(true)
    },
  }
}
