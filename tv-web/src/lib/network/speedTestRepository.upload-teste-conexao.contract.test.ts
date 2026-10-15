import { expect, it } from 'vitest'
import { CatalogDb } from '../catalog/db'
import type { SpeedTestResult } from './speedTest'
import { readLastSpeedTestResult, saveLastSpeedTestResult } from './speedTestRepository'

it('U5 FR-011/012/014 SC-002/004: guarda o upload com o último resultado, lê o resultado antigo como "não medido" e trata upload inválido como indisponível', async () => {
  const database = new CatalogDb('contract-064-upload-result')
  const options = { database }
  const table = () => database.table('networkDiagnostics')
  const legacy: SpeedTestResult = {
    version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000,
    downloadMbps: 30, latencyMs: 20, jitterMs: 2, status: 'complete', reason: 'completed',
    durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
  }
  const withUpload: SpeedTestResult = {
    ...legacy, measuredAt: legacy.measuredAt + 60_000, durationMs: 7000,
    uploadMbps: 12.5, uploadSamples: 3, uploadRequestedBytes: 26_000_000, uploadSentBytes: 26_000_000,
  }
  const uploadFailed: SpeedTestResult = {
    ...withUpload, measuredAt: legacy.measuredAt + 120_000, status: 'partial', reason: 'measurement_error',
    uploadMbps: null, uploadSamples: 0, uploadSentBytes: 0,
  }
  try {
    // Resultado de antes da feature: continua válido, sem ganhar upload nem ser migrado ("não medido" = campo ausente).
    await table().put({ ...legacy, id: 'last' })
    const old = await readLastSpeedTestResult(options)
    expect(old).toEqual(legacy)
    expect(old).not.toHaveProperty('uploadMbps')
    expect(await table().get('last')).toEqual({ ...legacy, id: 'last' })

    // Completo com upload é guardado inteiro, e sobrevive ao fechamento.
    expect(await saveLastSpeedTestResult({ state: 'completed', result: withUpload }, options)).toBe('written')
    database.close()
    await database.open()
    expect(await readLastSpeedTestResult(options)).toEqual(withUpload)

    // Upload tentado e sem amostra (null) é diferente de não medido, e o parcial é guardado.
    expect(await saveLastSpeedTestResult({ state: 'completed', result: uploadFailed }, options)).toBe('written')
    expect(await readLastSpeedTestResult(options)).toEqual(uploadFailed)

    // O teto vale para o teste inteiro: etapa de download acima de 75 MB com upload, ou "completo" sem o upload, não entram.
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...withUpload, requestedBytes: 80_000_000, receivedBytes: 80_000_000 } }, options)).toBe('ignored')
    expect(await saveLastSpeedTestResult({ state: 'completed', result: { ...withUpload, uploadMbps: null, uploadSamples: 0, uploadSentBytes: 0 } }, options)).toBe('ignored')
    expect(await readLastSpeedTestResult(options)).toEqual(uploadFailed)

    // Upload inválido no que está gravado vira indisponível; o resto do resultado continua legível e deixa de ser "completo".
    for (const broken of [-5, 0, Number.NaN, 'rápido']) {
      await table().put({ ...withUpload, uploadMbps: broken, id: 'last' })
      expect(await readLastSpeedTestResult(options)).toEqual({
        ...withUpload, status: 'partial', uploadMbps: null, uploadSamples: 0, uploadRequestedBytes: 0, uploadSentBytes: 0,
      })
    }
    expect(await table().count()).toBe(1)
  } finally {
    await database.delete()
  }
})
