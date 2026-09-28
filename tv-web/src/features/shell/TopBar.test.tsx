import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TopbarItem } from '../../navigation/appNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { TopBar } from './TopBar'

// Teclas em `document.body` (nunca em `document`) — mesmo cuidado dos demais
// testes de teclado deste repositório.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function makeCallbacks() {
  return {
    onFocusItem: vi.fn(),
    onExitDown: vi.fn(),
    onNavigate: vi.fn(),
    onGoHome: vi.fn(),
    onOpenProfiles: vi.fn(),
    onBack: vi.fn(),
  }
}

/** Foco em estado, como o `HomeScreen` faz de verdade — só a topbar em teste, sem mock dela mesma. */
function Harness({
  initial = 'home',
  active = true,
  callbacks,
  sourceName = 'Sala',
}: {
  initial?: TopbarItem
  active?: boolean
  callbacks: ReturnType<typeof makeCallbacks>
  sourceName?: string
}) {
  const [focused, setFocused] = useState<TopbarItem>(initial)
  return (
    <TopBar
      sourceName={sourceName}
      active={active}
      focusedItem={focused}
      onFocusItem={(item) => {
        callbacks.onFocusItem(item)
        setFocused(item)
      }}
      onExitDown={callbacks.onExitDown}
      onNavigate={callbacks.onNavigate}
      onOpenProfiles={callbacks.onOpenProfiles}
      onBack={callbacks.onBack}
    />
  )
}

