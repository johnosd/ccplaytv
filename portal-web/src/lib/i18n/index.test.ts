import { expect, it } from 'vitest'
import { novoPortal } from './areas/novoPortal'
import { baseMessages, resolveLocale, useT } from './index'
it('preserva pt como base e oferece en/es sem expor detalhes técnicos', () => {
  expect(resolveLocale('pt-BR')).toBe('pt')
  expect(resolveLocale('en-US')).toBe('en')
  expect(resolveLocale('es-AR')).toBe('es')
  expect(resolveLocale('fr')).toBe('pt')
  for (const lang of ['pt', 'en', 'es']) expect(useT(lang)('preparing')).toBeTruthy()
})

it('en e es têm exatamente as chaves de pt, nas duas áreas, e as áreas não repetem chave (feature 077)', () => {
  const keys = (value: object) => Object.keys(value).sort()
  expect(keys(baseMessages.en)).toEqual(keys(baseMessages.pt))
  expect(keys(baseMessages.es)).toEqual(keys(baseMessages.pt))
  expect(keys(novoPortal.en)).toEqual(keys(novoPortal.pt))
  expect(keys(novoPortal.es)).toEqual(keys(novoPortal.pt))
  expect(keys(novoPortal.pt).filter(key => key in baseMessages.pt)).toEqual([])
  for (const lang of ['pt', 'en', 'es']) {
    const t = useT(lang)
    expect(t('navLists')).toBeTruthy()
    for (const key of keys(novoPortal.pt)) expect(String(t(key as Parameters<typeof t>[0])).trim(), lang + ':' + key).not.toBe('')
  }
})

it('o português do redesenho usa os rótulos que os contratos e a spec fixam', () => {
  const t = useT('pt')
  expect([t('navLists'), t('navLicense'), t('navSettings'), t('navMain'), t('summaryTitle')]).toEqual(['Listas', 'Licença', 'Ajustes', 'Principal', 'Resumo da TV'])
  expect([t('statusOnTv'), t('statusWaitingTv'), t('statusError'), t('listDelete'), t('listDeleteConfirm'), t('cancelSend'), t('resendList'), t('useAnotherTv')])
    .toEqual(['Na TV', 'Aguardando a TV', 'Erro', 'Excluir', 'Sim, excluir', 'Cancelar envio', 'Reenviar', 'Usar outra TV'])
  expect(t('sentNextStep')).toContain('na TV, aperte Atualizar')
})
