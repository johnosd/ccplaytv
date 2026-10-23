// Contrato da feature 091 (estado e formato da chave de legenda no portal). Travado pelo sdd-plan.
import { expect, it } from 'vitest'
import { checkSubtitleKey, resolveSubtitleKeyView } from './subtitleKeyStatus'

it('US1/US2/US3, FR-002/FR-003: estado por fornecedor sem precisar do valor; "desconhecido" para TV antiga; formato barrado antes de enviar sem ecoar o que foi colado', () => {
  const view = resolveSubtitleKeyView
  // Nunca houve operação: o que a TV disse; TV antiga/silenciosa = estado desconhecido (nunca afirma "não configurada").
  expect(view({ tvReported: 'none' })).toMatchObject({ view: 'none', canRemove: false, unknown: false })
  expect(view({})).toMatchObject({ view: 'none', unknown: true })
  expect(view({ tvReported: 'configured' })).toMatchObject({ view: 'configured_on_tv', canRemove: true })
  // Pendente vence tudo; falha transitória marca nova tentativa e continua pendente.
  expect(view({ pending: { action: 'set' }, tvReported: 'configured' })).toMatchObject({ view: 'pending', needsRetry: false })
  expect(view({ pending: { action: 'set', retryReason: 'rate_limited' } })).toMatchObject({ view: 'pending', needsRetry: true })
  expect(view({ pending: { action: 'remove' }, tvReported: 'configured' })).toMatchObject({ view: 'pending', canRemove: true })
  // Aplicada vale enquanto a TV confirma; remoção aplicada = sem chave; recusada mostra o motivo e deixa remover a antiga.
  expect(view({ last: { action: 'set', result: 'applied' }, tvReported: 'configured' })).toMatchObject({ view: 'applied', canRemove: true })
  expect(view({ last: { action: 'set', result: 'applied' }, tvReported: 'none' })).toMatchObject({ view: 'none', canRemove: false })
  expect(view({ last: { action: 'remove', result: 'applied' }, tvReported: 'none' })).toMatchObject({ view: 'none' })
  expect(view({ last: { action: 'set', result: 'rejected', reason: 'refused' }, tvReported: 'configured' }))
    .toMatchObject({ view: 'rejected', reason: 'refused', canRemove: true })
  // O que só a TV sabe: a chave que ela já tem foi recusada no uso, ou está no limite.
  expect(view({ tvReported: 'rejected' })).toMatchObject({ view: 'rejected', reason: 'refused', canRemove: true })
  expect(view({ tvReported: 'rate_limited' })).toMatchObject({ view: 'configured_on_tv', limited: true, canRemove: true })

  // Formato: 8–200 de [A-Za-z0-9._-], com trim; espaço no meio, aspas, curto/longo demais são barrados.
  expect(checkSubtitleKey('  abcdEFGH-12.34_xy \n')).toEqual({ ok: true, key: 'abcdEFGH-12.34_xy' })
  for (const bad of ['', 'curta', 'tem espaço no meio da chave', '"aspas-na-chave-123"', 'a'.repeat(201), 'chave-com-ç-acentuada-123']) {
    expect(checkSubtitleKey(bad)).toEqual({ ok: false })
  }
  expect(checkSubtitleKey('a'.repeat(200))).toMatchObject({ ok: true })
  expect(JSON.stringify(checkSubtitleKey('segredo ruim com espaço'))).not.toContain('segredo')
})
