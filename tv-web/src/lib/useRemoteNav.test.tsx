import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_SELECT_MS, useRemoteNav } from './useRemoteNav'
import { FAVORITE_COLOR_KEY } from './tizenColorKey'

describe('useRemoteNav', () => {
  afterEach(() => cleanup())

  it('a tecla RETURN do controle Samsung (keyCode 10009) aciona onBack', () => {
    const onBack = vi.fn()
    renderHook(() => useRemoteNav({ onBack }))

    // O aparelho entrega o código de plataforma sem um event.key equivalente
    // a Backspace/Escape — tratar só pelo nome deixava o Voltar inerte na TV.
    fireEvent.keyDown(document, { keyCode: 10009 })

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('Backspace e Escape continuam acionando onBack (caminho do desktop)', () => {
    const onBack = vi.fn()
    renderHook(() => useRemoteNav({ onBack }))

    fireEvent.keyDown(document, { key: 'Backspace' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('a tecla de voltar chama preventDefault, para a plataforma não encerrar o app', () => {
    renderHook(() => useRemoteNav({ onBack: () => {} }))

    const event = new KeyboardEvent('keydown', { keyCode: 10009, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('sem onSelect, Enter não chama preventDefault (deixa a ativação nativa do botão focado acontecer)', () => {
    // Telas de roving DOM focus (AddSourceScreen, ImportProgressScreen) não
    // passam onSelect e contam com o navegador ativar o <button>/<input>
    // com foco real — reprodução do bug relatado na TV física: sem essa
    // guarda, o preventDefault suprimia essa ativação sem nada no lugar.
    renderHook(() => useRemoteNav({ onBack: () => {} }))

    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('com onSelect, Enter continua chamando preventDefault e o handler (telas de foco gerenciado 2D)', () => {
    const onSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onBack: () => {} }))

    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    document.dispatchEvent(event)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('tecla não mapeada não aciona nenhum handler', () => {
    const onBack = vi.fn()
    const onSelect = vi.fn()
    const onDirection = vi.fn()
    renderHook(() => useRemoteNav({ onBack, onSelect, onDirection }))

    fireEvent.keyDown(document, { key: 'a' })

    expect(onBack).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDirection).not.toHaveBeenCalled()
  })

  it('sem alvo editável, Backspace/espaço/Enter continuam exatamente como antes (regressão da guarda de campo, feature 017)', () => {
    const onBack = vi.fn()
    const onSelect = vi.fn()
    renderHook(() => useRemoteNav({ onBack, onSelect }))

    // `event.target` de um `fireEvent` sem alvo explícito é `document` —
    // nunca um campo editável.
    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(onBack).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

/**
 * Gesto de OK curto x OK demorado (feature 013, `logic/gesto-ok-longo.md`).
 * Sem `onLongSelect`, o hook continua agindo no keydown (casos acima); com
 * ele, o OK vira um gesto decidido pelo keyup/limiar, aqui exercitado com
 * timers falsos porque depende de tempo decorrido entre eventos.
 */
describe('useRemoteNav — onLongSelect (clique demorado, feature 013)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('sem onLongSelect, o OK continua agindo no keydown (regressão)', () => {
    const onSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect }))

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)

    fireEvent.keyUp(document, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1) // keyup não repete a ação
  })

  it('OK curto (solta antes do limiar) chama só onSelect, no keyup', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled() // não age no keydown quando há onLongSelect

    vi.advanceTimersByTime(LONG_SELECT_MS - 100)
    fireEvent.keyUp(document, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onLongSelect).not.toHaveBeenCalled()
  })

  it('segurar além do limiar chama onLongSelect 1x; soltar depois não faz nada', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyDown(document, { key: 'Enter' })
    vi.advanceTimersByTime(LONG_SELECT_MS)
    expect(onLongSelect).toHaveBeenCalledTimes(1)

    fireEvent.keyUp(document, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onLongSelect).toHaveBeenCalledTimes(1)
  })

  it('auto-repetição do controle (vários keydown) conta como um único gesto', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyDown(document, { key: 'Enter' })
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(50)
      fireEvent.keyDown(document, { key: 'Enter' })
    }
    // 20 × 50ms = 1000ms > LONG_SELECT_MS: já deve ter disparado uma vez.
    expect(onLongSelect).toHaveBeenCalledTimes(1)

    fireEvent.keyUp(document, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onLongSelect).toHaveBeenCalledTimes(1)
  })

  it('um keydown muito depois do anterior (sem keyup) começa um gesto novo, sem herdar o estado antigo', () => {
    // O gesto 1 nunca recebe keyup (perdido) — seu timer dispara sozinho aos
    // 800ms, como qualquer segurar sem soltar. O que este teste prova é
    // outra coisa: sem o corte de STALE_PRESS_MS, o gesto 2 (um
    // pressionamento novo, de verdade, bem mais tarde) seria mal lido como
    // "auto-repetição" do gesto 1 já resolvido — e o seu próprio keyup não
    // faria nada, porque pareceria continuação de um gesto que já disparou
    // (`longFired`). Com o corte, o gesto 2 é tratado como novo e o seu OK
    // curto funciona normalmente.
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyDown(document, { key: 'Enter' }) // gesto 1, sem keyup (perdido)
    vi.advanceTimersByTime(LONG_SELECT_MS) // o timer do gesto 1 dispara sozinho
    expect(onLongSelect).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1500) // silêncio total — nenhum evento nesse intervalo
    fireEvent.keyDown(document, { key: 'Enter' }) // gesto 2: pressionamento novo
    fireEvent.keyUp(document, { key: 'Enter' }) // solta rápido

    expect(onSelect).toHaveBeenCalledTimes(1) // gesto 2 resolveu como OK curto
    expect(onLongSelect).toHaveBeenCalledTimes(1) // ainda só o do gesto 1
  })

  it('blur da janela durante o gesto cancela — nem onSelect nem onLongSelect', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.blur(window)
    vi.advanceTimersByTime(LONG_SELECT_MS)
    fireEvent.keyUp(document, { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onLongSelect).not.toHaveBeenCalled()
  })

  it('keyup sem keydown prévio não faz nada', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect }))

    fireEvent.keyUp(document, { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onLongSelect).not.toHaveBeenCalled()
  })

  it('onLongSelect some antes do keyup: o gesto já estava travado no modo demorado (nada dispara)', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    const { rerender } = renderHook(({ withLong }: { withLong: boolean }) =>
      useRemoteNav({ onSelect, onLongSelect: withLong ? onLongSelect : undefined }),
      { initialProps: { withLong: true } },
    )

    fireEvent.keyDown(document, { key: 'Enter' })
    rerender({ withLong: false }) // handler removido a meio do pressionamento
    vi.advanceTimersByTime(LONG_SELECT_MS - 100)
    fireEvent.keyUp(document, { key: 'Enter' })

    // Modo foi decidido no keydown (D-002): keyup ainda decide pelo gesto,
    // então um OK curto chama onSelect — nunca cai no comportamento legado.
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onLongSelect).not.toHaveBeenCalled()
  })

  it('modal: true intercepta keydown e keyup na fase de captura, antes de qualquer listener de bubble', () => {
    // Para a distinção captura×bubble valer de verdade, o evento precisa
    // nascer num DESCENDENTE de `document` (como um evento real de teclado,
    // cujo alvo é o elemento focado) — despachado direto em `document`, as
    // duas fases colapsam em "na hora" e a ordem vira só registro, que é o
    // que os outros testes deste arquivo fazem de propósito (mais simples).
    // Aqui o alvo é `document.body`: a captura em `document` sempre chega
    // primeiro, não importa a ordem de registro.
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    const bubbleKeyUp = vi.fn()
    document.addEventListener('keyup', bubbleKeyUp) // simula a tela por trás do diálogo

    renderHook(() => useRemoteNav({ onSelect, onLongSelect }, { modal: true }))

    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled() // ainda em gesto, onLongSelect definido

    fireEvent.keyUp(document.body, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(bubbleKeyUp).not.toHaveBeenCalled() // nunca chegou à fase de bubble

    document.removeEventListener('keyup', bubbleKeyUp)
  })
})

