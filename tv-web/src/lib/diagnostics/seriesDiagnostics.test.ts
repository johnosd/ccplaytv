import { describe, expect, it } from 'vitest'
import { getSeriesDiagnostics, recordSeriesDiagnostic, safeErrorSignature, subscribeSeriesDiagnostics } from './seriesDiagnostics'

describe('diagnóstico local seguro', () => {
  it('aceita apenas motivos de provedor permitidos e status da exceção local', () => {
    expect(safeErrorSignature({ name: 'ProviderError', kind: 'direct_connection_refused', message: 'secret-url' })).toBe('ProviderError PROVIDER-direct_connection_refused')
    expect(safeErrorSignature({ name: 'ProviderError', kind: 'secret-key', message: 'secret-url' })).toBe('ProviderError UNCLASSIFIED')
    expect(safeErrorSignature({ name: 'ProviderIncompatibleError', message: 'Provedor respondeu com status 503.' })).toBe('ProviderIncompatibleError HTTP-503')
    expect(safeErrorSignature({ name: 'ProviderIncompatibleError', message: 'secret status 503' })).toBe('ProviderIncompatibleError UNCLASSIFIED')
  })

  it('retém código React e posição local sem copiar mensagem, host ou credenciais', () => {
    const error = new TypeError('Minified React error #185; https://secret-user:secret-pass@private.example/?token=secret-token')
    error.stack = 'TypeError: secret-token\n at render (file:///app/route-series-detail.js:123:45)\n at https://secret-user:secret-pass@private.example/secret-token.js:8:9'
    expect(safeErrorSignature(error)).toBe('TypeError REACT-185 route-series-detail.js:123:45')
    recordSeriesDiagnostic('ROUTE_RENDER_FAILED', 'failed', error)
    expect(getSeriesDiagnostics()).not.toMatch(/secret|private|https|file:/)
  })
  it('limita o buffer, avisa assinantes e suporta erros com getters que lançam', () => {
    let notifications = 0
    const unsubscribe = subscribeSeriesDiagnostics(() => { notifications += 1 })
    for (let i = 0; i < 20; i++) recordSeriesDiagnostic('SERIES_OPEN')
    unsubscribe()
    expect(notifications).toBe(20)
    expect(getSeriesDiagnostics().split('\n')).toHaveLength(9)
    expect(safeErrorSignature({ get name() { throw new Error('secret') } })).toBe('UNKNOWN')
    expect(safeErrorSignature('secret')).toBe('UNKNOWN')
  })
})
