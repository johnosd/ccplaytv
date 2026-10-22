/**
 * Roteiro automático de medição na TV (feature 087).
 *
 * **Só existe no build de medição**: `main.tsx` o chama dentro de `if (import.meta.env.VITE_CCPLAY_AUTOPILOT === '1')`,
 * e o ramo morto tira o módulo do pacote normal (verificado nos dois builds).
 *
 * Por que existe: medir fluidez na TV dependia de alguém com cronômetro navegando 60 s em cada tela, duas vezes. Isso é
 * lento e, pior, **não é comparável** entre rodadas — foi o que deixou o SC-009 da feature 086 sem veredito. Aqui a
 * cadência, o número de teclas e a duração são fixos, então duas rodadas medem a mesma coisa.
 *
 * ## Duas lições da primeira tentativa, que tocou uma série por engano
 *
 * 1. **Uma tecla por vez, com espera.** O foco deste app é estado do React (ADR-009), não `document.activeElement`:
 *    despachar as teclas no mesmo tick faz o React agrupar tudo e o foco andar **um** passo. A navegação é em laço
 *    fechado — anda uma tecla, confere onde o foco está, repete.
 * 2. **`Enter` só com o foco comprovadamente no item da topbar**, conferido pelo texto. Sem essa trava, um `Enter` com
 *    o foco numa fileira abre o item e começa a reprodução. Um card nunca se chama "Filmes", então não há como dar play
 *    por acidente: se o destino não for alcançado, a janela é abandonada e reportada.
 *
 * As teclas são despachadas em `document`, de onde `useRemoteNav` as escuta (ele lê `event.key`); elas sobem para
 * `window`, onde o portão de atividade da pré-carga as conta — ou seja, valem como navegação de verdade.
 */

import { emitMetric } from './metricsChannel'

/** Uma tecla a cada 300 ms: navegação atenta, não repetição de tecla presa. */
const CADENCIA_MS = 300
/** Espera depois de cada tecla de navegação de menu — o foco precisa de um render para andar. */
const PASSO_MS = 220
/** Duração fixa por janela de medição. */
const JANELA_MS = 60_000
/** Quantos cards percorrer antes de descer de fileira. */
const PASSOS_POR_FILEIRA = 8
/**
 * Piso de `ArrowUp` para voltar da vitrine ate a topbar (feature 089, FR-009).
 *
 * **Era 12, fixo — e por isso metade das janelas de cada rodada era abandonada.** A profundidade da vitrine escala com
 * o número de CATEGORIAS da lista, medido no ensaio do T014: **6 categorias -> 9 subidas; 34 categorias -> 31**. A
 * lista de referência da TV tem 34 categorias de filmes, logo ~31 subidas eram necessárias e 12 nunca voltavam:
 * `irPara` devolvia `false` e a janela virava `falhas`. As três rodadas de 2026-10-22 fecharam com `falhas = 2` por
 * isto. Ver `sdd/specs/089-.../logic/atraso-e-sonda.md` §2.
 *
 * O piso cobre o caso em que a lista lateral ainda não montou; `passosAteTopbar()` deriva do DOM para cobrir QUALQUER
 * número de categorias — um literal voltaria a descolar numa lista maior.
 */
const PISO_ATE_TOPBAR = 69
/** Fileiras calculadas acima das categorias (Continue assistindo, Favoritos, Adicionados...), com folga. */
const MARGEM_FILEIRAS = 12

/**
 * Quantas subidas tentar. Não custa nada no caminho feliz: `andarAte` confere o destino **antes** de cada tecla e sai
 * na primeira vez que ele vale.
 */
function passosAteTopbar(): number {
  const categorias = document.querySelectorAll('.vod-showcase .side-category-nav-item').length
  return Math.max(PISO_ATE_TOPBAR, categorias + MARGEM_FILEIRAS)
}

/** Rótulos da topbar nos três idiomas (`i18n/messages/shell.ts`) — é por eles que o foco é reconhecido. */
const ROTULOS: Record<'home' | 'live' | 'movies' | 'series' | 'radio', readonly string[]> = {
  home: ['Início', 'Home', 'Inicio'],
  live: ['TV ao vivo', 'Live TV', 'TV en vivo'],
  movies: ['Filmes', 'Movies', 'Películas'],
  series: ['Séries', 'Series'],
  radio: ['Rádio', 'Radio'],
}
const TODOS_OS_ROTULOS: readonly string[] = Object.values(ROTULOS).flat()

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function tecla(key: string): void {
  for (const type of ['keydown', 'keyup'] as const) {
    document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }))
  }
}

