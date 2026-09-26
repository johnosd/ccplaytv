import { describe, expect, it } from 'vitest'
import { parsePanelUrl } from './m3uPanelUrl'

describe('parsePanelUrl (feature 014, D-001)', () => {
  it('reconhece a forma padrão de painel Xtream', () => {
    const result = parsePanelUrl('http://exemplo.test:8080/get.php?username=joao&password=1234')

    expect(result).toEqual({ dns: 'http://exemplo.test:8080', username: 'joao', password: '1234' })
  })

  it('reconhece com subcaminho e parâmetros extras (type/output), ignorando-os', () => {
    const result = parsePanelUrl(
      'https://exemplo.test/painel/get.php?username=joao&password=1234&type=m3u_plus&output=ts',
    )

    expect(result).toEqual({ dns: 'https://exemplo.test/painel', username: 'joao', password: '1234' })
  })

  it('recusa URL sem /get.php', () => {
    expect(parsePanelUrl('http://exemplo.test/lista.m3u')).toBeUndefined()
  })

  it('recusa URL sem usuário', () => {
    expect(parsePanelUrl('http://exemplo.test/get.php?password=1234')).toBeUndefined()
  })

  it('recusa URL sem senha', () => {
    expect(parsePanelUrl('http://exemplo.test/get.php?username=joao')).toBeUndefined()
  })

  it('recusa usuário ou senha vazios', () => {
    expect(parsePanelUrl('http://exemplo.test/get.php?username=&password=1234')).toBeUndefined()
    expect(parsePanelUrl('http://exemplo.test/get.php?username=joao&password=')).toBeUndefined()
  })

  it('recusa URL inválida, sem lançar', () => {
    expect(() => parsePanelUrl('não é uma url')).not.toThrow()
    expect(parsePanelUrl('não é uma url')).toBeUndefined()
  })

  it('recusa outro formato de lista de painel (/playlist/usuario/senha), sem tratar como Xtream', () => {
    expect(parsePanelUrl('http://exemplo.test/playlist/joao/1234/m3u')).toBeUndefined()
  })

  it('recusa string vazia', () => {
    expect(parsePanelUrl('')).toBeUndefined()
  })

  it('devolve o dns normalizado, nunca com a credencial embutida', () => {
    const result = parsePanelUrl('http://exemplo.test/get.php?username=joao&password=1234')

    expect(result?.dns).not.toContain('joao')
    expect(result?.dns).not.toContain('1234')
    expect(JSON.stringify(result?.dns)).not.toMatch(/[?&]/)
  })
})
