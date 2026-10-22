/**
 * A trava de segurança do roteiro automático (feature 087).
 *
 * Existe por causa de um incidente real: na primeira tentativa a sonda despachou as teclas no mesmo tick, o foco não
 * andou (ele é estado do React, ADR-009) e o `Enter` caiu num card de "Continue assistindo" — a TV começou a tocar uma
 * série sozinha. A regra que impede isso de repetir é simples: **`Enter` só sai com o foco no item da topbar**,
 * reconhecido pelo texto. Um card nunca se chama "Filmes".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { irPara } from './autopilot'

function montarTela(focado: string, extra = ''): void {
  document.body.innerHTML = `
    <nav>
      <span class="nav-item">Início</span>
      <span class="nav-item">TV ao vivo</span>
      <span class="nav-item">Filmes</span>
      <span class="nav-item">Séries</span>
    </nav>
    <div class="home-content"><div class="card ${focado === 'card' ? 'tv-focus' : ''}">Série Que Eu Assistia</div></div>
    ${extra}
  `
  if (focado !== 'card') {
    const alvo = [...document.querySelectorAll('.nav-item')].find((el) => el.textContent === focado)
    alvo?.classList.add('tv-focus')
  }
}

let teclas: string[]

beforeEach(() => {
  teclas = []
  vi.spyOn(document, 'dispatchEvent').mockImplementation((evento) => {
    if (evento instanceof KeyboardEvent && evento.type === 'keydown') teclas.push(evento.key)
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('a trava do roteiro automático (087)', () => {
  // O incidente: foco num card, e a navegação não consegue chegar à topbar (aqui o foco nunca muda, como quando o
  // React agrupa as teclas). Nada pode ser acionado.
  it('com o foco fora da topbar, desiste sem nunca acionar — é o que impede a reprodução acidental', async () => {
    montarTela('card')
    await expect(irPara('movies')).resolves.toBe(false)
    expect(teclas).not.toContain('Enter')
    expect(teclas.length).toBeGreaterThan(0)
  })

  // Mesmo chegando à topbar, se o foco parar no item ERRADO não se aciona: abrir "TV ao vivo" no lugar de "Filmes"
  // estragaria a medição em silêncio.
  it('na topbar mas fora do destino, também desiste sem acionar', async () => {
    montarTela('TV ao vivo')
    await expect(irPara('movies')).resolves.toBe(false)
    expect(teclas).not.toContain('Enter')
  })

  it('com o foco no destino, aciona e espera a vitrine', async () => {
    montarTela('Filmes', '<div class="vod-showcase"></div>')
    await expect(irPara('movies')).resolves.toBe(true)
    expect(teclas).toContain('Enter')
  })
})
