import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCoverColorCache, readCoverColor, useCoverColor } from './useCoverColor'

// Feature 059, FR-002/FR-024 (`logic/cor-da-capa.md` §1).

/** `Image` falso: guarda as instâncias para o teste disparar onload/onerror. */
class FakeImage {
  static instances: FakeImage[] = []
  crossOrigin: string | null = null
  decoding = 'auto'
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeImage.instances.push(this)
  }
}

function Probe({ url }: { url?: string }) {
  const color = useCoverColor(url)
  return <span data-testid="color">{color ?? 'none'}</span>
}

const SECRET_URL = 'http://provedor.test/get.php?username=fulano&password=segredo/capa.jpg'

beforeEach(() => {
  clearCoverColorCache()
  FakeImage.instances = []
  vi.stubGlobal('Image', FakeImage)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useCoverColor', () => {
  it('sem URL não lê nada e devolve null', () => {
    render(<Probe />)
    expect(screen.getByTestId('color').textContent).toBe('none')
    expect(FakeImage.instances).toHaveLength(0)
  })

  it('pede a imagem com CORS anônimo e, em erro, fica no neutro sem expor a URL em lugar nenhum', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    render(<Probe url={SECRET_URL} />)
    const image = FakeImage.instances[0]
    expect(image?.crossOrigin).toBe('anonymous')
    act(() => image?.onerror?.())
    expect(screen.getByTestId('color').textContent).toBe('none')
    expect(document.body.innerHTML).not.toContain('segredo')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('a mesma capa não é lida duas vezes na sessão (o null também fica no cache)', () => {
    const { unmount } = render(<Probe url="http://img.test/a.jpg" />)
    act(() => FakeImage.instances[0]?.onerror?.())
    unmount()
    render(<Probe url="http://img.test/a.jpg" />)
    expect(FakeImage.instances).toHaveLength(1)
  })
})

describe('readCoverColor', () => {
  it('canvas que recusa a leitura (SecurityError de CORS) vira null, sem lançar', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
      getImageData: () => {
        throw new DOMException('tainted', 'SecurityError')
      },
    } as unknown as CanvasRenderingContext2D)
    expect(readCoverColor({} as CanvasImageSource)).toBeNull()
  })

  it('lê a miniatura e devolve a cor da regra pura', () => {
    const red = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
      getImageData: () => ({ data: red }),
    } as unknown as CanvasRenderingContext2D)
    expect(readCoverColor({} as CanvasImageSource)).toMatch(/^rgb\(\d+, 0, 0\)$/)
  })
})