/**
 * Tecla amarela do controle (feature 013) — atalho complementar ao
 * segurar OK, pedido depois de testar na TV física com um controle
 * substituto onde o gesto de segurar não se comportava como no navegador.
 */
describe('useRemoteNav — onFavoriteKey (tecla amarela, feature 013)', () => {
  afterEach(() => cleanup())

  it('dispara onFavoriteKey no keydown, sem esperar soltar (nunca é um gesto)', () => {
    const onFavoriteKey = vi.fn()
    renderHook(() => useRemoteNav({ onFavoriteKey }))

    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY })

    expect(onFavoriteKey).toHaveBeenCalledTimes(1)
  })

  it('sem onFavoriteKey, a tecla amarela não faz nada (não é tratada como tecla desconhecida perigosa)', () => {
    const onDirection = vi.fn()
    const onBack = vi.fn()
    renderHook(() => useRemoteNav({ onDirection, onBack }))

    expect(() => fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY })).not.toThrow()
    expect(onDirection).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('segurar a tecla (vários keydown seguidos) alterna o favorito só uma vez dentro do debounce', () => {
    vi.useFakeTimers()
    const onFavoriteKey = vi.fn()
    renderHook(() => useRemoteNav({ onFavoriteKey }))

    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY, repeat: true })
    vi.advanceTimersByTime(50)
    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY, repeat: true })
    vi.advanceTimersByTime(50)
    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY, repeat: true })

    expect(onFavoriteKey).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('depois do debounce passar, um novo toque na tecla dispara de novo', () => {
    vi.useFakeTimers()
    const onFavoriteKey = vi.fn()
    renderHook(() => useRemoteNav({ onFavoriteKey }))

    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY })
    vi.advanceTimersByTime(500) // além do FAVORITE_KEY_DEBOUNCE_MS (400ms)
    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY })

    expect(onFavoriteKey).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('não interfere no gesto de OK — as duas teclas são independentes', () => {
    const onSelect = vi.fn()
    const onLongSelect = vi.fn()
    const onFavoriteKey = vi.fn()
    renderHook(() => useRemoteNav({ onSelect, onLongSelect, onFavoriteKey }))

    fireEvent.keyDown(document, { key: FAVORITE_COLOR_KEY })
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyUp(document, { key: 'Enter' })

    expect(onFavoriteKey).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onLongSelect).not.toHaveBeenCalled()
  })
})