/** Texto do elemento com o foco de estado agora. */
function focoTexto(): string {
  return (document.querySelector('.tv-focus')?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function esperarSeletor(seletor: string, timeoutMs = 20_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    if (document.querySelector(seletor) !== null) return true
    await esperar(200)
  }
  return false
}

/** Anda uma tecla por vez, com espera, até `pronto()` ou até esgotar os passos. */
async function andarAte(key: string, passos: number, pronto: () => boolean): Promise<boolean> {
  for (let passo = 0; passo < passos; passo += 1) {
    if (pronto()) return true
    tecla(key)
    await esperar(PASSO_MS)
  }
  return pronto()
}

interface Medida {
  fps: number
  worstMs: number
  over50: number
  quadros: number
}

/** Cadência de pintura vista pelo app enquanto `trabalho` roda — a mesma conta da sonda da feature 082. */
async function medir(trabalho: () => Promise<void>): Promise<Medida> {
  const intervalos: number[] = []
  let anterior = performance.now()
  let rodando = true
  const passo = (agora: number): void => {
    intervalos.push(agora - anterior)
    anterior = agora
    if (rodando) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
  await trabalho()
  rodando = false
  const total = intervalos.reduce((soma, valor) => soma + valor, 0)
  let pior = 0
  let longos = 0
  for (const intervalo of intervalos) {
    if (intervalo > pior) pior = intervalo
    if (intervalo > 50) longos += 1
  }
  return {
    fps: total > 0 ? Math.round((intervalos.length / total) * 1000) : 0,
    worstMs: Math.round(pior),
    over50: longos,
    quadros: intervalos.length,
  }
}

/**
 * Leva o foco ao item `destino` da topbar e aciona. **Devolve `false` sem acionar nada** se não chegar lá: é esta
 * recusa que impede um `Enter` de abrir conteúdo e começar a reprodução.
 */
export async function irPara(destino: 'movies' | 'series'): Promise<boolean> {
  const alvo = ROTULOS[destino]
  const naTopbar = (): boolean => TODOS_OS_ROTULOS.includes(focoTexto())
  const noAlvo = (): boolean => alvo.includes(focoTexto())

  if (!(await andarAte('ArrowUp', passosAteTopbar(), naTopbar))) return false
  if (!noAlvo()) await andarAte('ArrowRight', 8, noAlvo)
  if (!noAlvo()) await andarAte('ArrowLeft', 8, noAlvo)
  if (!noAlvo()) return false

  tecla('Enter')
  return esperarSeletor('.vod-showcase')
}

/** O foco está numa fileira de cards (e não na lista lateral de categorias)? */
function naFileira(): boolean {
  return document.querySelector('.vod-showcase .vod-row .tv-focus') !== null
}

/**
 * Navega entre cards e fileiras pela duração pedida, **só com setas**, em malha fechada. Devolve quantas teclas foram.
 *
 * Por que em malha fechada (feature 089): o roteiro antigo dava `PASSOS_POR_FILEIRA` teclas horizontais **cegas**. Ao
 * chegar no primeiro cartão, o `←` seguinte devolve o foco à lista lateral de categorias — comportamento correto do app
 * (features 052/053) — e dali os `→` **paginam a lista** em vez de andar nos cards. Medido no PC com 34 categorias:
 * **53% das teclas caíam na lista lateral**, então a sonda media metade navegação de categoria quando dizia medir
 * navegação de cards. Agora, se o foco sai das fileiras, uma tecla o devolve e o ciclo segue.
 */
async function navegar(duracaoMs: number): Promise<number> {
  const fim = Date.now() + duracaoMs
  let teclas = 0
  const andar = async (key: string): Promise<void> => {
    tecla(key)
    teclas += 1
    await esperar(CADENCIA_MS)
  }
  /** Anda na horizontal enquanto o foco continuar numa fileira; saiu, devolve com uma tecla contrária e para. */
  const andarNaFileira = async (key: string, volta: string): Promise<void> => {
    for (let passo = 0; passo < PASSOS_POR_FILEIRA && Date.now() < fim; passo += 1) {
      await andar(key)
      if (!naFileira()) {
        await andar(volta)
        return
      }
    }
  }
  while (Date.now() < fim) {
    await andarNaFileira('ArrowRight', 'ArrowLeft')
    if (Date.now() < fim) await andar('ArrowDown')
    await andarNaFileira('ArrowLeft', 'ArrowRight')
    if (Date.now() < fim) await andar('ArrowDown')
  }
  return teclas
}

async function umaJanela(screen: 'movies' | 'series', janela: number): Promise<void> {
  // Entra nos cards a partir da lista lateral de categorias, uma tecla por vez.
  await andarAte('ArrowRight', 20, () => document.querySelector('.vod-showcase .vod-row .tv-focus') !== null)
  let teclas = 0
  const medida = await medir(async () => {
    teclas = await navegar(JANELA_MS)
  })
  // `autopilot: 1` separa estas linhas das janelas automáticas de ~5 s; `screen` já é rótulo permitido no canal.
  emitMetric({ source: 'frames', autopilot: 1, janela, screen, windowMs: JANELA_MS, teclas, ...medida })
}

/**
 * Entra na primeira lista, espera a Início, e mede duas janelas de 60 s em Filmes e duas em Séries.
 *
 * Não reabre o app entre as janelas (não dá, de dentro dele): isto mede **fluidez ao navegar** (SC-007). O tempo de
 * abertura (SC-008) continua vindo das linhas `assembly`, que saem a cada abertura de tela de qualquer jeito.
 *
 * `falhas` conta as janelas abandonadas por não ter chegado ao destino — número que vai na linha final, para uma
 * rodada sem medida nenhuma não parecer uma rodada boa.
 */
export async function startAutopilot(): Promise<void> {
  if (await esperarSeletor('.source-card')) {
    tecla('Enter')
    await esperarSeletor('.home-content')
  }
  // Deixa a primeira revelação acontecer e a carga da lista começar, como numa sessão real.
  await esperar(8_000)
  let falhas = 0
  for (let janela = 1; janela <= 2; janela += 1) {
    for (const screen of ['movies', 'series'] as const) {
      if (!(await irPara(screen))) {
        falhas += 1
        continue
      }
      await esperar(1_500)
      await umaJanela(screen, janela)
    }
  }
  emitMetric({ source: 'frames', autopilot: 1, janela: 0, teclas: 0, falhas })
}
