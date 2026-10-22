// Contratos da feature 089 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar, nunca editá-los.
//
// A feature 089 mexe em `autopilot.ts` para consertar o `falhas = 2` (FR-009). O risco mais caro desse conserto é
// reintroduzir o incidente da 087: a sonda apertou `Enter` com o foco num card e a TV começou a tocar uma série
// sozinha. Estes dois testes fixam as duas metades: a sonda **alcança** a topbar de qualquer profundidade, e **não
// aciona** nada fora do destino. `autopilot.test.ts` (não travado) continua cobrindo o resto.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { irPara } from './autopilot'

/**
 * Monta a tela com o foco a `profundidade` fileiras abaixo da topbar: cada `ArrowUp` sobe uma, e só ao chegar em zero
 * o foco aparece no item da topbar. Reproduz o que acontece na TV depois de 60 s navegando — a navegação desce ~22
 * fileiras, e o limite antigo de 12 passos não voltava.
 */
function montarComProfundidade(profundidade: number, destino: string): () => string[] {
  let restam = profundidade
  document.body.innerHTML = `
    <nav>
      <span class="nav-item">Início</span>
      <span class="nav-item">TV ao vivo</span>
      <span class="nav-item">Filmes</span>
      <span class="nav-item">Séries</span>
    </nav>
    <div class="vod-showcase"><div class="vod-row"><div class="card tv-focus">Um Título Qualquer</div></div></div>
  `
  const teclas: string[] = []
  vi.spyOn(document, 'dispatchEvent').mockImplementation((evento) => {
    if (!(evento instanceof KeyboardEvent) || evento.type !== 'keydown') return true
    teclas.push(evento.key)
    if (evento.key === 'ArrowUp' && restam > 0) {
      restam -= 1
      if (restam === 0) {
        document.querySelector('.card')?.classList.remove('tv-focus')
        const alvo = [...document.querySelectorAll('.nav-item')].find((el) => el.textContent === destino)
        alvo?.classList.add('tv-focus')
      }
    }
    return true
  })
  return () => teclas
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('a sonda alcança as quatro janelas (089)', () => {
  // US3/AC1 + FR-009: a causa do `falhas = 2` das três rodadas de 2026-10-22. `navegar()` desce ~22 fileiras numa
  // janela de 60 s (200 teclas ÷ 18 por ciclo × 2 descidas), e `irPara` só subia 12 — então metade de cada rodada de
  // TV era desperdiçada. Ver logic/atraso-e-sonda.md §2.
  it('volta à topbar de 25 fileiras abaixo, onde o limite antigo de 12 passos desistia', async () => {
    const teclas = montarComProfundidade(25, 'Séries')

    await expect(irPara('series')).resolves.toBe(true)
    expect(teclas().filter((key) => key === 'ArrowUp').length).toBeGreaterThanOrEqual(25)
    expect(teclas()).toContain('Enter')
  }, 30_000)

  // Constitution "Toda Ação Essencial Tem Caminho Completo por Controle Remoto" / "Foco Visível e Sem Becos Sem
  // Saída": focar nunca inicia reprodução. Aumentar o limite de passos NÃO pode afrouxar a trava — se o foco não
  // chegou ao rótulo do destino, nada é acionado, e a janela é abandonada de propósito.
  it('mesmo com o limite maior, não aciona nada quando o foco nunca alcança a topbar', async () => {
    // Profundidade inalcançável: o foco nunca sai do card, como quando o React agrupa as teclas.
    const teclas = montarComProfundidade(9999, 'Séries')

    await expect(irPara('series')).resolves.toBe(false)
    expect(teclas()).not.toContain('Enter')
    // E desiste só DEPOIS de tentar de verdade: com o limite antigo de 12 passos, uma janela de 60 s (que desce ~22
    // fileiras) era abandonada sem nunca ter chance de voltar. O limite novo precisa cobrir essa profundidade.
    expect(teclas().filter((key) => key === 'ArrowUp').length).toBeGreaterThanOrEqual(50)
  }, 30_000)
})
