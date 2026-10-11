// Probe no browser usa WebCrypto real; não comprova APIs/relógio da TV.
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/')
  const reports = await page.evaluate(async () => {
    const { runPlatformProbe } = await import('/src/lib/portal/platformProbe.ts')
    const options = {
      crypto, storage: localStorage, protocol: location.protocol,
      getDuid: () => 'fake-browser-duid',
    }
    return [await runPlatformProbe(options), await runPlatformProbe(options)]
  })
  for (const report of reports) {
    assert.equal(report.protocol, 'http:')
    for (const key of ['duid', 'es256', 'es256Tamper', 'aesGcm', 'aesAadTamper', 'persistence']) {
      assert.equal(report[key], 'passed', key)
    }
    assert.equal(report.signatureBytes, 64)
    assert.doesNotMatch(JSON.stringify(report), /fake-browser|duidDigest/)
  }
  assert.equal(reports[1].duidStability, 'passed')
  console.log('Portal platform probe: crypto/tamper/persistence HTTP aprovados; TV não presumida.')
} finally {
  await browser.close()
}