function focusedName(): string | null {
  const el = document.querySelector('.tv-focus')
  return el ? (el.getAttribute('aria-label') ?? el.textContent) : null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 26, 9, 5, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TopBar — ordem, foco e navegação (US2, FR-013–FR-016)', () => {
  it('os focáveis aparecem na ordem Início, TV ao vivo, Filmes, Séries, lista ativa, Buscar, Configurações — sem Esportes nem Infantil', () => {
    render(<Harness callbacks={makeCallbacks()} sourceName="Sala" />)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual([
      'Início',
      'TV ao vivo',
      'Filmes',
      'Séries',
      'Lista ativa: Sala. Trocar de lista',
      'Buscar',
      'Configurações',
    ])
    expect(screen.queryByText('Esportes')).not.toBeInTheDocument()
    expect(screen.queryByText('Infantil')).not.toBeInTheDocument()
  })

  it('LEFT/RIGHT percorrem a ordem sem dar a volta: clamp nas duas pontas', () => {
    const callbacks = makeCallbacks()
    render(<Harness callbacks={callbacks} />)
    expect(focusedName()).toBe('Início')

    press('ArrowLeft')
    expect(focusedName()).toBe('Início')
    expect(callbacks.onFocusItem).not.toHaveBeenCalled()

    const seen: (string | null)[] = []
    for (let i = 0; i < 6; i += 1) {
      press('ArrowRight')
      seen.push(focusedName())
    }
    expect(seen).toEqual([
      'TV ao vivo',
      'Filmes',
      'Séries',
      'Lista ativa: Sala. Trocar de lista',
      'Buscar',
      'Configurações',
    ])

    press('ArrowRight')
    expect(focusedName()).toBe('Configurações')
    expect(callbacks.onFocusItem).toHaveBeenCalledTimes(6)

    press('ArrowLeft')
    expect(focusedName()).toBe('Buscar')
  })

  it('só o item em foco recebe .tv-focus', () => {
    render(<Harness initial="movies" callbacks={makeCallbacks()} />)
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Filmes' })).toHaveClass('tv-focus')
  })

  it('DOWN devolve o foco ao conteúdo; UP não faz nada (topo da tela); RETURN chama onBack', () => {
    const callbacks = makeCallbacks()
    render(<Harness callbacks={callbacks} />)
    press('ArrowUp')
    expect(callbacks.onExitDown).not.toHaveBeenCalled()
    expect(callbacks.onFocusItem).not.toHaveBeenCalled()

    press('ArrowDown')
    expect(callbacks.onExitDown).toHaveBeenCalledTimes(1)

    press('Escape')
    expect(callbacks.onBack).toHaveBeenCalledTimes(1)
  })

  it('OK abre o mesmo destino do atalho: TV ao vivo, Filmes e Séries chamam onNavigate com o destino (FR-016)', () => {
    const callbacks = makeCallbacks()
    const { rerender } = render(
      <TopBar sourceName="Sala" active focusedItem="live" {...callbacks} />,
    )
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenLastCalledWith('live')

    rerender(<TopBar sourceName="Sala" active focusedItem="movies" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenLastCalledWith('movies')

    rerender(<TopBar sourceName="Sala" active focusedItem="series" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenLastCalledWith('series')
    expect(callbacks.onNavigate).toHaveBeenCalledTimes(3)
    expect(callbacks.onOpenProfiles).not.toHaveBeenCalled()
  })

  it('OK no indicador da lista abre os perfis (FR-017); OK em Início não faz nada', () => {
    const callbacks = makeCallbacks()
    const { rerender } = render(<TopBar sourceName="Sala" active focusedItem="profile" {...callbacks} />)
    press('Enter')
    expect(callbacks.onOpenProfiles).toHaveBeenCalledTimes(1)

    rerender(<TopBar sourceName="Sala" active focusedItem="home" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onOpenProfiles).toHaveBeenCalledTimes(1)
  })

  it('o clique de mouse chama o mesmo handler do OK', () => {
    const callbacks = makeCallbacks()
    render(<TopBar sourceName="Sala" active focusedItem="home" {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filmes' }))
    expect(callbacks.onNavigate).toHaveBeenCalledWith('movies')
    fireEvent.click(screen.getByRole('button', { name: /Lista ativa: Sala/ }))
    expect(callbacks.onOpenProfiles).toHaveBeenCalledTimes(1)
  })
})

describe('TopBar — escopo inativo (D-004, R-002)', () => {
  it('active=false: nenhuma tecla dispara handler nenhum e nada aparece em foco', () => {
    const callbacks = makeCallbacks()
    render(<Harness active={false} initial="movies" callbacks={callbacks} />)

    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter', ' ', 'Escape']) press(key)

    expect(callbacks.onFocusItem).not.toHaveBeenCalled()
    expect(callbacks.onExitDown).not.toHaveBeenCalled()
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onOpenProfiles).not.toHaveBeenCalled()
    expect(callbacks.onBack).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(0)
  })

  it('ativar/desativar em runtime liga e desliga o teclado sem remontar a topbar', () => {
    const callbacks = makeCallbacks()
    const { rerender } = render(<TopBar sourceName="Sala" active={false} focusedItem="live" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).not.toHaveBeenCalled()

    rerender(<TopBar sourceName="Sala" active focusedItem="live" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenCalledWith('live')

    rerender(<TopBar sourceName="Sala" active={false} focusedItem="live" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenCalledTimes(1)
  })
})

/** Escopo irmão em fase de bubble (sem `modal`) — faz o papel do conteúdo do Início. */
function SiblingScope({ spy }: { spy: { onDirection: () => void; onSelect: () => void; onBack: () => void } }) {
  useRemoteNav(spy)
  return null
}

describe('TopBar — evento único por escopo (D-004, R-002)', () => {
  function renderWithSibling(active: boolean) {
    const callbacks = makeCallbacks()
    const spy = { onDirection: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() }
    render(
      <>
        <Harness active={active} initial="live" callbacks={callbacks} />
        <SiblingScope spy={spy} />
      </>,
    )
    return { callbacks, spy }
  }

  it('ativa: a tecla tratada pela topbar (DOWN, RIGHT, OK, RETURN) NÃO chega ao irmão em bubble', () => {
    const { callbacks, spy } = renderWithSibling(true)

    press('ArrowDown')
    expect(callbacks.onExitDown).toHaveBeenCalledTimes(1)
    press('ArrowRight')
    expect(callbacks.onFocusItem).toHaveBeenCalledWith('movies')
    press('Enter')
    expect(callbacks.onNavigate).toHaveBeenCalledWith('movies')
    press('Escape')
    expect(callbacks.onBack).toHaveBeenCalledTimes(1)

    expect(spy.onDirection).not.toHaveBeenCalled()
    expect(spy.onSelect).not.toHaveBeenCalled()
    expect(spy.onBack).not.toHaveBeenCalled()
  })

  it('inativa: não intercepta nada — o irmão recebe as teclas e a topbar continua inerte', () => {
    const { callbacks, spy } = renderWithSibling(false)

    press('ArrowDown')
    press('ArrowRight')
    press('Enter')
    press('Escape')

    expect(spy.onDirection).toHaveBeenCalledTimes(2)
    expect(spy.onSelect).toHaveBeenCalledTimes(1)
    expect(spy.onBack).toHaveBeenCalledTimes(1)
    expect(callbacks.onExitDown).not.toHaveBeenCalled()
    expect(callbacks.onFocusItem).not.toHaveBeenCalled()
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onBack).not.toHaveBeenCalled()
  })

  it('devolver o foco (DOWN) e reativar o irmão: a MESMA tecla não é processada duas vezes, e a seguinte chega só a ele', () => {
    const callbacks = makeCallbacks()
    const spy = { onDirection: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() }
    function Host() {
      const [zone, setZone] = useState<'topbar' | 'content'>('topbar')
      return (
        <>
          <TopBar
            sourceName="Sala"
            active={zone === 'topbar'}
            focusedItem="home"
            {...callbacks}
            onExitDown={() => {
              callbacks.onExitDown()
              setZone('content')
            }}
          />
          <SiblingScope spy={zone === 'content' ? spy : { onDirection: vi.fn(), onSelect: vi.fn(), onBack: vi.fn() }} />
        </>
      )
    }
    render(<Host />)

    press('ArrowDown') // topbar → conteúdo
    expect(callbacks.onExitDown).toHaveBeenCalledTimes(1)
    expect(spy.onDirection).not.toHaveBeenCalled() // o conteúdo nunca viu o DOWN que lhe devolveu o foco

    press('ArrowRight') // agora a tecla é do conteúdo
    expect(spy.onDirection).toHaveBeenCalledTimes(1)
    expect(callbacks.onFocusItem).not.toHaveBeenCalled()
  })
})

describe('TopBar — Busca e Configurações são reais (feature 026, D-005, FR-021, FR-035)', () => {
  it.each([
    ['search', 'onOpenSearch'],
    ['settings', 'onOpenSettings'],
  ] as const)('com callback: OK em %s chama %s, e o botão não é soft disabled', (item, callbackName) => {
    const callback = vi.fn()
    const callbacks = makeCallbacks()
    render(
      <TopBar
        sourceName="Sala"
        active
        focusedItem={item}
        {...callbacks}
        {...{ [callbackName]: callback }}
      />,
    )
    const button = screen.getByRole('button', { name: item === 'search' ? 'Buscar' : 'Configurações' })
    expect(button).not.toHaveClass('is-soft-disabled')

    press('Enter')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onOpenProfiles).not.toHaveBeenCalled()
  })

  it('sem callback (só a topbar montada crua, como em teste): soft disabled, e OK não faz nada', () => {
    const callbacks = makeCallbacks()
    render(<TopBar sourceName="Sala" active focusedItem="search" {...callbacks} />)
    const search = screen.getByRole('button', { name: 'Buscar' })
    const settings = screen.getByRole('button', { name: 'Configurações' })
    expect(search).toHaveClass('is-soft-disabled')
    expect(settings).toHaveClass('is-soft-disabled')
    expect(search).toHaveClass('tv-focus')
    expect(search).not.toBeDisabled()
    expect(settings).not.toBeDisabled()

    press('Enter')
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onOpenProfiles).not.toHaveBeenCalled()
  })

  it('currentItem "search"/"settings" marca aria-current, igual aos destinos de topo', () => {
    const callbacks = makeCallbacks()
    render(
      <TopBar
        sourceName="Sala"
        active
        focusedItem="home"
        currentItem="search"
        {...callbacks}
        onOpenSearch={vi.fn()}
      />,
    )
    const search = screen.getByRole('button', { name: 'Buscar' })
    expect(search).toHaveAttribute('aria-current', 'page')
    expect(search).toHaveClass('topbar-item--current')
    expect(screen.getByRole('button', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('o clique de mouse chama o mesmo callback do OK', () => {
    const callbacks = makeCallbacks()
    const onOpenSettings = vi.fn()
    render(<TopBar sourceName="Sala" active focusedItem="home" {...callbacks} onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

describe('TopBar — Início ativo, acessibilidade e relógio (FR-014, FR-019, FR-044)', () => {
  it('"Início" é o destino atual com marcação própria, independente do foco', () => {
    const callbacks = makeCallbacks()
    const { rerender } = render(<TopBar sourceName="Sala" active focusedItem="movies" {...callbacks} />)
    const home = screen.getByRole('button', { name: 'Início' })
    expect(home).toHaveAttribute('aria-current', 'page')
    expect(home).toHaveClass('topbar-item--current')
    expect(home).not.toHaveClass('tv-focus')

    rerender(<TopBar sourceName="Sala" active={false} focusedItem="home" {...callbacks} />)
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Início' })).not.toHaveClass('tv-focus')

    rerender(<TopBar sourceName="Sala" active focusedItem="home" {...callbacks} />)
    expect(screen.getByRole('button', { name: 'Início' })).toHaveClass('topbar-item--current', 'tv-focus')

    for (const name of ['TV ao vivo', 'Filmes', 'Séries']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-current')
    }
  })

  it('todo focável tem nome acessível, e o indicador diz qual é a lista ativa', () => {
    render(<TopBar sourceName="Quarto do Fundo" active focusedItem="home" {...makeCallbacks()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(7)
    for (const button of buttons) expect(button).toHaveAccessibleName()
    expect(screen.getByRole('button', { name: /Lista ativa: Quarto do Fundo/ })).toBeInTheDocument()
  })

  it('a navegação principal é um landmark nomeado; logo e relógio não são focáveis', () => {
    render(<TopBar sourceName="Sala" active focusedItem="home" {...makeCallbacks()} />)
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    expect(screen.getByText('CCPlayTV').closest('button')).toBeNull()
    expect(screen.getByText('09:05').closest('button')).toBeNull()
  })

  it('o relógio mostra a hora atual já no primeiro render e vira no minuto', () => {
    render(<TopBar sourceName="Sala" active focusedItem="home" {...makeCallbacks()} />)
    expect(screen.getByText('09:05')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('09:06')).toBeInTheDocument()
  })

  it('currentItem="live": "TV ao vivo" é o destino atual, "Início" deixa de ser (feature 024)', () => {
    const callbacks = makeCallbacks()
    render(<TopBar sourceName="Sala" active focusedItem="movies" currentItem="live" {...callbacks} />)
    const live = screen.getByRole('button', { name: 'TV ao vivo' })
    const home = screen.getByRole('button', { name: 'Início' })
    expect(live).toHaveAttribute('aria-current', 'page')
    expect(live).toHaveClass('topbar-item--current')
    expect(home).not.toHaveAttribute('aria-current')
    expect(home).not.toHaveClass('topbar-item--current')
  })

  it('OK em "Início" com currentItem !== "home" chama onGoHome, nunca onNavigate; no item atual, OK não faz nada', () => {
    const callbacks = makeCallbacks()
    const { rerender } = render(<TopBar sourceName="Sala" active focusedItem="home" currentItem="live" {...callbacks} />)
    press('Enter')
    expect(callbacks.onGoHome).toHaveBeenCalledTimes(1)
    expect(callbacks.onNavigate).not.toHaveBeenCalled()

    rerender(<TopBar sourceName="Sala" active focusedItem="live" currentItem="live" {...callbacks} />)
    press('Enter')
    expect(callbacks.onNavigate).not.toHaveBeenCalled()
    expect(callbacks.onGoHome).toHaveBeenCalledTimes(1)
  })

  it('sem currentItem (padrão "home"), OK em "Início" não chama onGoHome — mesmo comportamento de antes da feature 024', () => {
    const callbacks = makeCallbacks()
    render(<TopBar sourceName="Sala" active focusedItem="home" {...callbacks} />)
    press('Enter')
    expect(callbacks.onGoHome).not.toHaveBeenCalled()
  })

  it('o nome da lista aparece inteiro no DOM (a truncagem é CSS) e a inicial vira o avatar', () => {
    render(
      <TopBar
        sourceName="Uma lista com um nome absurdamente comprido que precisa de reticências"
        active
        focusedItem="home"
        {...makeCallbacks()}
      />,
    )
    const indicator = screen.getByRole('button', { name: /Lista ativa: Uma lista com um nome absurdamente comprido/ })
    expect(indicator.querySelector('.topbar-profile-name')).toHaveTextContent(
      'Uma lista com um nome absurdamente comprido que precisa de reticências',
    )
    expect(indicator.querySelector('.topbar-profile-avatar')).toHaveTextContent('U')
  })
})
