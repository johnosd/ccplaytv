import { expect, it } from 'vitest'
import { clearRemoteImport, markRemoteImportRunning, remoteImportRunId } from './remoteImportsInFlight'

// 071/A008: o registro sabe qual execução ainda importa a lista vinda do site; execução antiga não apaga a nova.
it('registra a execução em curso e só a mesma execução a remove', () => {
  expect(remoteImportRunId('lista')).toBeUndefined()
  markRemoteImportRunning('lista', 'exec-1')
  expect(remoteImportRunId('lista')).toBe('exec-1')
  markRemoteImportRunning('lista', 'exec-2')
  clearRemoteImport('lista', 'exec-1')
  expect(remoteImportRunId('lista')).toBe('exec-2')
  clearRemoteImport('lista', 'exec-2')
  expect(remoteImportRunId('lista')).toBeUndefined()
})
