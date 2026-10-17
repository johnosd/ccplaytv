// Contrato da feature 077 (estado da chave TMDB no portal). Travado pelo sdd-plan: o sdd-execute só faz passar.
import { expect, it } from 'vitest'
import { resolveTmdbView, type TmdbServiceState } from './tmdbStatus'

const view = (state: TmdbServiceState) => resolveTmdbView(state)

it('US4-AC1..AC5/FR-011: junta pendência, último resultado e o que a TV informou, sem nunca precisar do valor da chave', () => {
  // Nunca houve operação do portal: o que a TV disse (ou "Não configurada" se ela ainda não informou).
  expect(view({})).toMatchObject({ view: 'none', canRemove: false, needsRetry: false })
  expect(view({ tvReported: 'none' })).toMatchObject({ view: 'none', canRemove: false })
  expect(view({ tvReported: 'configured' })).toMatchObject({ view: 'configured_on_tv', canRemove: true })
  // Pendente vence tudo; falha transitória da TV marca nova tentativa e continua pendente.
  expect(view({ pending: { action: 'set' }, tvReported: 'configured', last: { action: 'set', result: 'applied' } })).toMatchObject({ view: 'pending', needsRetry: false })
  expect(view({ pending: { action: 'set', retryReason: 'offline' } })).toMatchObject({ view: 'pending', needsRetry: true })
  // Aplicada só vale enquanto a TV confirma que tem chave; se a pessoa tirou na TV, volta a "Não configurada".
  expect(view({ last: { action: 'set', result: 'applied' }, tvReported: 'configured' })).toMatchObject({ view: 'applied', canRemove: true })
  expect(view({ last: { action: 'set', result: 'applied' }, tvReported: 'none' })).toMatchObject({ view: 'none', canRemove: false })
  expect(view({ last: { action: 'set', result: 'applied' } })).toMatchObject({ view: 'applied' })
  // Remoção aplicada = sem chave.
  expect(view({ last: { action: 'remove', result: 'applied' }, tvReported: 'none' })).toMatchObject({ view: 'none', canRemove: false })
  // Recusada pelo TMDB: mostra o motivo e continua oferecendo remover a chave antiga que a TV ainda tem.
  expect(view({ last: { action: 'set', result: 'rejected', reason: 'refused' }, tvReported: 'configured' }))
    .toMatchObject({ view: 'rejected', reason: 'refused', canRemove: true })
  expect(view({ last: { action: 'set', result: 'rejected', reason: 'invalid_format' }, tvReported: 'none' }))
    .toMatchObject({ view: 'rejected', reason: 'invalid_format', canRemove: false })
})
